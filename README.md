# Live Presentation Coach

This project gives you a live presentation practice interface using your laptop webcam and microphone.

## What it does

- Captures webcam + microphone during a practice session
- Shows live timer and camera preview
- Tracks speaking pace (words per minute)
- Detects filler words from transcript
- Detects long pauses between speech events
- Estimates vocal energy from mic levels
- Generates coaching feedback and an overall score when you stop
- Lets you download the recorded practice session
- Includes live debate mode with AI counterarguments
- Speaks AI rebuttals through laptop speakers using browser text-to-speech

## Debate mode

1. Click `Start Live Coaching` and allow camera/microphone.
2. Enter a debate topic.
3. Choose your position (For or Against).
4. Click `Enable Debate`.
5. Speak your arguments in English.
6. After short pauses, AI gives cross-arguments and reads them aloud.
7. Click `Disable Debate` to stop debate responses.

## Requirements

- Modern browser (best with Chrome or Edge)
- Camera and microphone permissions enabled

## Run

Option 1:

1. Open this folder in VS Code.
2. Right-click `index.html` and open with Live Server extension.

Option 2:

1. Open terminal in this folder.
2. Run:

```powershell
python -m http.server 5500
```

3. Open `http://localhost:5500` in your browser.

## Notes

- Live transcript uses Web Speech API, which is browser-dependent.
- If transcript is not supported, recording and audio energy tracking still work.
- Debate voice replies use browser Speech Synthesis API.
- For reliable feedback, practice for at least 2 minutes.

## Next upgrade ideas

- Add eye-contact tracking with face detection
- Add slide sync mode with prompts
- Save session history and score trends
