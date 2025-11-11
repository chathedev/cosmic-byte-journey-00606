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
import { MessageCircle, Send, Loader2, Sparkles, ExternalLink, Lock, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
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

  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(text.slice(0, currentIndex + 1));
        setCurrentIndex(currentIndex + 1);
      }, 12);
      return () => clearTimeout(timeout);
    }
  }, [text, currentIndex]);

  return (
    <span className="whitespace-pre-wrap">
      {displayedText}
      {currentIndex < text.length && (
        <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-pulse" />
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

  // Allow Plus users and users with admin-granted unlimited access
  const isPlusUser = hasPlusAccess(user, userPlan);

  useEffect(() => {
    loadMeetings();
  }, [user]);

  const loadMeetings = async () => {
    if (!user) return;
    try {
      const userMeetings = await meetingStorage.getMeetings(user.uid);
      // Filter out trash meetings and meetings without sufficient transcript
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
      // Don't show toast - just open the subscribe dialog
      setShowSubscribeDialog(true);
      return;
    }

    const userMessage = input.trim();
    setInput("");

    const newMessages = [...messages, { role: "user" as const, content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      // Get relevant transcripts
      let transcriptContext = "";
      if (selectedMeetingId === "all") {
        // Search across all meetings
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

      // TODO: Implement cross-meeting search and reference detection
      // This would analyze the response for meeting references and add navigation buttons

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
  if (planLoading) return <div className="flex items-center justify-center min-h-[50vh]"><div className="text-muted-foreground">Laddar...</div></div>;

  if (!isPlusUser) {
    return (
      <>
        <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center gap-2">
          <h1 className="text-lg font-semibold">AI Möteschatt</h1>
        </div>
        <div className="flex items-center justify-center min-h-[70vh] px-4 animate-fade-in">
          <Card className="max-w-md w-full animate-scale-in">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                <Lock className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-2xl">Uppgradera till Plus</CardTitle>
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
                Uppgradera till Plus
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
    <div className="flex flex-col h-screen bg-gradient-to-b from-background via-background to-muted/20 animate-fade-in">
      {/* Modern Header */}
      <div className="border-b bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="container max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg">
                  <Sparkles className="w-5 h-5 text-primary-foreground" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-background" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                  AI Möteschatt
                </h1>
                <p className="text-xs text-muted-foreground">Powered by AI</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Select value={selectedMeetingId} onValueChange={setSelectedMeetingId}>
                <SelectTrigger className="w-[200px] bg-background/60 border-primary/20 hover:border-primary/40 transition-colors">
                  <SelectValue placeholder="Välj möte" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">🔍 Alla möten</SelectItem>
                  {meetings.map(meeting => (
                    <SelectItem key={meeting.id} value={meeting.id}>
                      📋 {meeting.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {messages.length > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setMessages([])}
                  className="hover:bg-destructive/10 hover:text-destructive"
                >
                  Rensa
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Chat Messages Area */}
      <ScrollArea className="flex-1">
        <div className="container max-w-4xl mx-auto px-4 py-8">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
              <div className="relative mb-6">
                <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent flex items-center justify-center backdrop-blur-sm border border-primary/20">
                  <Sparkles className="w-12 h-12 text-primary animate-pulse" />
                </div>
                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-primary/20 animate-ping" />
              </div>
              
              <h2 className="text-2xl font-bold mb-3 bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
                Vad vill du veta om dina möten?
              </h2>
              <p className="text-muted-foreground mb-8 text-center max-w-md">
                Ställ frågor, få sammanfattningar och hitta viktiga beslut direkt
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl">
                {[
                  { icon: "📊", text: "Sammanfatta senaste mötet" },
                  { icon: "✅", text: "Vilka beslut togs förra veckan?" },
                  { icon: "📋", text: "Visa åtgärdspunkter och ansvariga" },
                  { icon: "💡", text: "Vad var viktigast i Q3-planeringen?" },
                ].map((p) => (
                  <Button 
                    key={p.text} 
                    variant="outline" 
                    onClick={() => setInput(p.text)}
                    className="h-auto py-4 px-5 justify-start text-left hover:bg-primary/5 hover:border-primary/40 transition-all group"
                  >
                    <span className="text-2xl mr-3 group-hover:scale-110 transition-transform">{p.icon}</span>
                    <span className="text-sm">{p.text}</span>
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 animate-fade-in ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center flex-shrink-0 mt-1">
                      <Sparkles className="w-4 h-4 text-primary-foreground" />
                    </div>
                  )}
                  
                  <div
                    className={`max-w-[75%] rounded-3xl px-5 py-3.5 shadow-sm transition-all duration-200 hover:shadow-md ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-card border border-border/50 rounded-bl-md"
                    }`}
                  >
                    {msg.role === "assistant" && streamingIndex === idx ? (
                      <TypewriterText text={msg.content} />
                    ) : (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    )}
                    {msg.meetingReference && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-3 w-full hover:bg-primary/10"
                        onClick={() => navigate(`/library?highlight=${msg.meetingReference?.meetingId}`)}
                      >
                        <ExternalLink className="w-3 h-3 mr-2" />
                        Gå till {msg.meetingReference.meetingTitle}
                      </Button>
                    )}
                  </div>
                  
                  {msg.role === "user" && (
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-1">
                      <span className="text-sm">👤</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t bg-card/50 backdrop-blur-xl sticky bottom-0">
        <div className="container max-w-4xl mx-auto px-4 py-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <Input
                placeholder="Skriv din fråga här..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                disabled={isLoading}
                className="pr-12 h-12 bg-background border-border/50 focus:border-primary/50 rounded-2xl resize-none transition-all"
              />
              {isLoading && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleStop}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 px-3 text-xs hover:bg-destructive/10 hover:text-destructive"
                >
                  Stoppa
                </Button>
              )}
            </div>
            <Button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              size="lg"
              className="h-12 px-6 rounded-2xl bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Tryck Enter för att skicka • AI kan göra misstag
          </p>
        </div>
      </div>
    </div>
  );
};
