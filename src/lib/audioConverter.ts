// Audio Converter - Convert audio formats to MP3 for backend ASR processing
import { debugLog, debugError } from './debugLogger';

/**
 * Convert an audio file to MP3 format using Web Audio API
 * Backend expects MP3 format for transcription
 */
export async function convertToMp3(audioFile: File | Blob): Promise<Blob> {
  const fileType = audioFile instanceof File ? audioFile.type : audioFile.type;
  const fileName = audioFile instanceof File ? audioFile.name : 'audio';
  
  debugLog('🎵 Audio conversion: Starting', {
    fileName,
    fileType,
    fileSize: `${(audioFile.size / 1024 / 1024).toFixed(2)}MB`
  });

  // If already MP3, return as-is
  if (fileType === 'audio/mpeg' || fileType === 'audio/mp3' || fileName.toLowerCase().endsWith('.mp3')) {
    debugLog('🎵 Already MP3 format, skipping conversion');
    return audioFile;
  }

  try {
    // Create audio context
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Read file as ArrayBuffer
    const arrayBuffer = await audioFile.arrayBuffer();
    
    // Decode audio data
    debugLog('🎵 Decoding audio data...');
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    debugLog('🎵 Audio decoded', {
      duration: `${audioBuffer.duration.toFixed(2)}s`,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels
    });

    // Convert to WAV first (as intermediate format), then we'll send as WAV
    // Backend can handle WAV, but MP3 is preferred for size
    // For now, convert to WAV since browser can't natively encode MP3
    const wavBlob = audioBufferToWav(audioBuffer);
    
    debugLog('✅ Audio conversion complete (WAV intermediate)', {
      originalSize: `${(audioFile.size / 1024 / 1024).toFixed(2)}MB`,
      wavSize: `${(wavBlob.size / 1024 / 1024).toFixed(2)}MB`
    });

    // Close audio context
    await audioContext.close();

    return wavBlob;
  } catch (error: any) {
    debugError('❌ Audio conversion failed:', error);
    throw new Error(`Could not convert audio: ${error.message}`);
  }
}

// Legacy alias for backward compatibility
export const convertToWav = convertToMp3;

/**
 * Convert AudioBuffer to WAV Blob
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  // Get interleaved samples
  let interleaved: Float32Array;
  if (numChannels === 2) {
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    interleaved = new Float32Array(left.length + right.length);
    for (let i = 0; i < left.length; i++) {
      interleaved[i * 2] = left[i];
      interleaved[i * 2 + 1] = right[i];
    }
  } else {
    interleaved = buffer.getChannelData(0);
  }

  // Create WAV file
  const dataLength = interleaved.length * (bitDepth / 8);
  const wavBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(wavBuffer);

  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // Write audio samples
  floatTo16BitPCM(view, 44, interleaved);

  return new Blob([wavBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function floatTo16BitPCM(view: DataView, offset: number, input: Float32Array): void {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

/**
 * Check if file needs conversion (not MP3/WAV)
 */
export function needsConversion(file: File | Blob): boolean {
  const type = file.type;
  const name = file instanceof File ? file.name.toLowerCase() : '';
  
  // MP3 and WAV don't need conversion - backend accepts both
  const isNativeFormat = 
    type === 'audio/mpeg' || 
    type === 'audio/mp3' || 
    type === 'audio/wav' || 
    type === 'audio/wave' || 
    type === 'audio/x-wav' ||
    name.endsWith('.mp3') ||
    name.endsWith('.wav');
    
  return !isNativeFormat;
}
