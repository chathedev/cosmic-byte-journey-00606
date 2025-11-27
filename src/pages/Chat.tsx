import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useNavigate } from "react-router-dom";
import { meetingStorage, type MeetingSession } from "@/utils/meetingStorage";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle, Send, Loader2, Lock, TrendingUp, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SubscribeDialog } from "@/components/SubscribeDialog";
import { hasPlusAccess } from "@/lib/accessCheck";

interface Message {
  role: "user" | "assistant";
  content: string;
  meetingReference?: {
    meetingId: string;
    meetingTitle: string;
  };
}

const TypewriterText = ({ text }: { text: string }) => {
  const [displayedText, setDisplayedText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Quick loading animation
    const loadingTimer = setTimeout(() => {
      setIsLoading(false);
    }, 400);

    return () => clearTimeout(loadingTimer);
  }, []);

  useEffect(() => {
    if (!isLoading && currentIndex < text.length) {
      // Fast, smooth typing animation
      const timeout = setTimeout(() => {
        setDisplayedText(text.slice(0, currentIndex + 1));
        setCurrentIndex(currentIndex + 1);
      }, 15);
      return () => clearTimeout(timeout);
    }
  }, [text, currentIndex, isLoading]);

  if (isLoading) {
    return (
      <span className="inline-block min-w-[60px] h-5 rounded-md bg-muted/60 animate-pulse" 
        style={{ 
          animationDuration: '0.8s',
          animationTimingFunction: 'ease-in-out'
        }} 
      />
    );
  }

  return (
    <span className="whitespace-pre-wrap">
      {displayedText}
      {currentIndex < text.length && (
        <span className="inline-block w-0.5 h-5 bg-primary ml-1 animate-pulse" />
      )}
    </span>
  );
};

