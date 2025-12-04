# Frontend Library-First Transcription Flow

## Översikt

Transkriptionsflödet är nu "Library-first": inspelningen avslutas, användaren trycker "Färdig", och de skickas direkt till biblioteket där transkriptionen körs och sparas. Allt är på svenska i klienten, och webbläsaren anropar aldrig ASR-tjänsten direkt.

## Gyllene regler

- **Endast api.tivly.se**: Frontend ska endast kommunicera med `api.tivly.se`. Backend vidarebefordrar ljud till `https://asr.api.tivly.se/transcribe`.
- **meetingId är obligatoriskt**: Utan `meetingId` avvisar backend förfrågan.
- **Auto-redirect till bibliotek**: Så fort användaren trycker "Färdig" sparas mötet och användaren skickas till `/library`.
- **Protokoll endast från biblioteket**: Protokollskapande är endast tillåtet från biblioteket när transkriptet är klart.

## API-kontrakt (backend)

### POST /transcribe
- **Auth**: `Authorization: Bearer <token>`
- **Body**: `meetingId` (obligatoriskt), valfritt `meetingTitle`, `language` (default `sv`), `modelSize` (tiny/base/small/medium/large)
- **Audio**: multipart `audioFile` eller `file` (wav/mp3/m4a) föredras; fallback `audioData` (base64). Max 250MB.
- **Svar vid framgång**: 
  ```json
  { 
    "success": true, 
    "status": "done", 
    "transcript": "...", 
    "path": "...", 
    "jsonPath": "...", 
    "duration": 123.4, 
    "processing_time": 5.2, 
    "notified": true 
  }
  ```
- **Svar vid fel**: `{ "success": false, "error": "asr_failed" }` med HTTP 502/500

### GET /meetings/:id/transcription
- **Auth**: Obligatoriskt
- **Returnerar**: 
  ```json
  { 
    "success": true, 
    "status": "processing|done|failed", 
    "transcript": "...", 
    "path": "...", 
    "jsonPath": "...", 
    "duration": 123.4, 
    "processing_time": 5.2, 
    "notified": true, 
    "error": "...", 
    "updatedAt": "..." 
  }
  ```

## Frontend-flöde (per möte)

1. **Avsluta inspelning** → tryck "Färdig" → spara möte till bibliotek med `status: 'processing'`
2. **Ladda upp ljud** via `POST /transcribe` med `meetingId`
3. **Redirect till `/library`** - visa "Laddar upp…" under uppladdning
4. **I biblioteket**: Visa "Analyserar…" och polla `GET /meetings/:id/transcription` var 3-5 sekund
5. **När `status === 'done'`**: Visa transkriptet, aktivera protokollåtgärder
6. **När `status === 'failed'`**: Visa "Transkribering misslyckades" + "Försök igen"-knapp
7. **Vid sidstängning/refresh**: Återuppta från `GET /meetings/:id/transcription`

## UI-tillstånd och texter (Svenska)

| Tillstånd | Text |
|-----------|------|
| Uppladdning pågår | "Laddar upp…" |
| Transkribering pågår | "Analyserar…" |
| Klar | "Klar" / visar transkript |
| Misslyckades | "Misslyckades" + "Försök igen" |

### Knappar
- **Försök igen**: Anropar `POST /transcribe` igen
- **Skapa protokoll**: Endast aktiv när `status === 'done'`
- **Visa underlag**: Länk till `jsonPath` för audit

## E-postnotifikation (Minimalistisk, Svenska)

Skickas server-side när transkribering är klar (en gång per möte).

**Ämne**: `Transkriberingen är klar`

**Brödtext**:
```
Hej,

Transkriberingen för "<mötestitel>" är klar och finns i biblioteket.

Vänliga hälsningar,
Tivly
```

- Skickas endast till autentiserad användares verifierade e-post
- Inget transkriptinnehåll i e-posten

## Säkerhet & Resiliens

- Alla uppladdningar och polling går till `api.tivly.se`
- Status sparas innan ASR kontaktas
- Fel loggas server-side, visas som "Transkribering misslyckades" för användaren
- Protokollskapande blockeras tills transkriptet är klart

## Checklista för frontend

- [x] Kräv `meetingId` i varje transkriptionsanrop
- [x] Redirect till `/library` vid "Färdig" - stanna aldrig på inspelningssidan
- [x] Polla `GET /meetings/:id/transcription` tills `status` ändras från `processing`
- [x] Spara UI-status från API-svar - lita inte på client-only progress
- [x] Inaktivera protokollåtgärder tills `status === 'done'`
- [x] Håll labels på svenska och korta
- [x] Håll audit-länkar till `jsonPath`, inte ASR-hosten

## Teknisk implementation

### RecordingViewNew.tsx
- `handleStopRecording()`: Stoppar inspelning, sparar möte, laddar upp ljud, redirectar till bibliotek
- `saveAndUpload()`: Sparar möte med `transcriptionStatus: 'processing'`, laddar upp ljud via `apiClient.uploadForTranscription()`
- ViewStates: `'recording'`, `'uploading'`, `'error'`

### Library.tsx
- Polling med `useEffect` och `setInterval` för möten med `transcriptionStatus: 'processing'`
- Uppdaterar transcript och status när backend returnerar `status: 'done'`
- Visar "Analyserar…" badge för möten under bearbetning

### api.ts
- `uploadForTranscription()`: Laddar upp ljud med `meetingId`
- `getTranscriptionStatus()`: Pollar transkriptionsstatus
