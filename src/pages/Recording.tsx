import { RecordingViewNew } from "@/components/RecordingViewNew";
import { useNavigate, useLocation } from "react-router-dom";

const Recording = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { 
    continuedMeeting?: any; 
    isFreeTrialMode?: boolean;
    selectedLanguage?: 'sv-SE' | 'en-US';
  } || {};

  const handleBack = () => {
    navigate('/', { replace: true });
  };

  // Use continuedMeeting.id as key to force remount when starting new meeting
  const recordingKey = state.continuedMeeting?.id || 'new';

  return (
    <RecordingViewNew
      key={recordingKey}
      onBack={handleBack}
      continuedMeeting={state.continuedMeeting}
      isFreeTrialMode={state.isFreeTrialMode || false}
      selectedLanguage={state.selectedLanguage || 'sv-SE'}
    />
  );
};

export default Recording;
