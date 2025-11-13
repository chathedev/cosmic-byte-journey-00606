// Simulates realistic Tivly meeting - fast 1 second simulation
export const simulateMeetingAudio = (onTranscript: (text: string, isFinal: boolean) => void) => {
  const meetingScript = [
    { text: "God", delay: 0 },
    { text: "morgon", delay: 20 },
    { text: "alla.", delay: 15, final: true },
    { text: "Idag", delay: 30 },
    { text: "diskuterar", delay: 15 },
    { text: "vi", delay: 10 },
    { text: "Tivly,", delay: 20 },
    { text: "vår", delay: 15 },
    { text: "mötesprotokollsapp.", delay: 30, final: true },
    { text: "Maria,", delay: 25 },
    { text: "produktstatus?", delay: 25, final: true },
    { text: "Tivly", delay: 30 },
    { text: "har", delay: 10 },
    { text: "nu", delay: 10 },
    { text: "femhundra", delay: 25 },
    { text: "aktiva", delay: 20 },
    { text: "användare.", delay: 25, final: true },
    { text: "AI-funktionen", delay: 30 },
    { text: "används", delay: 20 },
    { text: "i", delay: 8 },
    { text: "nittio", delay: 18 },
    { text: "procent", delay: 20 },
    { text: "av", delay: 10 },
    { text: "mötena.", delay: 25, final: true },
    { text: "Erik,", delay: 30 },
    { text: "teknisk", delay: 15 },
    { text: "utveckling?", delay: 25, final: true },
    { text: "Vi", delay: 30 },
    { text: "implementerar", delay: 30 },
    { text: "chunked", delay: 20 },
    { text: "processing", delay: 25 },
    { text: "för", delay: 10 },
    { text: "snabbare", delay: 20 },
    { text: "transkribering.", delay: 30, final: true },
    { text: "Johan,", delay: 30 },
    { text: "prissättning?", delay: 25, final: true },
    { text: "Basic", delay: 30 },
    { text: "nittionio", delay: 25 },
    { text: "kronor,", delay: 20 },
    { text: "Pro", delay: 20 },
    { text: "tvåhundranittionio", delay: 40 },
    { text: "kronor.", delay: 25, final: true },
    { text: "Lönsamhet", delay: 30 },
    { text: "vid", delay: 10 },
    { text: "tvåtusen", delay: 25 },
    { text: "kunder.", delay: 25, final: true },
    { text: "Vi", delay: 30 },
    { text: "lanserar", delay: 20 },
    { text: "första", delay: 18 },
    { text: "mars.", delay: 25, final: true },
    { text: "Tack", delay: 30 },
    { text: "alla!", delay: 20, final: true },
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