/**
 * Translates common English backend error messages to Swedish.
 * Falls back to the original message if no translation is found.
 */

const ERROR_TRANSLATIONS: Record<string, string> = {
  // Domain / SSO
  'Disable enterprise SSO before removing the last verified login domain':
    'Inaktivera enterprise SSO innan du tar bort den sista verifierade inloggningsdomänen',
  'disable enterprise sso before removing the last verified login domain':
    'Inaktivera enterprise SSO innan du tar bort den sista verifierade inloggningsdomänen',
  'Domain already exists': 'Domänen finns redan',
  'Domain not found': 'Domänen hittades inte',
  'Domain verification failed': 'Domänverifiering misslyckades',
  'Invalid hostname': 'Ogiltigt värdnamn',
  'Hostname is required': 'Värdnamn krävs',
  'A verified domain is required to enable SSO': 'En verifierad domän krävs för att aktivera SSO',

  // Auth / permissions
  'Unauthorized': 'Obehörig åtkomst',
  'Forbidden': 'Åtkomst nekad',
  'Not found': 'Hittades inte',
  'Invalid token': 'Ogiltig token',
  'Token expired': 'Token har gått ut',
  'Session expired': 'Sessionen har gått ut',
  'Too many attempts': 'För många försök',
  'Too many requests': 'För många förfrågningar',
  'Access denied': 'Åtkomst nekad',
  'Permission denied': 'Behörighet nekad',
  'Insufficient permissions': 'Otillräckliga behörigheter',

  // SSO
  'SSO provider not configured': 'SSO-leverantören är inte konfigurerad',
  'SSO provider not found': 'SSO-leverantören hittades inte',
  'SSO connection failed': 'SSO-anslutning misslyckades',
  'SSO test failed': 'SSO-test misslyckades',
  'Provider already exists': 'Leverantören finns redan',
  'Provider not found': 'Leverantören hittades inte',
  'Invalid provider configuration': 'Ogiltig leverantörskonfiguration',
  'Client ID is required': 'Client ID krävs',
  'Issuer URL is required': 'Issuer-URL krävs',

  // Enterprise
  'Enterprise plan required': 'Enterprise-plan krävs',
  'Company not found': 'Företaget hittades inte',
  'Setting is locked': 'Inställningen är låst',
  'Setting is locked by an administrator': 'Inställningen är låst av en administratör',
  'Role not found': 'Rollen hittades inte',
  'Role is in use': 'Rollen används',
  'Cannot delete system role': 'Kan inte ta bort systemroll',

  // General
  'Internal server error': 'Internt serverfel',
  'Service unavailable': 'Tjänsten är inte tillgänglig',
  'Bad request': 'Ogiltig förfrågan',
  'Request failed': 'Förfrågan misslyckades',
  'Network error': 'Nätverksfel',
  'Failed to fetch': 'Kunde inte ansluta till servern',
  'Request timeout': 'Förfrågan tog för lång tid',
};

// Pattern-based translations for partial matches
const ERROR_PATTERNS: Array<[RegExp, string]> = [
  [/Request failed \((\d+)\)/, 'Förfrågan misslyckades (felkod $1)'],
  [/rate limit/i, 'Hastighetsbegränsning uppnådd, försök igen senare'],
  [/already exists/i, 'Finns redan'],
  [/not found/i, 'Hittades inte'],
  [/is required/i, 'Krävs'],
  [/failed to fetch/i, 'Kunde inte ansluta till servern'],
  [/network\s?error/i, 'Nätverksfel – kontrollera din internetanslutning'],
];

export function translateError(message: string | undefined | null): string {
  if (!message) return 'Ett okänt fel uppstod';

  const trimmed = message.trim();

  // Exact match (case-insensitive)
  const lower = trimmed.toLowerCase();
  for (const [key, value] of Object.entries(ERROR_TRANSLATIONS)) {
    if (key.toLowerCase() === lower) return value;
  }

  // Pattern match
  for (const [pattern, replacement] of ERROR_PATTERNS) {
    if (pattern.test(trimmed)) {
      return trimmed.replace(pattern, replacement);
    }
  }

  // If message looks English (starts with uppercase ASCII, contains common English words), return generic
  if (/^[A-Z][a-z]/.test(trimmed) && /\b(the|is|are|was|not|before|after|failed|error|invalid|required|cannot|could|should|must|has|have|been|this|that|with|from|for)\b/i.test(trimmed)) {
    return 'Ett fel uppstod. Försök igen eller kontakta support.';
  }

  return trimmed;
}
