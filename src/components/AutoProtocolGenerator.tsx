import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, Save, ArrowLeft, FileText, CheckCircle2, Loader2, Share2 } from "lucide-react";
import { Document, Paragraph, HeadingLevel, AlignmentType, Packer } from "docx";
import { saveAs } from "file-saver";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { generateMeetingTitle } from "@/lib/titleGenerator";
import { useToast } from "@/hooks/use-toast";
import { EmailDialog } from "@/components/EmailDialog";
import { backendApi } from "@/lib/backendApi";

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

interface SISSpeaker {
  label: string;
  segments: { start: number; end: number }[];
  durationSeconds: number;
  bestMatchEmail?: string;
  similarity?: number;
  matches?: {
    sampleOwnerEmail: string;
    similarity: number;
  }[];
}

interface SISMatch {
  speakerName: string;
  speakerLabel: string;
  confidencePercent: number;
  segments: { start: number; end: number }[];
}

interface TranscriptSegment {
  speakerId: string;
  text: string;
  start: number;
  end: number;
}

interface AutoProtocolGeneratorProps {
  transcript: string;
  aiProtocol: AIProtocol | null;
  onBack: () => void;
  showWidget?: boolean;
  onProtocolReady?: () => void;
  isFreeTrialMode?: boolean;
  meetingCreatedAt?: string;
  agendaId?: string;
  meetingId?: string;
  userId?: string;
  transcriptSegments?: TranscriptSegment[];
  sisSpeakers?: SISSpeaker[];
  sisMatches?: SISMatch[];
}

