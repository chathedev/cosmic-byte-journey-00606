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

// Demo protocol HTML content for preview
const DEMO_PROTOCOL_HTML_1 = `
<h1>Mötesprotokoll - Styrelsemöte Q4 2024</h1>
<p><strong>Datum:</strong> ${new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toLocaleDateString('sv-SE')}</p>
<p><strong>Tid:</strong> 09:00 - 12:30</p>
<p><strong>Plats:</strong> Huvudkontoret, Konferensrum Vega</p>
<p><strong>Närvarande:</strong> Maria Lindqvist (ordförande), Erik Johansson (VD), Anna Bergström (CFO), Johan Nilsson (CTO), Lisa Andersson (HR-direktör)</p>
<p><strong>Protokollförare:</strong> Lisa Andersson</p>

<h2>1. Mötets öppnande och godkännande av dagordning</h2>
<p>Ordförande Maria Lindqvist hälsade samtliga styrelseledamöter välkomna till årets sista ordinarie styrelsemöte. Hon inledde med att tacka för ett framgångsrikt år och betonade vikten av de strategiska beslut som fattats under året. Dagordningen hade distribuerats i förväg och godkändes enhälligt efter att Johan Nilsson föreslog att punkten om IT-infrastruktur skulle flyttas upp på agendan med hänsyn till dess brådskande karaktär. Samtliga ledamöter bekräftade att de tagit del av det utskickade underlaget och var redo att behandla de planerade ärendena. Ordföranden noterade att mötet var beslutsmässigt med samtliga ordinarie ledamöter närvarande.</p>

<h2>2. Ekonomisk rapport och resultatgenomgång</h2>
<p>CFO Anna Bergström presenterade en omfattande genomgång av bolagets ekonomiska ställning per Q3 2024. Omsättningen uppgick till 47,3 miljoner kronor, vilket innebär en ökning med 12% jämfört med motsvarande period föregående år. Rörelsemarginalen förbättrades till 18,4% från tidigare 15,2%, primärt drivet av effektiviseringar inom produktionskedjan och en mer fördelaktig produktmix. Kassaflödet från den löpande verksamheten var starkt positivt och uppgick till 8,2 miljoner kronor. Bergström framhöll särskilt att kundanskaffningskostnaden minskat med 23% tack vare de digitala marknadsföringsinsatserna som implementerades under våren. Prognosen för helåret 2024 justerades upp med 4% baserat på det starka Q3-resultatet och den positiva orderingången under oktober månad.</p>

<h2>3. Strategisk investering i CRM-system</h2>
<p>VD Erik Johansson presenterade förslaget om investering i ett nytt kundhanteringssystem (CRM) för att stödja bolagets tillväxtambitioner. Den nuvarande lösningen har nått sina kapacitetsgränser och begränsar möjligheterna till avancerad kundanalys och automatiserad marknadsföring. Efter en gedigen utvärderingsprocess där fyra leverantörer deltog, rekommenderade ledningsgruppen Salesforce Enterprise som det mest lämpliga alternativet. Implementeringen beräknas ta sex månader och omfattar integration med befintliga system för ekonomi, lager och e-handel. Kostnaden uppgår till 500 000 kronor för implementering samt 180 000 kronor i årlig licensavgift. Styrelsen fattade enhälligt beslut om att godkänna investeringen, med villkoret att en detaljerad implementeringsplan presenteras vid nästa styrelsemöte. Erik Johansson utsågs till projektägare med ansvar för att tillsätta en intern projektgrupp.</p>

<h2>4. Avslutning och nästa möte</h2>
<p>Ordföranden tackade samtliga för ett konstruktivt och framåtblickande möte. Hon sammanfattade de viktigaste besluten: godkännande av CRM-investeringen, uppdaterad budget för 2025 samt den reviderade expansionsstrategin för nordiska marknaden. Nästa ordinarie styrelsemöte fastställdes till den 15 januari 2025 klockan 09:00 på huvudkontoret. Vid det mötet kommer bland annat årsbokslut, revisionsrapport och förslag till utdelning att behandlas. Ordföranden avslutade mötet klockan 12:30 och önskade samtliga en god jul och ett gott nytt år.</p>
`;

