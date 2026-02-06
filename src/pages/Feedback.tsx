import { useState } from "react";
import { Star, Send, MessageCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { sendProtocolEmail } from "@/lib/backend";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

const RATE_LIMIT_KEY = "feedback_last_submission";
const RATE_LIMIT_HOURS = 1;

const Feedback = () => {
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const checkRateLimit = (): boolean => {
    const lastSubmission = localStorage.getItem(RATE_LIMIT_KEY);
    if (!lastSubmission) return true;

    const lastTime = new Date(lastSubmission).getTime();
    const now = Date.now();
    const hoursPassed = (now - lastTime) / (1000 * 60 * 60);

    return hoursPassed >= RATE_LIMIT_HOURS;
  };

  const getTimeUntilNextSubmission = (): string => {
    const lastSubmission = localStorage.getItem(RATE_LIMIT_KEY);
    if (!lastSubmission) return "";

    const lastTime = new Date(lastSubmission).getTime();
    const now = Date.now();
    const minutesLeft = Math.ceil((RATE_LIMIT_HOURS * 60) - ((now - lastTime) / (1000 * 60)));

    if (minutesLeft <= 0) return "";
    if (minutesLeft < 60) return `${minutesLeft} minuter`;
    return `${Math.ceil(minutesLeft / 60)} timmar`;
  };

  const handleSubmit = async () => {
    if (!feedback.trim()) {
      toast({
        title: "Feedback krävs",
        description: "Vänligen skriv din feedback innan du skickar.",
        variant: "destructive",
      });
      return;
    }

    if (!checkRateLimit()) {
      const timeLeft = getTimeUntilNextSubmission();
      toast({
        title: "Tack, vi har din feedback!",
        description: `Du kan skicka ny feedback igen om ${timeLeft}. Vi uppskattar din input! 🙏`,
      });
      return;
    }

    setIsSending(true);
    try {
      const userEmail = user?.email || 'Ej inloggad';
      const feedbackText = `Betyg: ${rating}/5 stjärnor\n\nFeedback:\n${feedback}\n\nfrån användaren: ${userEmail}`;
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

        localStorage.setItem(RATE_LIMIT_KEY, new Date().toISOString());

        toast({
          title: "Tack för din feedback!",
          description: "Vi uppskattar dina synpunkter.",
        });

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

  const canSubmit = checkRateLimit();
  const timeLeft = getTimeUntilNextSubmission();

  return (
    <div className="animate-fade-in">
          
          <div className="container max-w-2xl mx-auto p-6 md:p-8">
            <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
              {/* Header */}
              <div className="text-center space-y-3">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-2">
                  <MessageCircle className="w-8 h-8 text-primary" />
                </div>
                <h1 className="text-3xl md:text-4xl font-bold text-foreground">
                  Ge oss feedback
                </h1>
                <p className="text-muted-foreground text-lg">
                  Vi uppskattar dina synpunkter och förslag för att göra Tivly ännu bättre
                </p>
              </div>

              {/* Rate Limit Notice */}
              {!canSubmit && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <Clock className="w-5 h-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-medium text-foreground">Tack för din feedback! 🎉</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Du kan skicka ny feedback igen om <strong>{timeLeft}</strong>. Vi läser allt noggrant!
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Feedback Form */}
              <Card className="hover:shadow-lg transition-all duration-300">
                <CardHeader>
                  <CardTitle>Din feedback</CardTitle>
                  <CardDescription>
                    Betygsätt din upplevelse och berätta vad vi kan förbättra
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Star Rating */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium">Betygsätt din upplevelse</label>
                    <div className="flex gap-2 justify-center md:justify-start">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => setRating(star)}
                          className="transition-all hover:scale-110 touch-manipulation"
                          disabled={!canSubmit}
                        >
                          <Star
                            className={`h-10 w-10 transition-colors ${
                              star <= rating
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-muted-foreground hover:text-yellow-400"
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                    {rating > 0 && (
                      <p className="text-sm text-center md:text-left text-muted-foreground">
                        Du har valt {rating} av 5 stjärnor
                      </p>
                    )}
                  </div>

                  {/* Feedback Text */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium">
                      Vad vill du ha mer av?
                    </label>
                    <Textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="Berätta vad du tycker och vad vi kan förbättra..."
                      className="min-h-[200px] resize-none"
                      disabled={!canSubmit}
                    />
                    <p className="text-xs text-muted-foreground">
                      {feedback.length} tecken
                    </p>
                  </div>

                  {/* Submit Button */}
                  <Button
                    onClick={handleSubmit}
                    disabled={isSending || !canSubmit || !feedback.trim()}
                    className="w-full h-12 text-base"
                    size="lg"
                  >
                    {isSending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        Skickar...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Skicka feedback
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Info Card */}
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">
                    <strong className="text-foreground">OBS:</strong> Du kan skicka feedback en gång per timme. 
                    Vi läser all feedback noggrant och använder den för att förbättra Tivly.
                  </p>
                </CardContent>
              </Card>
            </div>
        </div>
    </div>
  );
};

export default Feedback;
