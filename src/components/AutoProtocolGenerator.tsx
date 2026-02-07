import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, Save, ArrowLeft, FileText, CheckCircle2, Loader2, Share2, Coffee } from "lucide-react";
import { Document, Paragraph, HeadingLevel, AlignmentType, Packer, TextRun, BorderStyle } from "docx";
import { saveAs } from "file-saver";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { generateMeetingTitle } from "@/lib/titleGenerator";
import { useToast } from "@/hooks/use-toast";
import { EmailDialog } from "@/components/EmailDialog";
import { ConfirmCloseProtocolDialog } from "@/components/ConfirmCloseProtocolDialog";
import { backendApi } from "@/lib/backendApi";
import { analyzeMeetingAI, generateMeetingTitleAI } from "@/lib/geminiApi";
import { useSubscription } from "@/contexts/SubscriptionContext";
import {
  computeSpeakerIndexOffset,
  lookupSpeakerNameMap,
  normalizeSpeakerBackendKey,
} from "@/lib/speakerNameResolution";

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
  speakerName?: string; // Direct speaker name from backend
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

interface SpeakerBlock {
  speakerId: string;
  speakerName: string | null;
  text: string;
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
  speakerNames?: Record<string, string>;
  speakerBlocksCleaned?: SpeakerBlock[];
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
  speakerNames: propSpeakerNames,
  speakerBlocksCleaned,
}: AutoProtocolGeneratorProps) => {
  const [generatedProtocol, setGeneratedProtocol] = useState<AIProtocol | null>(aiProtocol);
  const [isGenerating, setIsGenerating] = useState(!aiProtocol);
  const [progress, setProgress] = useState(0);
  const [documentBlob, setDocumentBlob] = useState<Blob | null>(null);
  const [fileName, setFileName] = useState("Mötesprotokoll.docx");
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showCoffeeHint, setShowCoffeeHint] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const [hasShared, setHasShared] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { userPlan } = useSubscription();
  const hasGeneratedRef = useRef(false);
  
  const isEnterprise = userPlan?.plan === 'enterprise';
  
  // Detect large transcripts (> 5000 words typically means 100MB+ audio files)
  const wordCount = transcript.trim().split(/\s+/).filter(w => w).length;
  const isLargeTranscript = wordCount > 5000;
  
  // Show coffee hint after 5 seconds for large transcripts
  useEffect(() => {
    if (isGenerating && isLargeTranscript) {
      const timer = setTimeout(() => setShowCoffeeHint(true), 5000);
      return () => clearTimeout(timer);
    } else {
      setShowCoffeeHint(false);
    }
  }, [isGenerating, isLargeTranscript]);

  // Prevent accidental page close / navigation during protocol generation
  useEffect(() => {
    if (!isGenerating) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers show a generic message; returnValue is still required by spec.
      e.returnValue = 'Protokollet genereras fortfarande. Är du säker på att du vill lämna?';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isGenerating]);

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

      if (wordCount < 20) {
        console.error('❌ Transcript too short for AI analysis:', wordCount, 'words');
        toast({
          title: "För kort transkription",
          description: "Transkriptionen måste innehålla minst 20 ord för att generera ett protokoll.",
          variant: "destructive",
          duration: 5000,
        });
        setIsGenerating(false);
        return;
      }
      
      // Smooth, steady progress animation
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 92) return prev; // Cap at 92% until complete
          // Smooth incremental increase with slight variance
          const increment = 0.8 + Math.random() * 0.6;
          return Math.min(prev + increment, 92);
        });
      }, 200);

      try {
        // Build speaker-attributed transcript if SIS data available
        let formattedTranscript = transcript;
        let speakerInfo: { name: string; segments: number }[] = [];
        
        // Helper to normalize speaker IDs to consistent format for lookup
        const normalizeSpeakerId = (id: string): string => normalizeSpeakerBackendKey(id);
        
        // Helper to lookup speaker name (also supports speaker_0 vs speaker_1 offset)
        const lookupSpeakerName = (
          speakerNameMap: Map<string, string>,
          id: string,
          offset: number = 0
        ): string | undefined => lookupSpeakerNameMap(speakerNameMap, id, offset);
        
        // Priority: Use transcriptSegments with SIS data if available
        if (transcriptSegments && transcriptSegments.length > 0) {
          // 70%+ confidence required for reliable speaker identification
          const SIS_CONFIDENCE_THRESHOLD = 70; // Percent
          
          // Build speaker name map from SIS data
          const speakerNameMap = new Map<string, string>();

          // Detect potential 0-based vs 1-based mismatch between transcript speaker ids and backend aliases.
          const speakerIndexOffset = computeSpeakerIndexOffset(
            transcriptSegments.map((s) => String((s as any)?.speakerId ?? '')),
            (propSpeakerNames || {}) as Record<string, unknown>
          );
          
          // Helper to check if name is generic
          const isGenericName = (name: string): boolean => {
            const genericPatterns = [
              /^speaker[_\s-]?\d+$/i,
              /^talare[_\s-]?\d+$/i,
              /^unknown$/i,
              /^okänd$/i,
            ];
            return genericPatterns.some(p => p.test(name.trim()));
          };
          
          // Priority 0: Use passed speakerNames prop (user-assigned names)
          if (propSpeakerNames && Object.keys(propSpeakerNames).length > 0) {
            Object.entries(propSpeakerNames).forEach(([label, name]) => {
              if (name && name.trim() && !isGenericName(name)) {
                // Store both original and normalized key for maximum compatibility
                speakerNameMap.set(label, name);
                speakerNameMap.set(normalizeSpeakerId(label), name);
                console.log(`🎤 Using propSpeakerNames: ${label} (${normalizeSpeakerId(label)}) -> ${name}`);
              }
            });
          }
          
          // Priority 1: Use sisSpeakers with speakerName if confidence >= 70%
          if (sisSpeakers && sisSpeakers.length > 0) {
            sisSpeakers.forEach(speaker => {
              if (lookupSpeakerName(speakerNameMap, speaker.label, speakerIndexOffset)) return; // Already set by prop
              const confidencePercent = (speaker.similarity || 0) * 100;
              if (speaker.speakerName && speaker.speakerName.trim() && !isGenericName(speaker.speakerName) && confidencePercent >= SIS_CONFIDENCE_THRESHOLD) {
                speakerNameMap.set(speaker.label, speaker.speakerName);
                speakerNameMap.set(normalizeSpeakerId(speaker.label), speaker.speakerName);
                console.log(`🎤 Using speakerName (${confidencePercent.toFixed(0)}% confidence): ${speaker.label} -> ${speaker.speakerName}`);
              } else if (speaker.speakerName) {
                console.log(`⚠️ Skipping low-confidence speaker (${confidencePercent.toFixed(0)}%): ${speaker.label} -> ${speaker.speakerName}`);
              }
            });
          }
          
          // Priority 2: Use sisMatches with speakerName if confidence >= 70%
          if (sisMatches && sisMatches.length > 0) {
            sisMatches.forEach(match => {
              if (!lookupSpeakerName(speakerNameMap, match.speakerLabel, speakerIndexOffset) && match.speakerName && match.speakerName.trim() && !isGenericName(match.speakerName)) {
                if (match.confidencePercent >= SIS_CONFIDENCE_THRESHOLD) {
                  speakerNameMap.set(match.speakerLabel, match.speakerName);
                  speakerNameMap.set(normalizeSpeakerId(match.speakerLabel), match.speakerName);
                  console.log(`🎤 Using sisMatch (${match.confidencePercent}% confidence): ${match.speakerLabel} -> ${match.speakerName}`);
                } else {
                  console.log(`⚠️ Skipping low-confidence sisMatch (${match.confidencePercent}%): ${match.speakerLabel} -> ${match.speakerName}`);
                }
              }
            });
          }
          
          // Priority 3: Fallback to email-based name if similarity >= 70%
          if (sisSpeakers && sisSpeakers.length > 0) {
            sisSpeakers.forEach(speaker => {
              if (lookupSpeakerName(speakerNameMap, speaker.label, speakerIndexOffset)) return; // Already set
              const confidencePercent = (speaker.similarity || 0) * 100;
              if (speaker.bestMatchEmail && confidencePercent >= SIS_CONFIDENCE_THRESHOLD) {
                const namePart = speaker.bestMatchEmail.split('@')[0];
                const formattedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
                speakerNameMap.set(speaker.label, formattedName);
                speakerNameMap.set(normalizeSpeakerId(speaker.label), formattedName);
                console.log(`🎤 Using email-derived name (${confidencePercent.toFixed(0)}% confidence): ${speaker.label} -> ${formattedName}`);
              }
            });
          }
          
          // Viktigt: behåll alltid talarindelning i inputen till protokollgenerering.
          // Om vi saknar riktiga namn använder vi stabila generiska etiketter (Talare 1/2/...).
          const fallbackLabelMap = new Map<string, string>();
          const getFallbackLabel = (rawId: unknown) => {
            const id = String(rawId || 'unknown');
            const existing = fallbackLabelMap.get(id);
            if (existing) return existing;

            const numMatch = id.match(/(?:speaker|talare)[_\s-]?(\d+)/i);
            if (numMatch) {
              const label = `Talare ${parseInt(numMatch[1], 10) + 1}`;
              fallbackLabelMap.set(id, label);
              return label;
            }

            if (/^[A-Z]$/i.test(id)) {
              const label = `Talare ${id.toUpperCase()}`;
              fallbackLabelMap.set(id, label);
              return label;
            }

            const label = `Talare ${fallbackLabelMap.size + 1}`;
            fallbackLabelMap.set(id, label);
            return label;
          };

          const formattedSegments = transcriptSegments
            .filter(segment => segment && segment.text)
            .map(segment => {
              const speakerId = String(segment.speakerId || 'unknown');
              // Use lookup helper to find name with normalization fallback
              const label = lookupSpeakerName(speakerNameMap, speakerId, speakerIndexOffset) || getFallbackLabel(speakerId);
              return `[${label}]: ${segment.text || ''}`;
            });

          formattedTranscript = formattedSegments.length > 0
            ? formattedSegments.join('\n\n')
            : transcript;

          // Collect speaker info for logging (only real names)
          if (speakerNameMap.size > 0) {
            const speakerCounts = new Map<string, number>();
            transcriptSegments
              .filter(segment => segment && segment.speakerId && lookupSpeakerName(speakerNameMap, segment.speakerId, speakerIndexOffset))
              .forEach(segment => {
                const name = lookupSpeakerName(speakerNameMap, segment.speakerId!, speakerIndexOffset)!;
                speakerCounts.set(name, (speakerCounts.get(name) || 0) + 1);
              });
            speakerInfo = Array.from(speakerCounts.entries()).map(([name, segments]) => ({ name, segments }));

            console.log('🎤 Speaker-attributed transcript created with REAL names:', {
              speakersIdentified: speakerNameMap.size,
              speakerInfo,
              formattedTranscriptPreview: formattedTranscript.substring(0, 300)
            });
          } else {
            console.log('ℹ️ Inga riktiga talarnamn hittades – behåller talarindelning med generiska etiketter');
          }
        } else if (speakerBlocksCleaned && speakerBlocksCleaned.length > 0) {
          // Fallback: Use speakerBlocksCleaned (for SIS-disabled companies or when segments unavailable)
          // This provides AI-suggested speaker names from transcript cleanup
          
          // Helper to check if name is generic (reuse from above scope if needed)
          const isGenericNameBlock = (name: string): boolean => {
            const genericPatterns = [
              /^speaker[_\s-]?\d+$/i,
              /^talare[_\s-]?\d+$/i,
              /^unknown$/i,
              /^okänd$/i,
            ];
            return genericPatterns.some(p => p.test(name.trim()));
          };
          
          // Build speaker name map from propSpeakerNames (user edits) + block speakerNames
          const speakerNameMap = new Map<string, string>();

          const speakerIndexOffset = computeSpeakerIndexOffset(
            speakerBlocksCleaned.map((b) => String((b as any)?.speakerId ?? '')),
            (propSpeakerNames || {}) as Record<string, unknown>
          );
          
          // Priority 1: User-assigned names from propSpeakerNames
          if (propSpeakerNames && Object.keys(propSpeakerNames).length > 0) {
            Object.entries(propSpeakerNames).forEach(([label, name]) => {
              if (name && name.trim() && !isGenericNameBlock(name)) {
                // Store both original and normalized key
                speakerNameMap.set(label, name);
                speakerNameMap.set(normalizeSpeakerId(label), name);
                console.log(`🎤 Using propSpeakerNames for block: ${label} (${normalizeSpeakerId(label)}) -> ${name}`);
              }
            });
          }
          
          // Priority 2: Block's embedded speakerName
          speakerBlocksCleaned.forEach(block => {
            if (!lookupSpeakerName(speakerNameMap, block.speakerId, speakerIndexOffset) && block.speakerName && block.speakerName.trim() && !isGenericNameBlock(block.speakerName)) {
              speakerNameMap.set(block.speakerId, block.speakerName);
              speakerNameMap.set(normalizeSpeakerId(block.speakerId), block.speakerName);
              console.log(`🎤 Using block speakerName: ${block.speakerId} -> ${block.speakerName}`);
            }
          });
          
          // Behåll alltid talarindelning även när vi inte har riktiga namn.
          const fallbackLabelMap = new Map<string, string>();
          const getFallbackLabel = (rawId: unknown) => {
            const id = String(rawId || 'unknown');
            const existing = fallbackLabelMap.get(id);
            if (existing) return existing;

            const numMatch = id.match(/(?:speaker|talare)[_\s-]?(\d+)/i);
            if (numMatch) {
              const label = `Talare ${parseInt(numMatch[1], 10) + 1}`;
              fallbackLabelMap.set(id, label);
              return label;
            }

            if (/^[A-Z]$/i.test(id)) {
              const label = `Talare ${id.toUpperCase()}`;
              fallbackLabelMap.set(id, label);
              return label;
            }

            const label = `Talare ${fallbackLabelMap.size + 1}`;
            fallbackLabelMap.set(id, label);
            return label;
          };

          const formattedBlocks = speakerBlocksCleaned
            .filter(block => block && block.text)
            .map(block => {
              const speakerId = String(block.speakerId || 'unknown');
              // Use lookup helper for consistent name resolution
              const label = lookupSpeakerName(speakerNameMap, speakerId, speakerIndexOffset) || getFallbackLabel(speakerId);
              return `[${label}]: ${block.text}`;
            });

          formattedTranscript = formattedBlocks.length > 0 ? formattedBlocks.join('\n\n') : transcript;

          // Collect speaker info (only real names)
          if (speakerNameMap.size > 0) {
            const speakerCounts = new Map<string, number>();
            speakerBlocksCleaned
              .filter(block => lookupSpeakerName(speakerNameMap, block.speakerId, speakerIndexOffset))
              .forEach(block => {
                const name = lookupSpeakerName(speakerNameMap, block.speakerId, speakerIndexOffset)!;
                speakerCounts.set(name, (speakerCounts.get(name) || 0) + 1);
              });
            speakerInfo = Array.from(speakerCounts.entries()).map(([name, segments]) => ({ name, segments }));

            console.log('🎤 Speaker-attributed transcript from speakerBlocksCleaned:', {
              speakersIdentified: speakerNameMap.size,
              speakerInfo,
              formattedTranscriptPreview: formattedTranscript.substring(0, 300)
            });
          } else {
            console.log('ℹ️ Inga riktiga talarnamn i block – behåller talarindelning med generiska etiketter');
          }
        }
        
        const requestBody = {
          transcript: formattedTranscript,
          meetingName: fileName.replace('.docx', ''),
          agenda: agendaId ? await fetchAgendaContent(agendaId) : undefined,
          hasSpeakerAttribution: speakerInfo.length > 0,
          speakers: speakerInfo,
        };
        
        console.log('🚀 Calling analyzeMeetingAI via api.tivly.se:', {
          transcriptPreview: formattedTranscript.substring(0, 200),
          wordCount,
          hasAgenda: !!requestBody.agenda,
          hasSpeakerAttribution: requestBody.hasSpeakerAttribution,
          speakers: requestBody.speakers,
          isEnterprise
        });

        // Use the new API endpoint
        const data = await analyzeMeetingAI(
          formattedTranscript,
          fileName.replace('.docx', ''),
          {
            agenda: requestBody.agenda,
            hasSpeakerAttribution: requestBody.hasSpeakerAttribution,
            speakers: requestBody.speakers,
            isEnterprise,
          }
        );

        console.log("✅ Received protocol data:", {
          hasTitle: !!data.title,
          hasSummary: !!data.summary,
          summaryLength: data.summary?.length || 0,
          mainPointsCount: data.mainPoints?.length || 0,
          decisionsCount: data.decisions?.length || 0,
          actionItemsCount: data.actionItems?.length || 0
        });
        
        // Complete progress smoothly
        clearInterval(progressInterval);
        const animateToComplete = () => {
          setProgress(prev => {
            if (prev >= 100) return 100;
            return Math.min(prev + 2, 100);
          });
        };
        const completeInterval = setInterval(animateToComplete, 30);
        await new Promise(resolve => setTimeout(resolve, 250));
        clearInterval(completeInterval);
        setProgress(100);
        
        await new Promise(resolve => setTimeout(resolve, 200));
        
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
        setProgress(0);
        hasGeneratedRef.current = false; // Allow retry
        const errorMessage = error instanceof Error ? error.message : "Kunde inte generera protokollet. Försök igen.";
        toast({
          title: "Fel vid generering",
          description: errorMessage,
          variant: "destructive",
          duration: 8000,
        });
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

    // Minimal branding footer — clean enterprise banner
    documentChildren.push(
      new Paragraph({
        text: "",
        spacing: { before: 800 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: "tivly.se",
            color: "999999",
            size: 15,
            font: "Helvetica",
          }),
        ],
        alignment: AlignmentType.RIGHT,
        spacing: { after: 0 },
        border: {
          top: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0", space: 8 },
        },
      })
    );

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
      setHasDownloaded(true);
      toast({
        title: "Nedladdning startad",
        description: "Protokollet laddas ner till din enhet.",
        duration: 2000,
      });
    }
  };

  // Intercept close/back action to show warning
  const handleCloseAttempt = () => {
    // Show confirmation dialog for all users when protocol is generated
    if (generatedProtocol && !isGenerating) {
      setShowCloseConfirm(true);
    } else {
      onBack();
    }
  };

  const handleConfirmClose = () => {
    setShowCloseConfirm(false);
    onBack();
  };

  const handleShareFromDialog = () => {
    setShowCloseConfirm(false);
    setShowEmailDialog(true);
    setHasShared(true);
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
      console.warn('⚠️ No valid meeting ID - navigating to library');
      toast({
        title: "Protokoll klart",
        description: "Protokollet har genererats och är tillgängligt i biblioteket.",
        duration: 2000,
      });
      navigate("/library");
      return;
    }

    // Protocol is already saved via backend during generation
    // Navigate directly to the meeting page
    toast({
      title: "Protokoll sparat",
      description: "Protokollet har sparats på mötet.",
      duration: 2000,
    });
    
    navigate(`/meetings/${meetingId}`);
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
              {showCoffeeHint ? (
                <Coffee className="w-12 h-12 text-amber-500 animate-pulse" />
              ) : (
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
              )}
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">
                {showCoffeeHint ? "Perfekt tillfälle för en kaffe! ☕" : "Genererar protokoll"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {showCoffeeHint 
                  ? "Stora inspelningar tar lite längre tid att bearbeta." 
                  : "AI analyserar ditt möte..."}
              </p>
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

          {/* Coffee break message for large transcripts */}
          {showCoffeeHint && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 animate-fade-in">
              <div className="flex items-start gap-3">
                <Coffee className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-amber-600 dark:text-amber-400">
                    Vänta lugnt – det arbetar på!
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Även om det verkar ha fastnat, så pågår bearbetningen i bakgrunden. 
                    Stora möten ({wordCount.toLocaleString('sv-SE')} ord) kräver extra tid för noggrann analys.
                  </p>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    );
  }

  if (!generatedProtocol) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 space-y-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <FileText className="w-8 h-8 text-destructive" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">Protokollet kunde inte genereras</h3>
              <p className="text-sm text-muted-foreground">
                Något gick fel. Tryck på knappen nedan för att försöka igen.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <Button
              onClick={() => {
                hasGeneratedRef.current = false;
                setIsGenerating(true);
                setProgress(0);
                // Force re-trigger the useEffect
                setGeneratedProtocol(null);
                // Manually re-run
                window.location.reload();
              }}
              className="w-full"
            >
              <Loader2 className="mr-2 h-4 w-4" />
              Försök igen
            </Button>
            <Button variant="outline" onClick={onBack} className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Tillbaka
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background border-b">
        <div className="container mx-auto px-3 sm:px-4 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCloseAttempt}
              className="self-start"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Tillbaka
            </Button>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowEmailDialog(true);
                  setHasShared(true);
                }}
                disabled={!documentBlob}
                className="flex-1 sm:flex-none min-w-0"
              >
                <Share2 className="w-4 h-4 sm:mr-2 flex-shrink-0" />
                <span className="hidden sm:inline">Dela</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={!documentBlob}
                className="flex-1 sm:flex-none min-w-0"
              >
                <Download className="w-4 h-4 sm:mr-2 flex-shrink-0" />
                <span className="hidden sm:inline">Ladda ner</span>
              </Button>
              {/* Hide Save button for free users - they don't have library access */}
              {!isFreeTrialMode && (
                <Button
                  size="sm"
                  onClick={handleSave}
                  className="flex-1 sm:flex-none min-w-0"
                >
                  <Save className="w-4 h-4 sm:mr-2 flex-shrink-0" />
                  <span className="hidden sm:inline">Spara</span>
                </Button>
              )}
              {/* Show "Klar" button for free users to go back */}
              {isFreeTrialMode && (
                <Button
                  size="sm"
                  onClick={handleCloseAttempt}
                  className="flex-1 sm:flex-none min-w-0"
                >
                  <CheckCircle2 className="w-4 h-4 sm:mr-2 flex-shrink-0" />
                  <span className="hidden sm:inline">Klar</span>
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

      <ConfirmCloseProtocolDialog
        open={showCloseConfirm}
        onOpenChange={setShowCloseConfirm}
        onConfirmClose={handleConfirmClose}
        onDownload={handleDownload}
        onShare={handleShareFromDialog}
        isFreeUser={isFreeTrialMode}
        hasDownloaded={hasDownloaded}
        hasShared={hasShared}
      />
    </div>
  );
};
