// Audio Converter - Convert ALL audio formats to MP3 for backend ASR processing
// MP3 is much smaller than WAV, reducing upload times and avoiding 413 errors

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let ffmpegLoading = false;
let ffmpegLoaded = false;

/**
 * Load FFmpeg WASM (lazy loading)
 */
async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpegLoaded && ffmpeg) {
    return ffmpeg;
  }

  if (ffmpegLoading) {
    // Wait for existing load to complete
    while (ffmpegLoading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (ffmpegLoaded && ffmpeg) {
      return ffmpeg;
    }
  }

  ffmpegLoading = true;
  
  try {
    console.log('🎵 Loading FFmpeg WASM...');
    ffmpeg = new FFmpeg();
    
    // Load FFmpeg with CDN
    await ffmpeg.load({
      coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
      wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
    });
    
    ffmpegLoaded = true;
    console.log('✅ FFmpeg WASM loaded successfully');
    return ffmpeg;
  } catch (error) {
    console.error('❌ Failed to load FFmpeg:', error);
    throw error;
  } finally {
    ffmpegLoading = false;
  }
}

/**
 * Convert an audio file to MP3 format using FFmpeg
 * MP3 is much smaller than WAV, reducing upload times
 */
export async function convertToMp3(audioFile: File | Blob): Promise<Blob> {
  const fileName = audioFile instanceof File ? audioFile.name : 'audio';
  const fileType = audioFile.type || 'audio/unknown';
  
  console.log('🎵 Audio conversion: Starting MP3 conversion');
  console.log('  - File name:', fileName);
  console.log('  - File type:', fileType);
  console.log('  - File size:', audioFile.size, 'bytes', `(${(audioFile.size / 1024 / 1024).toFixed(2)}MB)`);

  // Validate input
  if (audioFile.size < 100) {
    throw new Error('Audio file is empty');
  }

  try {
    const ff = await loadFFmpeg();
    
    // Determine input extension
    let inputExt = 'wav';
    if (fileType.includes('mp3') || fileType.includes('mpeg')) {
      inputExt = 'mp3';
    } else if (fileType.includes('webm')) {
      inputExt = 'webm';
    } else if (fileType.includes('ogg')) {
      inputExt = 'ogg';
    } else if (fileType.includes('m4a') || fileType.includes('mp4')) {
      inputExt = 'm4a';
    } else if (fileType.includes('aac')) {
      inputExt = 'aac';
    }
    
    const inputFileName = `input.${inputExt}`;
    const outputFileName = 'output.mp3';
    
    console.log('🎵 FFmpeg: Writing input file...');
    await ff.writeFile(inputFileName, await fetchFile(audioFile));
    
    console.log('🎵 FFmpeg: Converting to MP3...');
    // Convert to MP3 with good quality (128kbps, mono for speech)
    await ff.exec([
      '-i', inputFileName,
      '-vn',                    // No video
      '-acodec', 'libmp3lame',  // MP3 codec
      '-ab', '128k',            // 128kbps bitrate (good for speech)
      '-ac', '1',               // Mono (speech doesn't need stereo)
      '-ar', '44100',           // 44.1kHz sample rate
      '-y',                     // Overwrite output
      outputFileName
    ]);
    
    console.log('🎵 FFmpeg: Reading output file...');
    const outputData = await ff.readFile(outputFileName);
    
    // Clean up
    await ff.deleteFile(inputFileName);
    await ff.deleteFile(outputFileName);
    
    // Convert Uint8Array to Blob (handle type compatibility)
    const mp3Blob = new Blob([new Uint8Array(outputData as Uint8Array)], { type: 'audio/mpeg' });
    
    const compressionRatio = ((1 - mp3Blob.size / audioFile.size) * 100).toFixed(1);
    console.log('✅ Audio conversion complete (MP3)');
    console.log('  - Original size:', audioFile.size, 'bytes', `(${(audioFile.size / 1024 / 1024).toFixed(2)}MB)`);
    console.log('  - MP3 size:', mp3Blob.size, 'bytes', `(${(mp3Blob.size / 1024 / 1024).toFixed(2)}MB)`);
    console.log('  - Compression:', compressionRatio + '% smaller');

    return mp3Blob;
  } catch (error: any) {
    console.error('❌ FFmpeg conversion failed:', error);
    
    // Fallback to Web Audio API for WAV (less compression but still works)
    console.log('⚠️ Falling back to WAV conversion...');
    return convertToWavFallback(audioFile);
  }
}

/**
 * Fallback: Convert to WAV using Web Audio API
 * Used if FFmpeg fails to load
 */
async function convertToWavFallback(audioFile: File | Blob): Promise<Blob> {
  console.log('🎵 Fallback: Converting to WAV with Web Audio API');
  
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    console.log('🎵 Audio decoded:');
    console.log('  - Duration:', audioBuffer.duration.toFixed(2), 's');
    console.log('  - Sample rate:', audioBuffer.sampleRate);
    console.log('  - Channels:', audioBuffer.numberOfChannels);

    const wavBlob = audioBufferToWav(audioBuffer);
    
    console.log('⚠️ Fallback complete (WAV - larger file)');
    console.log('  - WAV size:', wavBlob.size, 'bytes', `(${(wavBlob.size / 1024 / 1024).toFixed(2)}MB)`);

    await audioContext.close();
    return wavBlob;
  } catch (error: any) {
    console.error('❌ WAV fallback also failed:', error);
    throw new Error(`Could not convert audio: ${error.message}`);
  }
}

/**
 * Convert AudioBuffer to WAV Blob
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = 1; // Force mono for smaller files
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  // Get mono samples (average if stereo)
  let samples: Float32Array;
  if (buffer.numberOfChannels === 2) {
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    samples = new Float32Array(left.length);
    for (let i = 0; i < left.length; i++) {
      samples[i] = (left[i] + right[i]) / 2;
    }
  } else {
    samples = buffer.getChannelData(0);
  }

  const dataLength = samples.length * (bitDepth / 8);
  const wavBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(wavBuffer);

  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  floatTo16BitPCM(view, 44, samples);

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

// Legacy alias
export const convertToWav = convertToMp3;

/**
 * Always needs conversion - we always convert to MP3
 */
export function needsConversion(file: File | Blob): boolean {
  return true;
}
