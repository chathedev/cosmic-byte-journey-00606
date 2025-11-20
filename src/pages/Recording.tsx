import { RecordingView } from "@/components/RecordingView";
import { useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";

interface AIActionItem {
  title: string;
  description?: string;
  owner?: string;
  deadline?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

interface AIProtocol {
  title: string;
  summary: string;
  mainPoints: string[];
  decisions: string[];
  actionItems: AIActionItem[];
  nextMeetingSuggestions?: string[];
}

const Recording = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { 
    continuedMeeting?: any; 
    isFreeTrialMode?: boolean;
    selectedLanguage?: 'sv-SE' | 'en-US';
  } || {};

  const handleFinishRecording = (data: { transcript: string; aiProtocol: AIProtocol | null }) => {
    // Navigate to protocol view with data
    navigate('/protocol', { 
      state: { 
        transcript: data.transcript, 
        aiProtocol: data.aiProtocol 
      },
      replace: true
    });
  };

  const handleBack = () => {
    navigate('/', { replace: true });
  };

  // Use continuedMeeting.id as key to force remount when starting new meeting
  const recordingKey = state.continuedMeeting?.id || 'new';

  return (
    <RecordingView
      key={recordingKey}
      onFinish={handleFinishRecording}
      onBack={handleBack}
      continuedMeeting={state.continuedMeeting}
      isFreeTrialMode={state.isFreeTrialMode || false}
      selectedLanguage={state.selectedLanguage || 'sv-SE'}
    />
  );
};

export default Recording;
