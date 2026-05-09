# Twin Sound Assets

Drop three short MP3s here to enable the demo audio cues. Files are loaded
opportunistically by `lib/use-twin-sound.ts` — the app stays usable when they
are missing.

| Filename | Played when… | Vibe |
|---|---|---|
| `listening.mp3` | Maria starts speaking, voice orb pulses | warm hum, ~0.4 s, fade-in |
| `done.mp3` | A send/transfer completes, postcard mounts | satisfying chime, ~0.5 s |
| `receive.mp3` | Tom's notification card pops in | iMessage-style ding, ~0.4 s |

## Where to source

- [freesound.org](https://freesound.org) — search "ui ding", "chime",
  "soft hum"; filter for CC0 licenses.
- [pixabay.com/sound-effects](https://pixabay.com/sound-effects/) — royalty
  free, instant download.
- Apple's system sound library if you're recording from a Mac (use macOS
  *VoiceOver* or *System Sounds* paths) — for personal demo use only.

## Encoding

- Mono, 44.1 kHz, 96 kbps MP3 is plenty.
- Total combined size should stay under 200 KB so the page stays snappy.

## Verify

Reload the demo, trigger a send → you should hear `done.mp3` after the
postcard mounts. If you hear nothing, check the browser console for
autoplay policy warnings — Maria/Tom must have interacted with the page
once before audio fires (the voice button counts).
