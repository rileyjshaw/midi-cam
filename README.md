# MIDI Cam

MIDI Cam turns camera-tracked MediaPipe landmarks into MIDI CC messages. Each tracked performer is assigned an ascending MIDI channel, with up to four performers.

## Run locally

```bash
npm install
npm run dev
```

Use a browser with WebGL 2, camera access, and Web MIDI support. Camera and MIDI access require a secure context outside localhost.

## Commands

- `npm run dev` — start the development server
- `npm run build` — type-check and create a production build
- `npm test` — run measurement and configuration tests
