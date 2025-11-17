/**
 * Front-End Field-Level Encryption (AES-256-GCM)
 * 
 * Encrypts sensitive request fields before sending to backend.
 * Backend derives per-session keys from JWT + master secret.
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

interface EncryptionKeyBundle {
  algorithm: string;
  key: string;
  keyId: string;
  ivLength: number;
  authTagLength: number;
  aad: string;
  salt: string;
  derivedFrom: string;
  expiresAt: string;
  user: { email: string };
}

interface EncryptedField {
  iv: string;
  ciphertext: string;
  tag: string;
  encoding: 'utf8' | 'json';
  aad?: string;
}

interface EncryptedPayload {
  $encrypted: {
    version: number;
    keyId: string;
    fields: Record<string, EncryptedField>;
  };
  [key: string]: any;
}

// Session storage keys
const ENCRYPTION_KEY_STORAGE = 'tivly_encryption_key';
const CRYPTO_KEY_CACHE = 'tivly_crypto_key_cache';

// Helper functions for base64 encoding/decoding
const decodeBase64 = (value: string): Uint8Array =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

const encodeBase64 = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...Array.from(bytes)));

/**
 * Fetch encryption key bundle from backend
 */
export async function fetchEncryptionKey(authToken: string): Promise<EncryptionKeyBundle> {
  const response = await fetch('https://api.tivly.se/security/encryption-key', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch encryption key');
  }

  const bundle = await response.json();
  
  // Cache in sessionStorage (cleared on logout)
  sessionStorage.setItem(ENCRYPTION_KEY_STORAGE, JSON.stringify(bundle));
  
  return bundle;
}

/**
 * Get cached encryption key bundle or fetch if expired
 */
export async function getEncryptionKeyBundle(authToken: string): Promise<EncryptionKeyBundle> {
  const cached = sessionStorage.getItem(ENCRYPTION_KEY_STORAGE);
  
  if (cached) {
    const bundle: EncryptionKeyBundle = JSON.parse(cached);
    
    // Check if expired
    if (new Date(bundle.expiresAt) > new Date()) {
      return bundle;
    }
  }
  
  // Fetch new key
  return await fetchEncryptionKey(authToken);
}

/**
 * Import AES key from bundle for Web Crypto API
 */
async function importAesKey(bundle: EncryptionKeyBundle): Promise<CryptoKey> {
  const rawKey = decodeBase64(bundle.key);
  return crypto.subtle.importKey('raw', rawKey as BufferSource, 'AES-GCM', false, ['encrypt']);
}

/**
 * Get or import crypto key (cached in memory during session)
 */
let cryptoKeyCache: CryptoKey | null = null;
let cryptoKeyCacheId: string | null = null;

async function getCryptoKey(bundle: EncryptionKeyBundle): Promise<CryptoKey> {
  if (cryptoKeyCache && cryptoKeyCacheId === bundle.keyId) {
    return cryptoKeyCache;
  }
  
  cryptoKeyCache = await importAesKey(bundle);
  cryptoKeyCacheId = bundle.keyId;
  
  return cryptoKeyCache;
}

/**
 * Encrypt a single field value
 */
export async function encryptField(
  bundle: EncryptionKeyBundle,
  fieldPath: string,
  value: any,
  encoding: 'utf8' | 'json' = 'utf8'
): Promise<EncryptedField> {
  const cryptoKey = await getCryptoKey(bundle);
  
  // Generate random IV (96-bit nonce)
  const iv = crypto.getRandomValues(new Uint8Array(bundle.ivLength));
  
  // Prepare payload
  const payload = encoding === 'json'
    ? textEncoder.encode(JSON.stringify(value))
    : textEncoder.encode(String(value));
  
  // Additional authenticated data (field path)
  const additionalData = textEncoder.encode(fieldPath);
  
  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData,
      tagLength: bundle.authTagLength * 8,
    },
    cryptoKey,
    payload
  );
  
  const encryptedBytes = new Uint8Array(encrypted);
  const tag = encryptedBytes.slice(-bundle.authTagLength);
  const ciphertext = encryptedBytes.slice(0, encryptedBytes.length - bundle.authTagLength);
  
  return {
    iv: encodeBase64(iv),
    ciphertext: encodeBase64(ciphertext),
    tag: encodeBase64(tag),
    encoding,
    aad: fieldPath,
  };
}

/**
 * Encrypt multiple fields in a payload - gracefully degrades if encryption fails
 */
export async function encryptPayload(
  authToken: string,
  payload: Record<string, any>,
  fieldsToEncrypt: Array<{ path: string; encoding?: 'utf8' | 'json' }>
): Promise<EncryptedPayload | Record<string, any>> {
  try {
    const bundle = await getEncryptionKeyBundle(authToken);
    
    const encryptedFields: Record<string, EncryptedField> = {};
    const resultPayload = { ...payload };
    
    // Encrypt each specified field
    for (const { path, encoding = 'utf8' } of fieldsToEncrypt) {
      const value = getNestedValue(payload, path);
      
      if (value !== undefined && value !== null) {
        encryptedFields[path] = await encryptField(bundle, path, value, encoding);
        
        // Remove plaintext from payload
        deleteNestedValue(resultPayload, path);
      }
    }
    
    // Add encrypted wrapper
    return {
      $encrypted: {
        version: 1,
        keyId: bundle.keyId,
        fields: encryptedFields,
      },
      ...resultPayload,
    };
  } catch (error) {
    console.warn('⚠️ Encryption failed, sending unencrypted:', error);
    // Return original payload if encryption fails
    return payload;
  }
}

/**
 * Helper to get nested value from object using dot notation
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Helper to delete nested value from object using dot notation
 */
function deleteNestedValue(obj: any, path: string): void {
  const keys = path.split('.');
  const lastKey = keys.pop()!;
  const target = keys.reduce((current, key) => current?.[key], obj);
  
  if (target && typeof target === 'object') {
    delete target[lastKey];
  }
}

/**
 * Clear encryption keys from session (call on logout)
 */
export function clearEncryptionKeys(): void {
  sessionStorage.removeItem(ENCRYPTION_KEY_STORAGE);
  sessionStorage.removeItem(CRYPTO_KEY_CACHE);
  cryptoKeyCache = null;
  cryptoKeyCacheId = null;
}

/**
 * Check if encryption is available
 */
export function isEncryptionAvailable(): boolean {
  return typeof crypto !== 'undefined' && 
         typeof crypto.subtle !== 'undefined' &&
         sessionStorage.getItem(ENCRYPTION_KEY_STORAGE) !== null;
}

/**
 * Sensitive fields that should always be encrypted
 */
export const SENSITIVE_FIELDS = {
  TRANSCRIPT: 'transcript',
  PROTOCOL: 'protocol',
  NOTES: 'notes',
  AGENDA: 'agenda',
  DESCRIPTION: 'description',
  CONTENT: 'content',
  MESSAGE: 'message',
  EMAIL_CONTENT: 'emailContent',
};
