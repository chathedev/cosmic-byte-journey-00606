import { MeetingSession } from '@/utils/meetingStorage';

// Check if user is a test/demo account
export function isTestAccount(email: string | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return (
    lower.includes('test') ||
    lower.includes('demo') ||
    lower.endsWith('@example.com') ||
    lower === 'demo@tivly.se' ||
    lower === 'test@tivly.se'
  );
}

// Generate demo meetings for test accounts
export function generateDemoMeetings(userId: string): MeetingSession[] {
  const now = new Date();
  
  return [
    {
      id: 'demo-meeting-1',
      title: 'Styrelsemöte Q4 2024',
      transcript: 'Mötet öppnades kl 09:00 av ordförande Maria Lindqvist. Närvarande: Maria Lindqvist (ordförande), Erik Johansson, Anna Bergström, Johan Nilsson och Lisa Andersson. Dagordningen godkändes utan ändringar. Under punkten ekonomisk rapport presenterade Erik Q3-resultatet som visade en omsättningsökning på 12% jämfört med föregående år. Beslut fattades om att investera 500 000 kr i nytt CRM-system. Nästa möte planerades till den 15 januari 2025.',
      createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      userId,
      folder: 'Styrelsemöten',
      source: 'live' as const,
      protocol: 'demo-protocol-1',
      transcriptionStatus: 'done' as const,
    },
    {
      id: 'demo-meeting-2',
      title: 'Produktutveckling Sprint Review',
      transcript: 'Sprint 23 avslutades framgångsrikt med 34 av 38 story points levererade. Teamet presenterade den nya betalningslösningen som nu är redo för beta-testning. Diskussion om kommande sprint: fokus på mobilappens prestanda och nya notifikationssystem. Emma visade prototyp för det uppdaterade användargränssnittet som fick positiv feedback. Teknisk skuld-arbete planeras för vecka 48.',
      createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      userId,
      folder: 'Produktmöten',
      source: 'live' as const,
      transcriptionStatus: 'done' as const,
    },
    {
      id: 'demo-meeting-3',
      title: 'Kundmöte - Acme AB',
      transcript: 'Möte med Acme AB angående förnyelse av årligt avtal. Kunden är nöjd med tjänsten och önskar utöka användningen till fler avdelningar. Diskuterade enterprise-funktioner och prissättning för 200+ användare. Kunden bad om referenscase från liknande organisationer. Uppföljningsmöte bokades till nästa vecka för att presentera offert.',
      createdAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      userId,
      folder: 'Kundmöten',
      source: 'upload' as const,
      protocol: 'demo-protocol-3',
      transcriptionStatus: 'done' as const,
    },
    {
      id: 'demo-meeting-4',
      title: 'Veckomöte Marketing',
      transcript: 'Marketing-teamets veckomöte. Kampanjresultat för november visar 45% högre engagement än föregående månad. Social media-strategin justeras för Q1 2025 med fokus på video-innehåll. Budget för influencer-samarbeten godkänd. Ny landningssida för produktlanseringen ska vara klar senast 1 december.',
      createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      userId,
      folder: 'Marketing',
      source: 'live' as const,
      transcriptionStatus: 'done' as const,
    },
    {
      id: 'demo-meeting-5',
      title: 'HR Intervju - Senior Developer',
      transcript: 'Intervju med kandidat för senior developer-rollen. Kandidaten har 8 års erfarenhet inom fullstack-utveckling med fokus på React och Node.js. Goda kunskaper inom systemarkitektur och molnlösningar. Kulturellt god match med teamet. Referenstagning planeras och teknisk intervju bokas med utvecklingsteamet.',
      createdAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      userId,
      folder: 'HR',
      source: 'upload' as const,
      transcriptionStatus: 'done' as const,
    },
  ];
}

// Generate demo folders for test accounts
export function generateDemoFolders(): string[] {
  return ['Styrelsemöten', 'Produktmöten', 'Kundmöten', 'Marketing', 'HR'];
}

// Generate demo protocol status for test accounts
export function generateDemoProtocolStatus(): Record<string, any> {
  return {
    'demo-meeting-1': {
      storedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      fileName: 'Styrelsemote_Q4_2024.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    'demo-meeting-3': {
      storedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      fileName: 'Kundmote_Acme_AB.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
  };
}
