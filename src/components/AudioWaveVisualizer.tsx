import { useEffect } from "react";
import { useVoiceVisualizer, VoiceVisualizer } from "react-voice-visualizer";

interface AudioWaveVisualizerProps {
  isActive: boolean;
  size?: number;
}

export const AudioWaveVisualizer = ({ isActive, size = 120 }: AudioWaveVisualizerProps) => {
  const recorderControls = useVoiceVisualizer();
  const { startRecording, stopRecording, togglePauseResume, isPausedRecording } = recorderControls;

  useEffect(() => {
    if (isActive) {
      startRecording();
    } else {
      stopRecording();
    }
  }, [isActive]);

  return (
    <div style={{ width: size * 2.5, height: size }} className="flex items-center justify-center">
      <VoiceVisualizer
        controls={recorderControls}
        height={size}
        width="100%"
        backgroundColor="transparent"
        mainBarColor="hsl(var(--primary))"
        secondaryBarColor="hsl(var(--primary) / 0.3)"
        speed={2}
        barWidth={3}
        gap={2}
        rounded={10}
        isControlPanelShown={false}
        isDefaultUIShown={false}
        fullscreen={false}
        animateCurrentPick={true}
        onlyRecording={true}
      />
    </div>
  );
};
