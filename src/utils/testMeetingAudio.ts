// Simulates realistic meeting audio for testing
export const simulateMeetingAudio = (onTranscript: (text: string, isFinal: boolean) => void) => {
  const meetingScript = [
    { text: "Hej", delay: 0 },
    { text: "allihopa", delay: 300 },
    { text: "och", delay: 150 },
    { text: "välkomna", delay: 200 },
    { text: "till", delay: 100 },
    { text: "dagens", delay: 150 },
    { text: "möte.", delay: 200, final: true },
    
    { text: "Vi", delay: 800 },
    { text: "ska", delay: 100 },
    { text: "idag", delay: 150 },
    { text: "diskutera", delay: 200 },
    { text: "tre", delay: 150 },
    { text: "viktiga", delay: 200 },
    { text: "punkter.", delay: 250, final: true },
    
    { text: "För", delay: 900 },
    { text: "det", delay: 100 },
    { text: "första", delay: 150 },
    { text: "behöver", delay: 200 },
    { text: "vi", delay: 100 },
    { text: "gå", delay: 100 },
    { text: "igenom", delay: 150 },
    { text: "projektets", delay: 200 },
    { text: "nuvarande", delay: 200 },
    { text: "status", delay: 200 },
    { text: "och", delay: 150 },
    { text: "se", delay: 100 },
    { text: "till", delay: 100 },
    { text: "att", delay: 100 },
    { text: "alla", delay: 150 },
    { text: "är", delay: 100 },
    { text: "på", delay: 100 },
    { text: "samma", delay: 150 },
    { text: "sida.", delay: 200, final: true },
    
    { text: "Det", delay: 1000 },
    { text: "andra", delay: 150 },
    { text: "ämnet", delay: 200 },
    { text: "handlar", delay: 200 },
    { text: "om", delay: 150 },
    { text: "budgeten", delay: 200 },
    { text: "för", delay: 150 },
    { text: "nästa", delay: 150 },
    { text: "kvartal.", delay: 200, final: true },
    
    { text: "Vi", delay: 800 },
    { text: "har", delay: 100 },
    { text: "sett", delay: 150 },
    { text: "en", delay: 100 },
    { text: "ökning", delay: 200 },
    { text: "i", delay: 100 },
    { text: "kostnaderna", delay: 250 },
    { text: "och", delay: 150 },
    { text: "måste", delay: 200 },
    { text: "ta", delay: 100 },
    { text: "några", delay: 150 },
    { text: "beslut.", delay: 200, final: true },
    
    { text: "Slutligen", delay: 1000 },
    { text: "vill", delay: 150 },
    { text: "jag", delay: 100 },
    { text: "att", delay: 100 },
    { text: "vi", delay: 100 },
    { text: "pratar", delay: 150 },
    { text: "om", delay: 100 },
    { text: "våra", delay: 150 },
    { text: "mål", delay: 200 },
    { text: "för", delay: 150 },
    { text: "resten", delay: 200 },
    { text: "av", delay: 100 },
    { text: "året.", delay: 200, final: true },
  ];

  let currentIndex = 0;
  let currentSentence = "";
  const timeouts: NodeJS.Timeout[] = [];

  const scheduleNext = () => {
    if (currentIndex >= meetingScript.length) {
      return;
    }

    const item = meetingScript[currentIndex];
    currentIndex++;

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

  // Return cleanup function
  return () => {
    timeouts.forEach(t => clearTimeout(t));
  };
};