export const Chat = () => {
  const { user } = useAuth();
  const { userPlan, isLoading: planLoading } = useSubscription();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [meetings, setMeetings] = useState<MeetingSession[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>("all");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSubscribeDialog, setShowSubscribeDialog] = useState(false);
  const [streamingIndex, setStreamingIndex] = useState<number | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);

  const isPlusUser = hasPlusAccess(user, userPlan);

  useEffect(() => {
    loadMeetings();
  }, [user]);

  const loadMeetings = async () => {
    if (!user) return;
    try {
      const userMeetings = await meetingStorage.getMeetings(user.uid);
      const filtered = userMeetings.filter(m => 
        m.transcript && 
        m.transcript.length > 20 && 
        !['__Trash', '_Trash'].includes(String(m.folder))
      );
      setMeetings(filtered);
    } catch (error) {
      console.error('Failed to load meetings:', error);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    if (!isPlusUser) {
      setShowSubscribeDialog(true);
      return;
    }

    const userMessage = input.trim();
    setInput("");

    const newMessages = [...messages, { role: "user" as const, content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      let transcriptContext = "";
      if (selectedMeetingId === "all") {
        transcriptContext = meetings.map(m => `[${m.title}]: ${m.transcript}`).join("\n\n");
      } else {
        const meeting = meetings.find(m => m.id === selectedMeetingId);
        if (meeting) {
          transcriptContext = meeting.transcript || "";
        }
      }

      const abort = new AbortController();
      setController(abort);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meeting-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: newMessages,
            transcript: transcriptContext,
          }),
          signal: abort.signal,
        }
      );

      if (response.status === 429) {
        toast({
          title: "För många förfrågningar",
          description: "Vänligen vänta en stund innan du försöker igen.",
          variant: "destructive",
        });
        setMessages(messages);
        setIsLoading(false);
        return;
      }

      if (response.status === 402) {
        toast({
          title: "Betalning krävs",
          description: "Vänligen lägg till krediter för att använda AI-chatten.",
          variant: "destructive",
        });
        setMessages(messages);
        setIsLoading(false);
        return;
      }

      if (!response.ok || !response.body) {
        throw new Error("Failed to start stream");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;
      let assistantContent = "";

      setStreamingIndex(newMessages.length);

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) =>
                    i === prev.length - 1 ? { ...m, content: assistantContent } : m
                  );
                }
                return [...prev, { role: "assistant", content: assistantContent }];
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      setStreamingIndex(null);
      setIsLoading(false);
      setController(null);

    } catch (error) {
      console.error("Chat error:", error);
      toast({
        title: "Fel",
        description: "Kunde inte skicka meddelandet. Försök igen.",
        variant: "destructive",
      });
      setMessages(messages);
      setStreamingIndex(null);
      setIsLoading(false);
      setController(null);
    }
  };

  const handleStop = () => {
    controller?.abort();
    setIsLoading(false);
    setStreamingIndex(null);
    setController(null);
  };

  if (planLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">Laddar...</p>
      </div>
    </div>
  );

  if (!isPlusUser) {
    return (
      <>
        <div className="sticky top-0 z-40 bg-background border-b px-4 py-3 flex items-center gap-2">
          <h1 className="text-lg font-semibold">AI Möteschatt</h1>
        </div>
        <div className="flex items-center justify-center min-h-[70vh] px-4">
          <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                <Lock className="w-8 h-8 text-muted-foreground" />
              </div>
              <CardTitle className="text-2xl">Uppgradera till Tivly Plus</CardTitle>
              <CardDescription className="text-base mt-2">
                AI Möteschatt är en exklusiv funktion för Plus-användare. Chatta med AI om alla dina möten!
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium">Med Plus får du:</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>✓ AI-chatt över alla möten</li>
                  <li>✓ Sök i alla transkriptioner</li>
                  <li>✓ Hitta citat och beslut snabbt</li>
                  <li>✓ Navigera mellan möten direkt</li>
                </ul>
              </div>
              <Button className="w-full" size="lg" onClick={() => setShowSubscribeDialog(true)}>
                <TrendingUp className="mr-2 h-4 w-4" />
                Uppgradera till Tivly Plus
              </Button>
              <Button variant="outline" className="w-full" onClick={() => navigate('/')}>Tillbaka till start</Button>
            </CardContent>
          </Card>
        </div>
        <SubscribeDialog open={showSubscribeDialog} onOpenChange={setShowSubscribeDialog} />
      </>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-background">
      {/* Desktop: Takes remaining space, Mobile: Full screen */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b bg-background px-5 py-4 flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-primary" />
              </div>
              <h1 className="text-base font-semibold text-foreground">AI Möteschatt</h1>
            </div>
            <div className="flex items-center gap-2">
              <Select value={selectedMeetingId} onValueChange={setSelectedMeetingId}>
                <SelectTrigger className="w-[180px] h-9 text-sm bg-background border-border/50">
                  <SelectValue placeholder="Välj möte" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla möten</SelectItem>
                  {meetings.map(meeting => (
                    <SelectItem key={meeting.id} value={meeting.id}>
                      {meeting.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {messages.length > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setMessages([])}
                  className="h-9 text-sm"
                >
                  Rensa
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Chat Messages */}
        <ScrollArea className="flex-1">
          <div className="p-5 space-y-5 max-w-3xl mx-auto w-full">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-4">
                  <MessageCircle className="w-8 h-8 text-primary" />
                </div>
                <p className="text-base text-muted-foreground mb-8">
                  Ställ frågor om dina möten
                </p>
                <div className="grid grid-cols-1 gap-3 w-full max-w-md">
                  {[
                    "Sammanfatta senaste mötet",
                    "Vilka beslut togs?",
                    "Visa åtgärdspunkter"
                  ].map((text) => (
                    <Button 
                      key={text} 
                      variant="outline" 
                      onClick={() => setInput(text)}
                      className="h-auto py-3 text-sm justify-start hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-colors"
                    >
                      {text}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0 mt-1">
                      <MessageCircle className="w-4 h-4 text-primary" />
                    </div>
                  )}
                  
                  <div
                    className={`max-w-[80%] rounded-xl px-4 py-3 text-base ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 text-foreground border border-border/50"
                    }`}
                  >
                    {msg.role === "assistant" && streamingIndex === idx ? (
                      <TypewriterText text={msg.content} />
                    ) : (
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    )}
                    {msg.meetingReference && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 w-full text-sm h-8 hover:bg-primary/10 hover:text-primary"
                        onClick={() => navigate(`/library?highlight=${msg.meetingReference?.meetingId}`)}
                      >
                        <ExternalLink className="w-3 h-3 mr-1.5" />
                        {msg.meetingReference.meetingTitle}
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t bg-background p-4 flex-shrink-0">
          <div className="flex gap-3 max-w-3xl mx-auto w-full">
            <Input
              placeholder="Skriv din fråga..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              disabled={isLoading}
              className="flex-1 h-11 text-base border-border/50 focus-visible:ring-primary"
            />
            {isLoading ? (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={handleStop}
                className="h-11 px-4 hover:bg-destructive/10 hover:text-destructive"
              >
                <Loader2 className="w-5 h-5 animate-spin" />
              </Button>
            ) : (
              <Button 
                onClick={handleSend} 
                disabled={!input.trim()}
                size="sm"
                className="h-11 px-4 bg-primary hover:bg-primary/90"
              >
                <Send className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
