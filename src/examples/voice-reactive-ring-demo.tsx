import { useState } from 'react';
import { VoiceReactiveRing } from '@/components/VoiceReactiveRing';
import { Button } from '@/components/ui/button';

/**
 * Demo component showing VoiceReactiveRing usage
 * 
 * The VoiceReactiveRing can be used in two modes:
 * 1. Standalone - it manages its own microphone stream
 * 2. With external stream - pass a MediaStream from parent component
 */
export const VoiceReactiveRingDemo = () => {
  const [isActive, setIsActive] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-8 p-4">
      <h1 className="text-2xl font-bold">Voice Reactive Ring Demo</h1>
      
      {/* Default size (160px) */}
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-muted-foreground">Default (160px)</p>
        <VoiceReactiveRing isActive={isActive} />
      </div>

      {/* Large size (240px) */}
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-muted-foreground">Large (240px)</p>
        <VoiceReactiveRing size={240} isActive={isActive} />
      </div>

      {/* Small size (80px) */}
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-muted-foreground">Small (80px)</p>
        <VoiceReactiveRing size={80} isActive={isActive} />
      </div>

      <Button onClick={() => setIsActive(!isActive)}>
        {isActive ? 'Stop Listening' : 'Start Listening'}
      </Button>

      <div className="text-center text-sm text-muted-foreground max-w-md">
        <p>Click the button to activate the microphone.</p>
        <p>The ring will pulse based on your voice volume.</p>
        <p>If microphone access is denied, it falls back to a subtle breathing animation.</p>
      </div>
    </div>
  );
};

export default VoiceReactiveRingDemo;
