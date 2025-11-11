import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle, Send, Loader2, X, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface MeetingChatProps {
  transcript: string;
  meetingTitle: string;
  onClose: () => void;
}

const TypewriterText = ({ text, onComplete }: { text: string; onComplete?: () => void }) => {
  const [displayedText, setDisplayedText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const flashTimer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(flashTimer);
  }, []);

  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(text.slice(0, currentIndex + 1));
        setCurrentIndex(currentIndex + 1);
      }, 12);
      return () => clearTimeout(timeout);
    } else if (currentIndex === text.length && text.length > 0 && onComplete) {
      onComplete();
    }
  }, [text, currentIndex, onComplete]);

  return (
    <span 
      className={`whitespace-pre-wrap transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {displayedText}
      {currentIndex < text.length && (
        <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-pulse" />
      )}
    </span>
  );
};

export const MeetingChat = ({ transcript, meetingTitle, onClose }: MeetingChatProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessageIndex, setStreamingMessageIndex] = useState<number | null>(null);
  const [lastRequestTime, setLastRequestTime] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const streamChat = async (userMessage: string) => {
    // Client-side rate limiting: 2 seconds between requests
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < 2000) {
      toast({
        title: "Vänta lite",
        description: "Vänta ett par sekunder mellan meddelanden.",
        variant: "destructive",
      });
      return;
    }
    setLastRequestTime(now);

    const newMessages = [...messages, { role: "user" as const, content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meeting-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem('authToken') || ''}`,
          },
          body: JSON.stringify({
            messages: newMessages,
            transcript,
          }),
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
      
      // Set streaming index
      setStreamingMessageIndex(newMessages.length);

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

      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
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
          } catch {}
        }
      }

      setStreamingMessageIndex(null);
      setIsLoading(false);
    } catch (error) {
      console.error("Chat error:", error);
      toast({
        title: "Fel",
        description: "Kunde inte skicka meddelandet. Försök igen.",
        variant: "destructive",
      });
      setMessages(messages);
      setStreamingMessageIndex(null);
      setIsLoading(false);
    }
  };

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    const userMessage = input.trim();
    setInput("");
    streamChat(userMessage);
  };

  return (
    <Card className="h-full flex flex-col shadow-2xl border border-border/50 animate-scale-in overflow-hidden bg-gradient-to-b from-card to-card/80">
      {/* Modern Header */}
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b bg-gradient-to-r from-primary/10 via-primary/5 to-transparent backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-md">
              <Sparkles className="h-5 w-5 text-primary-foreground animate-pulse" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-green-500 border-2 border-background" />
          </div>
          <div>
            <CardTitle className="text-base font-bold">AI Assistent</CardTitle>
            <p className="text-xs text-muted-foreground">{meetingTitle}</p>
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onClose}
          className="hover:bg-destructive/10 hover:text-destructive transition-all rounded-xl"
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>

      {/* Chat Messages */}
      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] animate-fade-in">
              <div className="relative mb-4">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent flex items-center justify-center backdrop-blur-sm border border-primary/20">
                  <Sparkles className="h-10 w-10 text-primary animate-pulse" />
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-primary/20 animate-ping" />
              </div>
              <p className="font-semibold mb-2 text-center">Ställ frågor om mötet</p>
              <p className="text-xs text-muted-foreground text-center max-w-[250px]">
                "Vad var de viktigaste besluten?" eller "Sammanfatta huvudpunkterna"
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-2 animate-fade-in ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center flex-shrink-0 mt-1">
                      <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
                    </div>
                  )}
                  
                  <div
                    className={`max-w-[80%] rounded-3xl px-4 py-3 shadow-sm transition-all duration-200 hover:shadow-md ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted/80 border border-border/50 rounded-bl-md"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <p className="text-sm leading-relaxed">
                        <TypewriterText 
                          text={msg.content}
                          onComplete={() => {
                            if (streamingMessageIndex === idx) {
                              setStreamingMessageIndex(null);
                            }
                          }}
                        />
                      </p>
                    ) : (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                  
                  {msg.role === "user" && (
                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-1">
                      <span className="text-xs">👤</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Input Area */}
        <div className="p-4 border-t bg-gradient-to-r from-background/50 to-muted/30 backdrop-blur-sm">
          <div className="flex gap-2">
            <Input
              placeholder="Skriv din fråga..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              disabled={isLoading}
              className="bg-background/80 border-border/50 focus:border-primary/50 rounded-2xl transition-all h-11"
            />
            <Button 
              onClick={handleSend} 
              disabled={isLoading || !input.trim()}
              className="h-11 px-5 rounded-2xl bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 transition-all duration-200 hover:scale-105 active:scale-95"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
