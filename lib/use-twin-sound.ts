"use client"

// Tiny sound utility — plays optional MP3s from /public/sounds/ at key
// moments (listening start, tool done, message received). Fails silently
// when the file is missing so the app stays usable even before the
// hackathon team drops the audio assets in.
//
// Place files at:
//   public/sounds/listening.mp3
//   public/sounds/done.mp3
//   public/sounds/receive.mp3
//
// Source ideas: freesound.org, pixabay.com, OpenAI's chime samples.

import { useCallback, useEffect, useRef } from "react"

const SOUND_FILES = {
  listening: "/sounds/listening.mp3",
  done: "/sounds/done.mp3",
  receive: "/sounds/receive.mp3",
} as const

export type TwinSound = keyof typeof SOUND_FILES

export function useTwinSound() {
  const cache = useRef<Map<TwinSound, HTMLAudioElement>>(new Map())

  useEffect(() => {
    const local = cache.current
    return () => {
      local.forEach((a) => {
        try {
          a.pause()
        } catch {}
      })
      local.clear()
    }
  }, [])

  const play = useCallback((sound: TwinSound, volume = 0.5) => {
    if (typeof window === "undefined") return
    try {
      let audio = cache.current.get(sound)
      if (!audio) {
        audio = new Audio(SOUND_FILES[sound])
        audio.preload = "auto"
        cache.current.set(sound, audio)
      }
      audio.volume = volume
      audio.currentTime = 0
      void audio.play().catch(() => {
        // No user gesture yet, or file missing — silent skip.
      })
    } catch {
      // ignore
    }
  }, [])

  return { play }
}
