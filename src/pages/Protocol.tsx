import { AutoProtocolGenerator } from "@/components/AutoProtocolGenerator";
import { useNavigate, useLocation } from "react-router-dom";
import { useSubscription } from "@/contexts/SubscriptionContext";

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

const Protocol = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userPlan } = useSubscription();
  
  const state = location.state as { 
    transcript: string; 
    aiProtocol: AIProtocol | null;
  };

  // Redirect if no data
  if (!state?.transcript) {
    navigate('/', { replace: true });
    return null;
  }

  const handleBack = () => {
    navigate('/', { replace: true });
  };

  return (
    <AutoProtocolGenerator
      transcript={state.transcript}
      aiProtocol={state.aiProtocol}
      onBack={handleBack}
      isFreeTrialMode={userPlan?.plan === 'free'}
    />
  );
};

export default Protocol;