const DEMO_PROTOCOL_HTML_3 = `
<h1>Mötesprotokoll - Kundmöte Acme AB</h1>
<p><strong>Datum:</strong> ${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('sv-SE')}</p>
<p><strong>Tid:</strong> 14:00 - 15:45</p>
<p><strong>Plats:</strong> Microsoft Teams</p>
<p><strong>Deltagare från Acme AB:</strong> Magnus Eriksson (IT-chef), Sara Lindgren (Inköpsansvarig), Per Olofsson (Projektledare)</p>
<p><strong>Deltagare från oss:</strong> Henrik Svensson (Key Account Manager), Emma Karlsson (Teknisk specialist)</p>
<p><strong>Protokollförare:</strong> Henrik Svensson</p>

<h2>1. Bakgrund och nuvarande samarbete</h2>
<p>Henrik Svensson inledde mötet med en översikt av det pågående samarbetet mellan våra organisationer. Acme AB har varit kund sedan mars 2022 och använder idag vår Standard-licens med 45 aktiva användare fördelade på tre avdelningar: ekonomi, HR och marknadsföring. Under de senaste 18 månaderna har användningen ökat stadigt och kundnöjdheten har varit genomgående hög, vilket bekräftades av de senaste NPS-mätningarna där Acme AB gav betyget 9 av 10. Magnus Eriksson uttryckte sin tillfredsställelse med plattformens stabilitet och den responsiva supporten, särskilt vid den kritiska systemuppgraderingen i september då vårt team arbetade över helgen för att minimera störningar i Acme AB:s verksamhet.</p>

<h2>2. Expansion och utökade behov</h2>
<p>Sara Lindgren presenterade Acme AB:s planer på att expandera användningen till ytterligare fyra avdelningar: produktion, logistik, försäljning och kundtjänst. Detta skulle innebära en ökning från nuvarande 45 till cirka 220 användare under första halvåret 2025. Per Olofsson beskrev de specifika behoven för de nya avdelningarna, inklusive avancerade rapporteringsfunktioner, integration med deras SAP-system samt möjlighet till anpassade arbetsflöden för produktionsavdelningen. Emma Karlsson bekräftade att samtliga dessa krav kan tillgodoses inom ramen för vår Enterprise-licens och presenterade en teknisk översikt av integrationsmöjligheterna. Diskussionen landade i att en pilot med 30 användare från produktionsavdelningen skulle kunna startas redan i januari för att validera arbetsflödena innan full utrullning.</p>

<h2>3. Prisförslag och avtalsvillkor</h2>
<p>Henrik Svensson presenterade ett preliminärt prisförslag för Enterprise-licensen baserat på 200+ användare. Förslaget inkluderar volymbrabatt, dedikerad kundansvarig, prioriterad support med garanterad svarstid på max 2 timmar samt kvartalsvisa strategimöten. Sara Lindgren bad om referenscase från liknande organisationer inom tillverkningsindustrin, vilket Henrik åtog sig att ta fram till nästa möte. Magnus Eriksson lyfte frågan om datamigration från det parallella system som produktionsavdelningen använder idag, och Emma Karlsson föreslog en workshop för att kartlägga datastrukturen och planera migrationen. Ett uppföljningsmöte bokades till nästa vecka tisdag klockan 10:00 då ett formellt offertdokument kommer att presenteras tillsammans med de efterfrågade referenscasen och en detaljerad implementeringsplan.</p>
`;

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

// Get demo protocol data for viewing (returns protocol object similar to backend)
export function getDemoProtocol(meetingId: string): { protocol: any } | null {
  if (meetingId === 'demo-meeting-1') {
    return {
      protocol: {
        fileName: 'Styrelsemote_Q4_2024.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        storedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        size: 15234,
        blob: '', // Empty blob, but we have HTML for preview
        htmlContent: DEMO_PROTOCOL_HTML_1,
      }
    };
  }
  if (meetingId === 'demo-meeting-3') {
    return {
      protocol: {
        fileName: 'Kundmote_Acme_AB.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        storedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        size: 12456,
        blob: '', // Empty blob, but we have HTML for preview
        htmlContent: DEMO_PROTOCOL_HTML_3,
      }
    };
  }
  return null;
}
