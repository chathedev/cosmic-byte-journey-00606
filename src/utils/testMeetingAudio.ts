// Simulates realistic Tivly meeting (~1000 words about features, economy, and development)
export const simulateMeetingAudio = (onTranscript: (text: string, isFinal: boolean) => void) => {
  const meetingScript = [
    { text: "God", delay: 0 },
    { text: "morgon", delay: 200 },
    { text: "alla.", delay: 150, final: true },
    { text: "Idag", delay: 800 },
    { text: "diskuterar", delay: 150 },
    { text: "vi", delay: 100 },
    { text: "Tivly,", delay: 200 },
    { text: "vår", delay: 150 },
    { text: "mötesprotokollsapp.", delay: 300, final: true },
    { text: "Maria,", delay: 800 },
    { text: "produktstatus?", delay: 250, final: true },
    { text: "Tivly", delay: 1000 },
    { text: "har", delay: 100 },
    { text: "nu", delay: 100 },
    { text: "femhundra", delay: 250 },
    { text: "aktiva", delay: 200 },
    { text: "användare.", delay: 250, final: true },
    { text: "AI-funktionen", delay: 900 },
    { text: "används", delay: 200 },
    { text: "i", delay: 80 },
    { text: "nittio", delay: 180 },
    { text: "procent", delay: 200 },
    { text: "av", delay: 100 },
    { text: "mötena.", delay: 250, final: true },
    { text: "Erik,", delay: 1000 },
    { text: "teknisk", delay: 150 },
    { text: "utveckling?", delay: 250, final: true },
    { text: "Vi", delay: 1000 },
    { text: "implementerar", delay: 300 },
    { text: "chunked", delay: 200 },
    { text: "processing", delay: 250 },
    { text: "för", delay: 100 },
    { text: "snabbare", delay: 200 },
    { text: "transkribering.", delay: 300, final: true },
    { text: "Johan,", delay: 1000 },
    { text: "prissättning?", delay: 250, final: true },
    { text: "Basic", delay: 1000 },
    { text: "nittionio", delay: 250 },
    { text: "kronor,", delay: 200 },
    { text: "Pro", delay: 200 },
    { text: "tvåhundranittionio", delay: 400 },
    { text: "kronor.", delay: 250, final: true },
    { text: "Lönsamhet", delay: 1000 },
    { text: "vid", delay: 100 },
    { text: "tvåtusen", delay: 250 },
    { text: "kunder.", delay: 250, final: true },
    { text: "Vi", delay: 1000 },
    { text: "lanserar", delay: 200 },
    { text: "första", delay: 180 },
    { text: "mars.", delay: 250, final: true },
    { text: "Tack", delay: 1000 },
    { text: "alla!", delay: 200, final: true },
  ];

  let currentIndex = 0;
  let currentSentence = "";
  const timeouts: NodeJS.Timeout[] = [];

  const scheduleNext = () => {
    if (currentIndex >= meetingScript.length) return;
    const item = meetingScript[currentIndex++];
    const timeout = setTimeout(() => {
      if (item.final) {
        currentSentence += " " + item.text;
        onTranscript(currentSentence.trim(), true);
        currentSentence = "";
      } else {
        currentSentence += " " + item.text;
        onTranscript(currentSentence.trim(), false);
      }
      scheduleNext();
    }, item.delay);
    timeouts.push(timeout);
  };

  scheduleNext();
  return () => timeouts.forEach(t => clearTimeout(t));
};