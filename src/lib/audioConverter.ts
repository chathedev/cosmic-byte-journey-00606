// Audio Converter - Convert ALL audio formats to WAV for backend ASR processing
// Backend expects WAV format for transcription (Vertex AI Speech v2)

/**
 * Convert an audio file to WAV format using Web Audio API
 * Backend requires WAV format for transcription
 * ALWAYS converts - even if already WAV (to ensure proper encoding)
 */
export async function convertToWav(audioFile: File | Blob): Promise<Blob> {
  const fileType = audioFile instanceof File ? audioFile.type : audioFile.type;
  const fileName = audioFile instanceof File ? audioFile.name : 'audio';
  
  console.log('🎵 Audio conversion: Starting WAV conversion');
  console.log('  - File name:', fileName);
  console.log('  - File type:', fileType);
  console.log('  - File size:', audioFile.size, 'bytes', `(${(audioFile.size / 1024 / 1024).toFixed(2)}MB)`);

  // Validate input
  if (audioFile.size < 100) {
    throw new Error('Audio file is empty');
  }

  try {
    // Create audio context
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Read file as ArrayBuffer
    const arrayBuffer = await audioFile.arrayBuffer();
    
    // Decode audio data
    console.log('🎵 Decoding audio data...');
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    console.log('🎵 Audio decoded:');
    console.log('  - Duration:', audioBuffer.duration.toFixed(2), 's');
    console.log('  - Sample rate:', audioBuffer.sampleRate);
    console.log('  - Channels:', audioBuffer.numberOfChannels);

    // Convert to WAV
    const wavBlob = audioBufferToWav(audioBuffer);
    
    console.log('✅ Audio conversion complete (WAV)');
    console.log('  - Original size:', audioFile.size, 'bytes');
    console.log('  - WAV size:', wavBlob.size, 'bytes');

    // Close audio context
    await audioContext.close();

    return wavBlob;
  } catch (error: any) {
    console.error('❌ Audio conversion failed:', error);
    throw new Error(`Could not convert audio: ${error.message}`);
  }
}

// Legacy alias for backward compatibility
export const convertToMp3 = convertToWav;

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
 * Check if file needs conversion
 * ALWAYS returns true - we always convert to WAV for consistent backend processing
 */
export function needsConversion(file: File | Blob): boolean {
  // Always convert to WAV for backend compatibility
  // This ensures consistent format regardless of source (recording, upload, etc.)
  return true;
}
