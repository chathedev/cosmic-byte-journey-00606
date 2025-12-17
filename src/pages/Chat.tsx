import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useNavigate } from "react-router-dom";
import { meetingStorage, type MeetingSession } from "@/utils/meetingStorage";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Send, Loader2, Lock, TrendingUp, ExternalLink, Sparkles, FileText, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SubscribeDialog } from "@/components/SubscribeDialog";
import { hasPlusAccess } from "@/lib/accessCheck";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useChatLimit } from "@/hooks/useChatLimit";
interface Message {
  role: "user" | "assistant";
  content: string;
  showMeetingPicker?: boolean;
  meetingReference?: {
    meetingId: string;
    meetingTitle: string;
  };
}

// Minimal thinking indicator
const ThinkingIndicator = () => (
  <span className="text-muted-foreground/60 text-sm animate-pulse">···</span>
);

const TypewriterText = ({ text, onComplete }: { text: string; onComplete?: () => void }) => {
  const [displayedText, setDisplayedText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < text.length) {
      // Fast, smooth typing animation - faster for longer texts
      const delay = text.length > 200 ? 8 : 12;
      const timeout = setTimeout(() => {
        // Type multiple characters at once for longer texts
        const charsToAdd = text.length > 300 ? 3 : text.length > 100 ? 2 : 1;
        const newIndex = Math.min(currentIndex + charsToAdd, text.length);
        setDisplayedText(text.slice(0, newIndex));
        setCurrentIndex(newIndex);
      }, delay);
      return () => clearTimeout(timeout);
    } else if (onComplete && currentIndex === text.length && text.length > 0) {
      onComplete();
    }
  }, [text, currentIndex, onComplete]);

  const formatText = (content: string) => {
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code class="px-1.5 py-0.5 bg-muted rounded text-sm font-mono">$1</code>')
      .replace(/\n/g, '<br>');
  };

  return (
    <div className="whitespace-pre-wrap prose prose-sm max-w-none dark:prose-invert inline">
      <span dangerouslySetInnerHTML={{ __html: formatText(displayedText) }} />
      {currentIndex < text.length && (
        <span className="inline-block w-0.5 h-5 bg-primary ml-0.5 animate-pulse" />
      )}
    </div>
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
  const [isThinking, setIsThinking] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Chat limit tracking
  const { 
    chatMessageCount, 
    chatLimit, 
    canSendMessage, 
    getRemainingMessages, 
    incrementCounter,
    fetchChatCount,
    isOverLimit 
  } = useChatLimit();

  const isPlusUser = hasPlusAccess(user, userPlan);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isThinking]);

  useEffect(() => {
    loadMeetings();
    // Fetch chat count on mount
    if (isPlusUser) {
      fetchChatCount();
    }
  }, [user, isPlusUser]);

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

    // Check chat limit before sending
    if (!canSendMessage()) {
      toast({
        title: "Chattgräns nådd",
        description: `Du har använt alla dina ${chatLimit} chattmeddelanden denna månad. Uppgradera för att fortsätta.`,
        variant: "destructive",
      });
      return;
    }

    const userMessage = input.trim();
    setInput("");

    const newMessages = [...messages, { role: "user" as const, content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);
    setIsThinking(true);

    try {
      let transcriptContext = "";
      let selectedMeetingTitle = "";
      let effectiveMeetingId = selectedMeetingId;
      
      // Auto-select if only one meeting exists
      if (selectedMeetingId === "all" && meetings.length === 1) {
        effectiveMeetingId = meetings[0].id;
        setSelectedMeetingId(meetings[0].id); // Update UI to show selection
      }
      
      if (effectiveMeetingId === "all") {
        // Include all meetings with their titles
        transcriptContext = meetings.map(m => `[Möte: ${m.title}]\n${m.transcript}`).join("\n\n---\n\n");
        selectedMeetingTitle = "alla möten";
      } else {
        const meeting = meetings.find(m => m.id === effectiveMeetingId);
        if (meeting) {
          transcriptContext = `[Valt möte: ${meeting.title}]\n${meeting.transcript || ""}`;
          selectedMeetingTitle = meeting.title;
        }
      }
      
      // Add context about selected meeting to help AI remember
      const hasMeetingContext = effectiveMeetingId !== "all" || meetings.length === 1;
      const contextPrefix = hasMeetingContext && selectedMeetingTitle 
        ? `[KONTEXT: Användaren har valt mötet "${selectedMeetingTitle}". Svara baserat på detta möte, fråga INTE vilket möte igen.]\n\n` 
        : "";

      const abort = new AbortController();
      setController(abort);

      // Get auth token (prefer localStorage, fall back to Supabase)
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseToken = session?.access_token;
      const localToken = localStorage.getItem('authToken');
      const token = localToken || supabaseToken;

      if (!token) {
        throw new Error("Inte inloggad");
      }

      const isEnterprise = userPlan?.plan === 'enterprise';
      const model = isEnterprise ? "gemini-2.5-flash" : "gemini-2.5-flash-lite";

      // Build prompt from messages and transcript context
      const systemPrompt = `Du är en intelligent mötesassistent för Tivly. Svara på svenska. Du hjälper användaren med frågor om deras möten.

${contextPrefix}${transcriptContext ? `\n\nMÖTESINNEHÅLL:\n${transcriptContext}` : ''}`;

      const userPrompt = newMessages.map(m => `${m.role === 'user' ? 'Användare' : 'Assistent'}: ${m.content}`).join('\n\n');

      // Call via Supabase edge function
      const { data, error: fnError } = await supabase.functions.invoke('ai-gemini', {
        body: {
          prompt: `${systemPrompt}\n\n${userPrompt}`,
          model,
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (fnError) {
        console.error('[Chat] Supabase function error:', fnError);
        throw new Error(fnError.message || 'AI-fel');
      }

      if (data?.error) {
        if (data.error === "rate_limited" || data.status === 429) {
          toast({
            title: "För många förfrågningar",
            description: "Vänligen vänta en stund innan du försöker igen.",
            variant: "destructive",
          });
          setMessages(messages);
          setIsLoading(false);
          return;
        }
        throw new Error(data.message || data.error || "API-fel");
      }

      // Extract text from Gemini response
      const assistantContent = 
        data.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
        data.response?.candidates?.[0]?.output?.text ||
        "Kunde inte generera svar.";

      setStreamingIndex(newMessages.length);
      setIsThinking(false);

      // Add assistant message
      setMessages([...newMessages, { role: "assistant", content: assistantContent }]);

      // Check if AI asked for meeting selection
      if (assistantContent.includes("[ASK_MEETING]")) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            const cleanContent = last.content.replace("[ASK_MEETING]", "").trim();
            return prev.map((m, i) =>
              i === prev.length - 1 ? { ...m, content: cleanContent, showMeetingPicker: true } : m
            );
          }
          return prev;
        });
      }

      // Increment chat counter after successful message
      try {
        await incrementCounter(1);
      } catch (err) {
        console.warn('Failed to increment chat counter:', err);
      }

      setStreamingIndex(null);
      setIsLoading(false);
      setIsThinking(false);
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
      setIsThinking(false);
      setController(null);
    }
  };

  const handleStop = () => {
    controller?.abort();
    setIsLoading(false);
    setStreamingIndex(null);
    setController(null);
  };

  const handleMeetingSelect = (meetingId: string, meetingTitle: string) => {
    setSelectedMeetingId(meetingId);
    // Update the last message to hide picker and add confirmation
    setMessages((prev) => {
      const updated = prev.map((m, i) => 
        i === prev.length - 1 ? { ...m, showMeetingPicker: false } : m
      );
      return [
        ...updated,
        { role: "assistant" as const, content: `Perfekt! Jag tittar nu på **${meetingTitle}**. Vad vill du veta om det mötet? 📋` }
      ];
    });
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
      {/* Loading bar */}
      {isLoading && (
        <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-gradient-to-r from-primary via-primary/60 to-primary animate-pulse">
          <div className="h-full w-full bg-gradient-to-r from-transparent via-background/20 to-transparent animate-[slide-in-right_1s_ease-in-out_infinite]" />
        </div>
      )}
      
      {/* Desktop: Takes remaining space, Mobile: Full screen */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b bg-background px-5 py-4 flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-foreground">AI Möteschatt</h1>
                {chatLimit !== null && (
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs ${isOverLimit ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {chatMessageCount}/{chatLimit} meddelanden
                    </span>
                    {isOverLimit && (
                      <AlertTriangle className="w-3 h-3 text-destructive" />
                    )}
                  </div>
                )}
              </div>
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
        <ScrollArea className="flex-1" ref={scrollAreaRef}>
          <div className="p-5 space-y-5 max-w-3xl mx-auto w-full">
            {meetings.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-4">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-xl font-semibold mb-2">Inga möten att chatta om</h2>
                <p className="text-base text-muted-foreground mb-6 max-w-md">
                  För att kunna chatta med AI om dina möten behöver du först spela in och spara ett möte.
                </p>
                <Button 
                  size="lg"
                  onClick={() => navigate('/recording')}
                  className="gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  Spela in ett möte
                </Button>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-5">
                  <Sparkles className="w-10 h-10 text-primary" />
                </div>
                <h2 className="text-lg font-semibold mb-2">Fråga mig om dina möten</h2>
                <p className="text-sm text-muted-foreground mb-8 max-w-xs">
                  Jag kan sammanfatta, hitta beslut och ge förslag baserat på dina möten
                </p>
                <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
                  {[
                    { text: "Sammanfatta senaste mötet", icon: "📋" },
                    { text: "Vilka beslut togs?", icon: "✅" },
                    { text: "Föreslå nästa steg", icon: "💡" },
                    { text: "Vad borde vi prata om i nästa möte?", icon: "📌" }
                  ].map(({ text, icon }) => (
                    <Button 
                      key={text} 
                      variant="outline" 
                      onClick={() => setInput(text)}
                      className="h-auto py-3 px-4 text-sm justify-start hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-all group"
                    >
                      <span className="mr-2 group-hover:scale-110 transition-transform">{icon}</span>
                      {text}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex gap-3 animate-fade-in ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0 mt-1">
                        <Sparkles className="w-4 h-4 text-primary" />
                      </div>
                    )}
                    
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-base shadow-sm ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted/50 text-foreground border border-border/30 rounded-bl-md"
                      }`}
                    >
                      {msg.role === "assistant" && streamingIndex === idx ? (
                        <TypewriterText text={msg.content} onComplete={() => setStreamingIndex(null)} />
                      ) : (
                        <div 
                          className="whitespace-pre-wrap leading-relaxed prose prose-sm max-w-none dark:prose-invert"
                          dangerouslySetInnerHTML={{ 
                            __html: msg.content
                              .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
                              .replace(/\*(.*?)\*/g, '<em>$1</em>')
                              .replace(/`(.*?)`/g, '<code class="px-1.5 py-0.5 bg-muted rounded text-sm font-mono">$1</code>')
                              .replace(/\n/g, '<br>')
                          }}
                        />
                      )}
                      
                      {/* Inline meeting picker */}
                      {msg.showMeetingPicker && (
                        <AnimatePresence>
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className="mt-3 pt-3 border-t border-border/30"
                          >
                            <p className="text-xs text-muted-foreground mb-2">Välj ett möte:</p>
                            <div className="flex flex-wrap gap-2">
                              {meetings.slice(0, 5).map((meeting, i) => (
                                <motion.button
                                  key={meeting.id}
                                  initial={{ opacity: 0, scale: 0.8 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ delay: i * 0.05 }}
                                  onClick={() => handleMeetingSelect(meeting.id, meeting.title)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-background border border-border rounded-full hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-all"
                                >
                                  <FileText className="w-3 h-3" />
                                  <span className="max-w-[120px] truncate">{meeting.title}</span>
                                </motion.button>
                              ))}
                            </div>
                          </motion.div>
                        </AnimatePresence>
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
                ))}
                
                {/* Thinking indicator */}
                {isThinking && (
                  <div className="flex gap-3 justify-start animate-fade-in">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0 mt-1">
                      <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                    </div>
                    <div className="bg-muted/50 border border-border/30 rounded-2xl rounded-bl-md px-4 py-2">
                      <ThinkingIndicator />
                    </div>
                  </div>
                )}
                
                {/* Scroll anchor */}
                <div ref={messagesEndRef} />
              </>
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