export const AutoProtocolGenerator = ({
  transcript,
  aiProtocol,
  onBack,
  showWidget = true,
  onProtocolReady,
  isFreeTrialMode = false,
  meetingCreatedAt,
  agendaId,
  meetingId,
  userId,
  transcriptSegments,
  sisSpeakers,
  sisMatches,
}: AutoProtocolGeneratorProps) => {
  const [generatedProtocol, setGeneratedProtocol] = useState<AIProtocol | null>(aiProtocol);
  const [isGenerating, setIsGenerating] = useState(!aiProtocol);
  const [progress, setProgress] = useState(0);
  const [documentBlob, setDocumentBlob] = useState<Blob | null>(null);
  const [fileName, setFileName] = useState("Mötesprotokoll.docx");
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const hasGeneratedRef = useRef(false);

  useEffect(() => {
    if (aiProtocol || hasGeneratedRef.current) return;
    hasGeneratedRef.current = true;

    const generateProtocol = async () => {
      setIsGenerating(true);
      
      // Validate transcript before sending
      const wordCount = transcript.trim().split(/\s+/).filter(w => w).length;
      console.log('📊 Protocol generation starting:', {
        transcriptLength: transcript.length,
        wordCount,
        hasAgenda: !!agendaId,
        meetingName: fileName.replace('.docx', '')
      });

      if (wordCount < 10) {
        console.error('❌ Transcript too short for AI analysis:', wordCount, 'words');
        toast({
          title: "För kort transkription",
          description: "Transkriptionen är för kort för att generera ett meningsfullt protokoll. Försök spela in ett längre möte.",
          variant: "destructive",
          duration: 5000,
        });
        setIsGenerating(false);
        return;
      }
      
      // Slower, smoother progress animation
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 85) return prev;
          return prev + Math.random() * 2;
        });
      }, 300);

      try {
        // Build speaker-attributed transcript if SIS data available
        let formattedTranscript = transcript;
        let speakerInfo: { name: string; segments: number }[] = [];
        
        if (transcriptSegments && transcriptSegments.length > 0 && (sisMatches || sisSpeakers)) {
          // 80-100% = Very strong match, 70-79% = Strong match, <70% = Not reliable
          const SIS_STRONG_THRESHOLD = 0.70;
          
          // Build speaker name map from SIS data
          const speakerNameMap = new Map<string, string>();
          
          // Use sisMatches for speaker names
          if (sisMatches && sisMatches.length > 0) {
            sisMatches.forEach(match => {
              if (match.confidencePercent >= SIS_STRONG_THRESHOLD * 100) {
                speakerNameMap.set(match.speakerLabel, match.speakerName);
              }
            });
          }
          
          // Fallback to sisSpeakers if no matches
          if (speakerNameMap.size === 0 && sisSpeakers && sisSpeakers.length > 0) {
            sisSpeakers.forEach(speaker => {
              if (speaker.similarity && speaker.similarity >= SIS_STRONG_THRESHOLD && speaker.bestMatchEmail) {
                // Extract name from email (e.g., charlie@wby.se -> Charlie)
                const namePart = speaker.bestMatchEmail.split('@')[0];
                const formattedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
                speakerNameMap.set(speaker.label, formattedName);
              }
            });
          }
          
          // Only format with speaker names if we have REAL identified speakers
          // Don't use generic "Talare 1/2/3" - it adds no value
          if (speakerNameMap.size > 0) {
            // Format transcript with real speaker names
            const formattedSegments = transcriptSegments
              .filter(segment => segment && segment.text)
              .map(segment => {
                const speakerId = segment.speakerId || 'unknown';
                const speakerName = speakerNameMap.get(speakerId) || speakerNameMap.get('meeting');
                
                // Only add speaker label if we have a real name for this speaker
                if (speakerName) {
                  return `[${speakerName}]: ${segment.text || ''}`;
                }
                // No real name identified - just return the text without speaker label
                return segment.text || '';
              });
            
            formattedTranscript = formattedSegments.length > 0 
              ? formattedSegments.join('\n\n') 
              : transcript;
            
            // Collect speaker info for logging (only real names)
            const speakerCounts = new Map<string, number>();
            transcriptSegments
              .filter(segment => segment && segment.speakerId && speakerNameMap.has(segment.speakerId))
              .forEach(segment => {
                const name = speakerNameMap.get(segment.speakerId!)!;
                speakerCounts.set(name, (speakerCounts.get(name) || 0) + 1);
              });
            speakerInfo = Array.from(speakerCounts.entries()).map(([name, segments]) => ({ name, segments }));
            
            console.log('🎤 Speaker-attributed transcript created with REAL names:', {
              speakersIdentified: speakerNameMap.size,
              speakerInfo,
              formattedTranscriptPreview: formattedTranscript.substring(0, 300)
            });
          } else {
            // No real speaker names identified - use plain transcript without generic labels
            console.log('ℹ️ No real speaker names identified, using plain transcript');
          }
        }
        
        const requestBody = {
          transcript: formattedTranscript,
          meetingName: fileName.replace('.docx', ''),
          agenda: agendaId ? await fetchAgendaContent(agendaId) : undefined,
          hasSpeakerAttribution: speakerInfo.length > 0,
          speakers: speakerInfo,
        };
        
        console.log('🚀 Sending to analyze-meeting:', {
          transcriptPreview: formattedTranscript.substring(0, 200),
          wordCount,
          hasAgenda: !!requestBody.agenda,
          hasSpeakerAttribution: requestBody.hasSpeakerAttribution,
          speakers: requestBody.speakers
        });

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-meeting`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify(requestBody),
          }
        );

        console.log('📡 analyze-meeting response status:', response.status, response.statusText);

        if (!response.ok) {
          const errorText = await response.text();
          console.error("❌ Edge function error:", response.status, errorText);
          
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { error: errorText || "Unknown error" };
          }
          
          throw new Error(errorData.error || `Server error: ${response.status}`);
        }

        const data = await response.json();
        console.log("✅ Received protocol data:", {
          hasTitle: !!data.title,
          hasSummary: !!data.summary,
          summaryLength: data.summary?.length || 0,
          mainPointsCount: data.mainPoints?.length || 0,
          mainPointsIsArray: Array.isArray(data.mainPoints),
          decisionsCount: data.decisions?.length || 0,
          decisionsIsArray: Array.isArray(data.decisions),
          actionItemsCount: data.actionItems?.length || 0
        });
        
        // Extra validation to ensure arrays are actually arrays
        if (!Array.isArray(data.mainPoints)) {
          console.error("❌ mainPoints is not an array:", typeof data.mainPoints);
          throw new Error("Ogiltigt format från AI - huvudpunkter saknas");
        }
        
        if (!Array.isArray(data.decisions)) {
          console.warn("⚠️ decisions is not an array, converting:", typeof data.decisions);
          data.decisions = [];
        }
        
        if (!Array.isArray(data.actionItems)) {
          console.warn("⚠️ actionItems is not an array, converting:", typeof data.actionItems);
          data.actionItems = [];
        }
        
        // Validate that we have actual content
        if (!data.summary || data.summary.trim() === '') {
          console.error("❌ Empty summary received from AI");
          throw new Error("AI genererade inget innehåll. Försök igen.");
        }
        
        if (data.mainPoints.length === 0) {
          console.error("❌ No main points received from AI");
          throw new Error("AI kunde inte generera huvudpunkter. Försök igen.");
        }
        
        // Complete progress
        clearInterval(progressInterval);
        setProgress(100);
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        console.log("📝 Setting generated protocol with summary:", data.summary.substring(0, 100));
        setGeneratedProtocol(data);

        // Generate title
        const title = await generateMeetingTitle(transcript);
        setFileName(`${title}.docx`);

        // Save action items if we have meeting data
        if (meetingId && user && data.actionItems?.length > 0) {
          await saveActionItems(data.actionItems, meetingId, user.uid);
        }

        // Generate document
        await generateDocument(data, title);
        
        if (onProtocolReady) {
          onProtocolReady();
        }
      } catch (error) {
        console.error("❌ Error generating protocol:", error);
        clearInterval(progressInterval);
        const errorMessage = error instanceof Error ? error.message : "Kunde inte generera protokollet. Försök igen.";
        toast({
          title: "Fel vid generering",
          description: errorMessage,
          variant: "destructive",
          duration: 4000,
        });
        // Stanna kvar på sidan så användaren kan försöka igen
      } finally {
        setIsGenerating(false);
      }
    };

    generateProtocol();
  }, [transcript, aiProtocol]);

  const fetchAgendaContent = async (id: string): Promise<string> => {
    try {
      // Fetch from backend API instead of Supabase
      const token = localStorage.getItem('authToken');
      if (!token) {
        console.warn('⚠️ No auth token - skipping agenda fetch');
        return '';
      }

      const response = await fetch(`https://api.tivly.se/agendas/${id}`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch agenda: ${response.status}`);
      }

      const data = await response.json();
      return data?.content || '';
    } catch (error) {
      console.error('Error fetching agenda:', error);
      return '';
    }
  };

  const saveActionItems = async (items: AIActionItem[], meetingId: string, userId: string) => {
    try {
      // Save to backend API instead of Supabase
      const token = localStorage.getItem('authToken');
      if (!token) {
        console.warn('⚠️ No auth token - skipping action items save');
        return;
      }

      const response = await fetch(`https://api.tivly.se/meetings/${meetingId}/action-items`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ actionItems: items }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to save action items: ${errorText}`);
      }

      console.log('✅ Action items saved to backend successfully');
    } catch (error) {
      console.error('Error saving action items:', error);
      // Non-blocking - protocol generation continues even if action items fail
    }
  };

  const generateDocument = async (protocol: AIProtocol, title: string) => {
    const { TextRun } = await import("docx");
    
    const documentChildren = [
      new Paragraph({
        text: title,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
      new Paragraph({
        text: `Datum: ${new Date(meetingCreatedAt || Date.now()).toLocaleDateString('sv-SE')}`,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
      new Paragraph({
        text: "Sammanfattning",
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 200 },
      }),
      new Paragraph({
        text: protocol.summary,
        spacing: { after: 300 },
      }),
      new Paragraph({
        text: "Huvudpunkter",
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 200 },
      }),
      ...protocol.mainPoints.map(point => 
        new Paragraph({
          children: [new TextRun({ text: `• ${point}` })],
          spacing: { after: 100 },
        })
      ),
    ];

    // Add decisions section if there are any
    if (protocol.decisions && protocol.decisions.length > 0) {
      documentChildren.push(
        new Paragraph({
          text: "Beslut",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        ...protocol.decisions.map(decision => 
          new Paragraph({
            children: [new TextRun({ text: `• ${decision}` })],
            spacing: { after: 100 },
          })
        )
      );
    }

    // Add action items section with better visibility
    if (protocol.actionItems && protocol.actionItems.length > 0) {
      documentChildren.push(
        new Paragraph({
          text: "Åtgärdspunkter",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        })
      );

      protocol.actionItems.forEach((item, index) => {
        // Title with priority indicator
        const priorityEmoji = item.priority === 'critical' ? '🔴' : 
                             item.priority === 'high' ? '🟠' : 
                             item.priority === 'medium' ? '🟡' : '🟢';
        
        documentChildren.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${index + 1}. `, bold: true }),
              new TextRun({ text: item.title, bold: true }),
              new TextRun({ text: ` ${priorityEmoji}` }),
            ],
            spacing: { before: 150, after: 50 },
          })
        );

        // Description
        if (item.description && item.description.trim()) {
          documentChildren.push(
            new Paragraph({
              children: [new TextRun({ text: `   ${item.description}` })],
              spacing: { after: 50 },
            })
          );
        }

        // Owner and deadline on same line if both exist
        const metaInfo: string[] = [];
        if (item.owner && item.owner.trim()) {
          metaInfo.push(`Ansvarig: ${item.owner}`);
        }
        if (item.deadline && item.deadline.trim()) {
          metaInfo.push(`Deadline: ${item.deadline}`);
        }
        
        if (metaInfo.length > 0) {
          documentChildren.push(
            new Paragraph({
              children: [new TextRun({ text: `   ${metaInfo.join(' | ')}`, italics: true })],
              spacing: { after: 100 },
            })
          );
        }
      });
    } else {
      // Add placeholder if no action items
      documentChildren.push(
        new Paragraph({
          text: "Åtgärdspunkter",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        new Paragraph({
          children: [new TextRun({ text: "Inga specifika åtgärdspunkter identifierades.", italics: true })],
          spacing: { after: 100 },
        })
      );
    }

    // Add next meeting suggestions if available
    if (protocol.nextMeetingSuggestions && protocol.nextMeetingSuggestions.length > 0) {
      documentChildren.push(
        new Paragraph({
          text: "Förslag till nästa möte",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 },
        }),
        ...protocol.nextMeetingSuggestions.map(suggestion => 
          new Paragraph({
            children: [new TextRun({ text: `• ${suggestion}` })],
            spacing: { after: 100 },
          })
        )
      );
    }

    const doc = new Document({
      sections: [{
        properties: {},
        children: documentChildren,
      }],
    });

    const blob = await Packer.toBlob(doc);
    setDocumentBlob(blob);
    
    // CRITICAL: Automatically save protocol to backend immediately after generation
    if (meetingId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(meetingId)) {
      try {
        console.log('💾 Auto-saving protocol to meeting:', meetingId);
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        
        await new Promise<void>((resolve, reject) => {
          reader.onload = async () => {
            try {
              const base64 = reader.result as string;
              await backendApi.saveProtocol(meetingId, {
                fileName: `${title}.docx`,
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                documentBlob: base64,
              });
              console.log('✅ Protocol auto-saved to meeting successfully');
              resolve();
            } catch (error) {
              console.error('❌ Failed to auto-save protocol:', error);
              reject(error);
            }
          };
          reader.onerror = reject;
        });
      } catch (error) {
        console.error('❌ Protocol auto-save failed (non-blocking):', error);
        // Don't throw - let user still see and download the protocol
      }
    } else {
      console.log('⚠️ Skipping auto-save - no valid meeting ID:', meetingId);
    }
  };

  const handleDownload = () => {
    if (documentBlob) {
      saveAs(documentBlob, fileName);
      toast({
        title: "Nedladdning startad",
        description: "Protokollet laddas ner till din enhet.",
        duration: 2000,
      });
    }
  };

  const handleSave = async () => {
    // Helper to check if a string is a valid UUID
    const isValidUUID = (id: string) => {
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
    };

    // CRITICAL: The protocol is already auto-saved to the meeting during generation
    // This button is just for user confirmation and navigation
    
    // Free users don't have library access - just show confirmation
    if (isFreeTrialMode) {
      toast({
        title: "Protokoll klart!",
        description: "Ladda ner protokollet för att spara det.",
        duration: 3000,
      });
      return;
    }
    
    if (!meetingId || !isValidUUID(meetingId)) {
      console.warn('⚠️ No valid meeting ID - protocol already generated, navigating to library');
      toast({
        title: "Protokoll klart",
        description: "Protokollet har genererats och är tillgängligt i biblioteket.",
        duration: 2000,
      });
      navigate("/library");
      return;
    }

    // Protocol is already saved via backend during generation
    // Just provide user feedback and navigate
    toast({
      title: "Protokoll sparat",
      description: "Protokollet har sparats på mötet och finns i ditt bibliotek.",
      duration: 2000,
    });
    
    navigate("/library");
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'text-red-600 dark:text-red-400';
      case 'high': return 'text-orange-600 dark:text-orange-400';
      case 'medium': return 'text-yellow-600 dark:text-yellow-400';
      case 'low': return 'text-green-600 dark:text-green-400';
      default: return 'text-muted-foreground';
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'critical': return 'Kritisk';
      case 'high': return 'Hög';
      case 'medium': return 'Medium';
      case 'low': return 'Låg';
      default: return priority;
    }
  };

  if (isGenerating) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 space-y-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="relative">
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">Genererar protokoll</h3>
              <p className="text-sm text-muted-foreground">AI analyserar ditt möte...</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-center text-muted-foreground">
              {Math.round(progress)}%
            </p>
          </div>
        </Card>
      </div>
    );
  }

  if (!generatedProtocol) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Tillbaka
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowEmailDialog(true)}
                disabled={!documentBlob}
              >
                <Share2 className="w-4 h-4 mr-2" />
                Dela
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={!documentBlob}
              >
                <Download className="w-4 h-4 mr-2" />
                Ladda ner
              </Button>
              {/* Hide Save button for free users - they don't have library access */}
              {!isFreeTrialMode && (
                <Button
                  size="sm"
                  onClick={handleSave}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Spara
                </Button>
              )}
              {/* Show "Klar" button for free users to go back */}
              {isFreeTrialMode && (
                <Button
                  size="sm"
                  onClick={onBack}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Klar
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card className="p-8 animate-fadeIn">
          {/* Title */}
          <div className="mb-8 pb-6 border-b">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h1 className="text-3xl font-bold mb-2">
                  {fileName.replace('.docx', '')}
                </h1>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{new Date(meetingCreatedAt || Date.now()).toLocaleDateString('sv-SE')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Content sections */}
          <div className="space-y-8">
            {/* Summary */}
            <div>
              <h2 className="text-xl font-semibold mb-3">Sammanfattning</h2>
              <p className="text-muted-foreground leading-relaxed">
                {generatedProtocol.summary}
              </p>
            </div>

            {/* Main Points */}
            <div>
              <h2 className="text-xl font-semibold mb-3">Huvudpunkter</h2>
              <ul className="space-y-2">
                {Array.isArray(generatedProtocol.mainPoints) && generatedProtocol.mainPoints.map((point, index) => (
                  <li key={index} className="flex gap-3">
                    <span className="text-primary font-medium">{index + 1}.</span>
                    <span className="text-muted-foreground">{String(point)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Decisions */}
            {Array.isArray(generatedProtocol.decisions) && generatedProtocol.decisions.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold mb-3">Beslut</h2>
                <ul className="space-y-2">
                  {generatedProtocol.decisions.map((decision, index) => (
                    <li key={index} className="flex gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{String(decision)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action Items */}
            {Array.isArray(generatedProtocol.actionItems) && generatedProtocol.actionItems.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold mb-3">Åtgärdspunkter</h2>
                <div className="space-y-4">
                  {generatedProtocol.actionItems.map((item, index) => (
                    <div key={index} className="pl-4 border-l-2 border-primary/20">
                      <div className="flex items-start justify-between gap-4 mb-1">
                        <h3 className="font-medium">{item.title}</h3>
                        <span className={`text-xs font-medium ${getPriorityColor(item.priority)}`}>
                          {getPriorityLabel(item.priority)}
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-sm text-muted-foreground mb-2">{item.description}</p>
                      )}
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        {item.owner && <span>Ansvarig: {item.owner}</span>}
                        {item.deadline && item.deadline.trim() !== '' && <span>Deadline: {item.deadline}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Next Meeting Suggestions */}
            {Array.isArray(generatedProtocol.nextMeetingSuggestions) && generatedProtocol.nextMeetingSuggestions.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold mb-3">Nästa möte - Förslag</h2>
                <ul className="space-y-2">
                  {generatedProtocol.nextMeetingSuggestions.map((suggestion, index) => (
                    <li key={index} className="flex gap-3">
                      <span className="text-primary font-medium">•</span>
                      <span className="text-muted-foreground">{String(suggestion)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

          </div>
        </Card>
      </div>

      <EmailDialog
        open={showEmailDialog}
        onOpenChange={setShowEmailDialog}
        documentBlob={documentBlob}
        fileName={fileName}
      />
    </div>
  );
};
