import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { FileText, Loader2, AlertTriangle, ExternalLink, Clock, CheckSquare, ListChecks, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import tivlyLogo from "@/assets/tivly-logo.png";

const API_BASE_URL = "https://api.tivly.se";

interface ActionItem {
  title?: string;
  description?: string;
  owner?: string;
  deadline?: string;
  status?: string;
}

interface SharedProtocolData {
  title?: string;
  protocol?: string;
  summary?: string;
  mainPoints?: string[];
  decisions?: string[];
  actionItems?: ActionItem[];
  participants?: string[];
  createdAt?: string;
  meetingDate?: string;
  sharedAt?: string;
  duration?: string;
}

const SharedProtocol = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedProtocolData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Ingen token angiven.");
      setLoading(false);
      return;
    }

    const fetchProtocol = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/public/protocols/${encodeURIComponent(token)}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError("Protokollet hittades inte eller har upphört.");
          } else {
            setError("Kunde inte hämta protokollet.");
          }
          setLoading(false);
          return;
        }
        const json = await res.json();
        setData({
          title: json.title || json.meetingTitle || json.fileName || "Mötesprotokoll",
          protocol: json.protocol || json.content || json.html || null,
          summary: json.summary || null,
          mainPoints: Array.isArray(json.mainPoints) ? json.mainPoints : null,
          decisions: Array.isArray(json.decisions) ? json.decisions : null,
          actionItems: Array.isArray(json.actionItems) ? json.actionItems : null,
          participants: Array.isArray(json.participants) ? json.participants : null,
          createdAt: json.createdAt || json.meetingDate || null,
          meetingDate: json.meetingDate || null,
          sharedAt: json.sharedAt || null,
          duration: json.duration || null,
        });
      } catch {
        setError("Ett nätverksfel uppstod. Försök igen senare.");
      } finally {
        setLoading(false);
      }
    };

    fetchProtocol();
  }, [token]);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("sv-SE", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return "";
    }
  };

  const formatDateTime = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("sv-SE", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Laddar protokoll…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">
            Protokollet är inte tillgängligt
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {error || "Något gick fel."}
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={() => window.location.href = "https://app.tivly.se"} className="gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" />
              Gå till Tivly
            </Button>
            <Button variant="ghost" size="sm" onClick={() => window.location.href = "https://app.tivly.se/feedback"} className="gap-1.5 text-muted-foreground">
              Kontakta support
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const hasMetadata = data.mainPoints?.length || data.decisions?.length || data.actionItems?.length;

  return (
    <div className="min-h-screen bg-background">
      {/* Minimal header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src={tivlyLogo} alt="Tivly" className="h-6 w-auto" />
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              Delat protokoll
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.href = "https://app.tivly.se"}
            className="text-xs gap-1 h-7"
          >
            Öppna Tivly
            <ExternalLink className="w-3 h-3" />
          </Button>
        </div>
      </header>

      {/* Protocol content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="space-y-6">
          {/* Title & meta */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-tight">
                  {data.title}
                </h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                  {data.createdAt && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(data.createdAt)}
                    </span>
                  )}
                  {data.duration && (
                    <span className="text-xs text-muted-foreground">
                      {data.duration}
                    </span>
                  )}
                  {data.participants && data.participants.length > 0 && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {data.participants.length} deltagare
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Summary */}
          {data.summary && (
            <div className="rounded-xl border border-border bg-muted/20 p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-foreground mb-2">Sammanfattning</h2>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {data.summary}
              </p>
            </div>
          )}

          {/* Structured metadata */}
          {hasMetadata && (
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Main points */}
              {data.mainPoints && data.mainPoints.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ListChecks className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Huvudpunkter</h3>
                  </div>
                  <ul className="space-y-2">
                    {data.mainPoints.map((point, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/50 shrink-0 mt-1.5" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Decisions */}
              {data.decisions && data.decisions.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckSquare className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <h3 className="text-sm font-semibold text-foreground">Beslut</h3>
                  </div>
                  <ul className="space-y-2">
                    {data.decisions.map((d, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <CheckSquare className="w-3.5 h-3.5 text-green-500/50 shrink-0 mt-0.5" />
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Action items */}
          {data.actionItems && data.actionItems.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <ListChecks className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Åtgärdspunkter</h3>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-auto">
                  {data.actionItems.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {data.actionItems.map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/20 border border-border/30">
                    <div className="w-5 h-5 rounded border border-border bg-background flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[10px] font-bold text-muted-foreground">{i + 1}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{item.title || item.description}</p>
                      {item.owner && (
                        <p className="text-xs text-muted-foreground mt-0.5">Ansvarig: {item.owner}</p>
                      )}
                      {item.deadline && (
                        <p className="text-xs text-muted-foreground">Deadline: {formatDate(item.deadline)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full protocol */}
          {data.protocol && (
            <>
              <Separator />
              <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
                <h2 className="text-sm font-semibold text-foreground mb-4">Fullständigt protokoll</h2>
                <div
                  className="prose prose-sm dark:prose-invert max-w-none
                    prose-headings:text-foreground prose-p:text-muted-foreground
                    prose-li:text-muted-foreground prose-strong:text-foreground
                    prose-h2:text-base prose-h3:text-sm"
                  dangerouslySetInnerHTML={{ __html: data.protocol }}
                />
              </div>
            </>
          )}

          {!data.protocol && !data.summary && !hasMetadata && (
            <div className="text-center py-12">
              <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Inget protokollinnehåll tillgängligt.</p>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6 mt-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground/50">
            Genererat av Tivly — AI-mötesprotokoll
          </p>
          <a
            href="https://tivly.se"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            tivly.se
          </a>
        </div>
      </footer>
    </div>
  );
};

export default SharedProtocol;