import { useState } from "react";
import { MessageCircle, X, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { sendProtocolEmail } from "@/lib/backend";
import { useAuth } from "@/contexts/AuthContext";

interface FeedbackWidgetProps {
  showOnlyOnHome?: boolean;
}

export const FeedbackWidget = ({ showOnlyOnHome = false }: FeedbackWidgetProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  // Don't render if showOnlyOnHome is true and we're not on home
  if (showOnlyOnHome && window.location.pathname !== '/') {
    return null;
  }

  const handleSubmit = async () => {
    if (!feedback.trim()) {
      toast({
        title: "Feedback krävs",
        description: "Vänligen skriv din feedback innan du skickar.",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    try {
      const userEmail = user?.email || 'Ej inloggad';
      const feedbackText = `Betyg: ${rating}/5 stjärnor\n\nAnvändarens e-post: ${userEmail}\n\nFeedback:\n${feedback}`;
      const blob = new Blob([feedbackText], { type: "text/plain" });
      const reader = new FileReader();
      
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        const base64Content = base64.split(',')[1];
        
        await sendProtocolEmail({
          recipients: ["feedback@tivly.se"],
          subject: `Feedback från ${userEmail} - Betyg: ${rating}/5`,
          message: feedbackText,
          documentBlob: base64Content,
          fileName: "feedback.txt",
        });

        toast({
          title: "Tack för din feedback!",
          description: "Vi uppskattar dina synpunkter.",
        });

        setIsOpen(false);
        setRating(0);
        setFeedback("");
      };

      reader.readAsDataURL(blob);
    } catch (error) {
      console.error("Failed to send feedback:", error);
      toast({
        title: "Något gick fel",
        description: "Kunde inte skicka feedback. Försök igen senare.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 rounded-full w-14 h-14 md:w-16 md:h-16 shadow-lg z-50 touch-manipulation"
        size="icon"
      >
        <MessageCircle className="h-6 w-6 md:h-7 md:w-7" />
      </Button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-[calc(100vw-3rem)] max-w-80 bg-card border border-border rounded-lg shadow-xl z-50 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">Ge oss feedback</h3>
        <Button
          onClick={() => setIsOpen(false)}
          variant="ghost"
          size="icon"
          className="h-8 w-8"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">Betygsätt din upplevelse</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                className="transition-colors"
              >
                <Star
                  className={`h-6 w-6 ${
                    star <= rating
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-muted-foreground"
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">
            Vad vill du ha mer av?
          </label>
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Berätta vad du tycker och vad vi kan förbättra..."
            className="min-h-[100px]"
          />
        </div>

        <Button
          onClick={handleSubmit}
          disabled={isSending}
          className="w-full"
        >
          {isSending ? "Skickar..." : "Skicka feedback"}
        </Button>
      </div>
    </div>
  );
};
