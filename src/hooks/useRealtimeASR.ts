import { useState, useRef, useCallback, useEffect } from 'react';

const API_HOST = 'api.tivly.se';

interface RealtimeASRMessage {
  type: 'partial' | 'final' | 'done' | 'error';
  text?: string;
  offset?: number;
  duration?: number;
  transcript?: string;
  message?: string;
}

interface UseRealtimeASROptions {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onDone?: (transcript: string) => void;
  onError?: (message: string) => void;
}

export function useRealtimeASR(options: UseRealtimeASROptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [partialText, setPartialText] = useState('');
  const [finalText, setFinalText] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const meetingIdRef = useRef<string | null>(null);

  // Convert Float32Array to 16-bit PCM (little endian)
  const float32ToPCM16 = useCallback((float32: Float32Array): ArrayBuffer => {
    const buffer = new ArrayBuffer(float32.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
      view.setInt16(i * 2, val, true); // little endian
    }
    return buffer;
  }, []);

  // Downsample from source rate to 16kHz
  const downsample = useCallback((buffer: Float32Array, fromRate: number, toRate: number): Float32Array => {
    if (fromRate === toRate) return buffer;
    const ratio = fromRate / toRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const idx = Math.floor(i * ratio);
      result[i] = buffer[idx];
    }
    return result;
  }, []);

  const connect = useCallback(async (meetingId: string, stream: MediaStream) => {
    if (wsRef.current) {
      console.log('⚠️ Realtime ASR already connected');
      return;
    }

    setIsConnecting(true);
    setError(null);
    meetingIdRef.current = meetingId;

    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        throw new Error('No auth token available');
      }

      // Create WebSocket connection
      const wsUrl = `wss://${API_HOST}/asr/realtime?meetingId=${encodeURIComponent(meetingId)}`;
      console.log('🔌 Connecting to realtime ASR:', wsUrl);
      
      const ws = new WebSocket(wsUrl, ['authorization', token]);
      
      ws.onopen = () => {
        console.log('✅ Realtime ASR WebSocket connected');
        setIsConnected(true);
        setIsConnecting(false);
        
        // Start audio processing
        setupAudioProcessing(stream, ws);
      };

      ws.onmessage = (event) => {
        try {
          const msg: RealtimeASRMessage = JSON.parse(event.data);
          console.log('📨 ASR message:', msg.type, msg.text?.substring(0, 50) || msg.transcript?.substring(0, 50) || '');
          
          switch (msg.type) {
            case 'partial':
              setPartialText(msg.text || '');
              options.onPartial?.(msg.text || '');
              break;
            case 'final':
              setFinalText(prev => prev + (prev ? ' ' : '') + (msg.text || ''));
              setPartialText('');
              options.onFinal?.(msg.text || '');
              break;
            case 'done':
              setPartialText('');
              options.onDone?.(msg.transcript || finalText);
              break;
            case 'error':
              setError(msg.message || 'Unknown error');
              options.onError?.(msg.message || 'Unknown error');
              break;
          }
        } catch (e) {
          console.error('Failed to parse ASR message:', e);
        }
      };

      ws.onerror = (event) => {
        console.error('❌ Realtime ASR WebSocket error:', event);
        setError('WebSocket connection error');
        setIsConnecting(false);
      };

      ws.onclose = (event) => {
        console.log('🔌 Realtime ASR WebSocket closed:', event.code, event.reason);
        setIsConnected(false);
        setIsConnecting(false);
        wsRef.current = null;
        cleanupAudio();
      };

      wsRef.current = ws;
    } catch (e: any) {
      console.error('❌ Failed to connect realtime ASR:', e);
      setError(e.message || 'Connection failed');
      setIsConnecting(false);
    }
  }, [options, finalText]);

  const setupAudioProcessing = useCallback((stream: MediaStream, ws: WebSocket) => {
    try {
      // Create audio context at 16kHz for direct processing, or use default and downsample
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000,
      });
      
      // Fallback if 16kHz not supported
      const actualSampleRate = audioContext.sampleRate;
      console.log('🎤 Audio context sample rate:', actualSampleRate);
      
      const source = audioContext.createMediaStreamSource(stream);
      
      // ScriptProcessor for audio chunks (4096 samples = ~256ms at 16kHz)
      const bufferSize = 4096;
      const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
      
      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Downsample if needed
        const samples = actualSampleRate === 16000 
          ? inputData 
          : downsample(inputData, actualSampleRate, 16000);
        
        // Convert to PCM16 and send as binary
        const pcmData = float32ToPCM16(samples);
        ws.send(pcmData);
      };
      
      source.connect(processor);
      processor.connect(audioContext.destination);
      
      audioContextRef.current = audioContext;
      processorRef.current = processor;
      sourceRef.current = source;
      
      console.log('✅ Audio processing started');
    } catch (e) {
      console.error('❌ Failed to setup audio processing:', e);
    }
  }, [float32ToPCM16, downsample]);

  const cleanupAudio = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  const stop = useCallback(async () => {
    if (!wsRef.current) return;
    
    console.log('🛑 Stopping realtime ASR...');
    
    // Send stop message
    try {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'stop' }));
        
        // Wait a moment for 'done' message
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (e) {
      console.error('Error sending stop:', e);
    }
    
    // Close connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    cleanupAudio();
    setIsConnected(false);
  }, [cleanupAudio]);

  const pause = useCallback(() => {
    cleanupAudio();
    console.log('⏸️ Realtime ASR paused');
  }, [cleanupAudio]);

  const resume = useCallback((stream: MediaStream) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setupAudioProcessing(stream, wsRef.current);
      console.log('▶️ Realtime ASR resumed');
    }
  }, [setupAudioProcessing]);

  const reset = useCallback(() => {
    setPartialText('');
    setFinalText('');
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      cleanupAudio();
    };
  }, [cleanupAudio]);

  return {
    isConnected,
    isConnecting,
    partialText,
    finalText,
    fullTranscript: finalText + (partialText ? ' ' + partialText : ''),
    error,
    connect,
    stop,
    pause,
    resume,
    reset,
  };
}
