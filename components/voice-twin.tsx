"use client"

// VoiceTwin — WebRTC bridge to OpenAI Realtime (gpt-4o-realtime-preview).
//
// Flow:
//  1. POST /api/voice with the user's Privy token + ensName → ephemeral key.
//  2. Open RTCPeerConnection: add mic track, register an "oai-events" data
//     channel, generate SDP offer, POST it to https://api.openai.com/v1/realtime
//     with the ephemeral key, set the returned answer.
//  3. Once the data channel opens, send `session.update` with our tool list
//     (mirrors lib/twin-tools.ts via lib/voice-tools.ts).
//  4. On `response.function_call_arguments.done` events, POST to
//     /api/twin-tool with { name, input }. Stream the result back as a
//     conversation.item.create(function_call_output) and trigger
//     response.create so the model can speak the answer.
//  5. Display user + assistant transcripts inline.
//
// Ephemeral key expiry (~60s):
//  We schedule a renewal at expires_at - 10s. On renewal we just refresh the
//  in-memory `clientSecret` so a future reconnect uses fresh creds. The
//  current PeerConnection is NOT bound to the key after handshake — OpenAI
//  keeps the data channel open. If the connection drops we surface a "Tap
//  to reconnect" pill, which the user can hit to spin up a new session.
//
// Drop rule: if /api/voice returns 503 (or any non-2xx), we render a
// "Voice unavailable — using chat" card with a switch-to-chat button.

import { useCallback, useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Mic, MicOff, MessageCircle, AlertTriangle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { voiceTools, type RealtimeToolDef } from "@/lib/voice-tools"

type VoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error"
  | "unavailable"

type Transcript = {
  id: string
  role: "user" | "assistant"
  text: string
  partial?: boolean
}

type VoiceTwinProps = {
  ensName: string
  getAuthToken: () => Promise<string | null>
  onSwitchToChat?: () => void
  className?: string
}

type VoiceSession = {
  client_secret: string
  model: string
  expires_at: number
  ensName: string
}

// OpenAI Realtime data-channel events we care about. Typed narrowly to keep
// strict-mode happy without an "any" cast.
type RealtimeServerEvent =
  | { type: "session.created"; session?: { id?: string } }
  | { type: "session.updated" }
  | {
      type: "input_audio_buffer.speech_started"
    }
  | {
      type: "input_audio_buffer.speech_stopped"
    }
  | {
      type: "conversation.item.input_audio_transcription.completed"
      item_id: string
      transcript: string
    }
  | {
      type: "response.audio_transcript.delta"
      response_id: string
      item_id: string
      delta: string
    }
  | {
      type: "response.audio_transcript.done"
      response_id: string
      item_id: string
      transcript: string
    }
  | {
      type: "response.function_call_arguments.done"
      call_id: string
      name: string
      arguments: string
    }
  | { type: "response.created"; response?: { id?: string } }
  | { type: "response.done"; response?: { id?: string } }
  | { type: "error"; error?: { message?: string } }
  | { type: string }

export function VoiceTwin({
  ensName,
  getAuthToken,
  onSwitchToChat,
  className,
}: VoiceTwinProps) {
  const [state, setState] = useState<VoiceState>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [transcripts, setTranscripts] = useState<Transcript[]>([])

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const renewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionRef = useRef<VoiceSession | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Auto-scroll transcript area when new content arrives.
  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" })
  }, [transcripts])

  // Persist a single <audio> element to play assistant audio.
  useEffect(() => {
    const el = document.createElement("audio")
    el.autoplay = true
    audioElRef.current = el
    return () => {
      el.pause()
      el.srcObject = null
    }
  }, [])

  const cleanup = useCallback(() => {
    if (renewTimerRef.current) {
      clearTimeout(renewTimerRef.current)
      renewTimerRef.current = null
    }
    dcRef.current?.close()
    dcRef.current = null
    pcRef.current?.close()
    pcRef.current = null
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    if (audioElRef.current) {
      audioElRef.current.srcObject = null
    }
    sessionRef.current = null
  }, [])

  useEffect(() => {
    return () => cleanup()
  }, [cleanup])

  const fetchSession = useCallback(async (): Promise<
    | { ok: true; session: VoiceSession }
    | { ok: false; status: number; reason: string }
  > => {
    let token: string | null = null
    try {
      token = await getAuthToken()
    } catch {
      token = null
    }
    const res = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ privyToken: token, ensName }),
    })
    if (!res.ok) {
      let reason = `voice mint failed (${res.status})`
      try {
        const body = (await res.json()) as { error?: string; reason?: string }
        if (body?.reason) reason = body.reason
        else if (body?.error) reason = body.error
      } catch {
        // non-JSON body
      }
      return { ok: false as const, status: res.status, reason }
    }
    const session = (await res.json()) as VoiceSession
    return { ok: true as const, session }
  }, [ensName, getAuthToken])

  // Schedule renewal ~10s before expiry. If the user is mid-conversation we
  // just refresh sessionRef in memory so the next reconnect uses fresh creds.
  // We do NOT migrate the active PeerConnection — OpenAI keeps it open.
  const scheduleRenewal = useCallback(
    (expiresAt: number) => {
      if (renewTimerRef.current) clearTimeout(renewTimerRef.current)
      const expiresMs = expiresAt * 1000
      const renewAt = expiresMs - 10_000
      const delay = Math.max(5_000, renewAt - Date.now())
      renewTimerRef.current = setTimeout(async () => {
        const result = await fetchSession()
        if (result.ok) {
          sessionRef.current = result.session
          scheduleRenewal(result.session.expires_at)
        }
        // On failure we silently leave the existing PC running. If it dies
        // the user will see "reconnect" via the connection-state handler.
      }, delay)
    },
    [fetchSession],
  )

  // Send tool list + voice + transcription config once data channel is open.
  const sendSessionUpdate = useCallback((dc: RTCDataChannel) => {
    const tools: RealtimeToolDef[] = [...voiceTools]
    const event = {
      type: "session.update",
      session: {
        modalities: ["audio", "text"],
        voice: "alloy",
        input_audio_transcription: { model: "whisper-1" },
        tools,
        tool_choice: "auto",
      },
    }
    dc.send(JSON.stringify(event))
  }, [])

  // Run a tool via /api/twin-tool and ship the result back into the session.
  const runTool = useCallback(
    async (callId: string, name: string, argsJson: string) => {
      let parsedInput: unknown = {}
      try {
        parsedInput = argsJson ? JSON.parse(argsJson) : {}
      } catch {
        parsedInput = {}
      }
      let resultPayload: unknown
      try {
        const res = await fetch("/api/twin-tool", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, input: parsedInput }),
        })
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          result?: unknown
          error?: string
        }
        resultPayload = body.ok
          ? body.result
          : { ok: false, error: body.error ?? `tool ${name} failed` }
      } catch (err) {
        resultPayload = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
      const dc = dcRef.current
      if (!dc || dc.readyState !== "open") return
      // Ship result + trigger a new model response.
      dc.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify(resultPayload),
          },
        }),
      )
      dc.send(JSON.stringify({ type: "response.create" }))
    },
    [],
  )

  const handleServerEvent = useCallback(
    (raw: string) => {
      let evt: RealtimeServerEvent
      try {
        evt = JSON.parse(raw) as RealtimeServerEvent
      } catch {
        return
      }
      switch (evt.type) {
        case "input_audio_buffer.speech_started":
          setState("listening")
          break
        case "input_audio_buffer.speech_stopped":
          setState("thinking")
          break
        case "conversation.item.input_audio_transcription.completed": {
          const e = evt as Extract<
            RealtimeServerEvent,
            { type: "conversation.item.input_audio_transcription.completed" }
          >
          setTranscripts((prev) => [
            ...prev,
            { id: e.item_id, role: "user", text: e.transcript },
          ])
          break
        }
        case "response.audio_transcript.delta": {
          const e = evt as Extract<
            RealtimeServerEvent,
            { type: "response.audio_transcript.delta" }
          >
          setState("speaking")
          setTranscripts((prev) => {
            const idx = prev.findIndex((t) => t.id === e.item_id)
            if (idx === -1) {
              return [
                ...prev,
                {
                  id: e.item_id,
                  role: "assistant",
                  text: e.delta,
                  partial: true,
                },
              ]
            }
            const next = [...prev]
            next[idx] = { ...next[idx], text: next[idx].text + e.delta }
            return next
          })
          break
        }
        case "response.audio_transcript.done": {
          const e = evt as Extract<
            RealtimeServerEvent,
            { type: "response.audio_transcript.done" }
          >
          setTranscripts((prev) => {
            const idx = prev.findIndex((t) => t.id === e.item_id)
            if (idx === -1) {
              return [
                ...prev,
                {
                  id: e.item_id,
                  role: "assistant",
                  text: e.transcript,
                  partial: false,
                },
              ]
            }
            const next = [...prev]
            next[idx] = { ...next[idx], text: e.transcript, partial: false }
            return next
          })
          break
        }
        case "response.function_call_arguments.done": {
          const e = evt as Extract<
            RealtimeServerEvent,
            { type: "response.function_call_arguments.done" }
          >
          setState("thinking")
          void runTool(e.call_id, e.name, e.arguments)
          break
        }
        case "response.done":
          // Settle UI back to listening once the assistant finishes.
          setState((s) => (s === "speaking" || s === "thinking" ? "listening" : s))
          break
        case "error": {
          const e = evt as Extract<RealtimeServerEvent, { type: "error" }>
          setErrorMessage(e.error?.message ?? "Realtime session error")
          break
        }
        default:
          break
      }
    },
    [runTool],
  )

  const start = useCallback(async () => {
    setErrorMessage(null)
    setState("connecting")
    const result = await fetchSession()
    if (!result.ok) {
      if (result.status === 503) {
        setState("unavailable")
        setErrorMessage(result.reason)
      } else {
        setState("error")
        setErrorMessage(result.reason)
      }
      return
    }
    sessionRef.current = result.session
    scheduleRenewal(result.session.expires_at)

    try {
      const pc = new RTCPeerConnection()
      pcRef.current = pc

      // Pipe assistant audio into our hidden <audio> element.
      pc.ontrack = (event) => {
        if (audioElRef.current) {
          audioElRef.current.srcObject = event.streams[0] ?? null
        }
      }

      pc.onconnectionstatechange = () => {
        const cs = pc.connectionState
        if (cs === "failed" || cs === "disconnected" || cs === "closed") {
          setState((prev) => (prev === "idle" ? prev : "error"))
        }
      }

      // Mic.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = stream
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))

      // Data channel for events.
      const dc = pc.createDataChannel("oai-events")
      dcRef.current = dc
      dc.onopen = () => {
        sendSessionUpdate(dc)
        setState("listening")
      }
      dc.onmessage = (e) => {
        handleServerEvent(typeof e.data === "string" ? e.data : "")
      }
      dc.onerror = () => {
        setState("error")
        setErrorMessage("Realtime data channel error")
      }
      dc.onclose = () => {
        setState((prev) => (prev === "idle" ? prev : "error"))
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const sdpRes = await fetch(
        `https://api.openai.com/v1/realtime?model=${encodeURIComponent(
          result.session.model,
        )}`,
        {
          method: "POST",
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${result.session.client_secret}`,
            "Content-Type": "application/sdp",
          },
        },
      )
      if (!sdpRes.ok) {
        throw new Error(`SDP exchange failed: ${sdpRes.status}`)
      }
      const answerSdp = await sdpRes.text()
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp })
    } catch (error) {
      cleanup()
      setState("error")
      setErrorMessage(error instanceof Error ? error.message : String(error))
    }
  }, [cleanup, fetchSession, handleServerEvent, scheduleRenewal, sendSessionUpdate])

  const stop = useCallback(() => {
    cleanup()
    setState("idle")
  }, [cleanup])

  const isLive =
    state === "listening" || state === "thinking" || state === "speaking"

  return (
    <Card className={cn("flex flex-col gap-0 overflow-hidden p-0", className)}>
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/15 text-primary">
            <Mic className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-medium">Voice with {ensName}</div>
            <div className="text-xs text-muted-foreground">
              gpt-4o-realtime · WebRTC
            </div>
          </div>
        </div>
        <Badge variant="secondary" className="font-mono text-[10px]">
          <span
            className={cn(
              "mr-1 inline-block h-1.5 w-1.5 rounded-full",
              isLive ? "bg-emerald-400" : "bg-white/40",
            )}
          />
          {labelForState(state)}
        </Badge>
      </header>

      <div className="flex flex-col items-center gap-4 px-4 py-6">
        <VoiceOrb state={state} />
        <div className="flex items-center gap-2">
          {state === "idle" || state === "error" ? (
            <Button onClick={start} size="lg" className="rounded-full">
              <Mic className="mr-2 h-4 w-4" />
              {state === "error" ? "Tap to reconnect" : "Start voice"}
            </Button>
          ) : state === "connecting" ? (
            <Button disabled size="lg" className="rounded-full">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Connecting…
            </Button>
          ) : state === "unavailable" ? null : (
            <Button
              onClick={stop}
              variant="secondary"
              size="lg"
              className="rounded-full"
            >
              <MicOff className="mr-2 h-4 w-4" />
              End voice
            </Button>
          )}
        </div>
        {errorMessage && state !== "unavailable" ? (
          <p className="max-w-md text-center text-xs text-amber-300/80">
            {errorMessage}
          </p>
        ) : null}
      </div>

      {state === "unavailable" ? (
        <div className="border-t border-white/10 px-4 py-5">
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />
            <div className="flex-1 space-y-2">
              <p className="text-sm font-medium text-amber-100">
                Voice unavailable — using chat
              </p>
              <p className="text-xs text-amber-100/70">
                {errorMessage ??
                  "OPENAI_API_KEY is not set on the server. Falling back to text chat keeps the demo on track."}
              </p>
              {onSwitchToChat ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={onSwitchToChat}
                  className="mt-1"
                >
                  <MessageCircle className="mr-2 h-3.5 w-3.5" />
                  Switch to chat
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="max-h-[40dvh] flex-1 overflow-y-auto border-t border-white/10 px-4 py-4"
      >
        {transcripts.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {state === "idle"
              ? "Hit Start voice and ask your twin anything out loud."
              : "Listening for the first thing you say…"}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {transcripts.map((t) => (
                <motion.li
                  key={t.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className={cn(
                    "flex w-full",
                    t.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                      t.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground",
                      t.partial && "opacity-80",
                    )}
                  >
                    {t.text || "…"}
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </Card>
  )
}

function labelForState(state: VoiceState): string {
  switch (state) {
    case "idle":
      return "ready"
    case "connecting":
      return "connecting"
    case "listening":
      return "listening"
    case "thinking":
      return "thinking"
    case "speaking":
      return "speaking"
    case "error":
      return "reconnect"
    case "unavailable":
      return "chat fallback"
  }
}

function VoiceOrb({ state }: { state: VoiceState }) {
  const live =
    state === "listening" || state === "thinking" || state === "speaking"
  return (
    <div className="relative grid h-28 w-28 place-items-center">
      <motion.div
        aria-hidden
        className="absolute inset-0 rounded-full bg-primary/20 blur-xl"
        animate={
          live
            ? {
                scale: state === "speaking" ? [1, 1.15, 1] : [1, 1.06, 1],
                opacity: state === "thinking" ? [0.5, 0.9, 0.5] : [0.6, 1, 0.6],
              }
            : { scale: 1, opacity: 0.4 }
        }
        transition={{
          duration: state === "speaking" ? 0.6 : state === "thinking" ? 1.4 : 1.0,
          repeat: live ? Infinity : 0,
          ease: "easeInOut",
        }}
      />
      <motion.div
        aria-hidden
        className="relative h-16 w-16 rounded-full bg-gradient-to-br from-primary to-fuchsia-500"
        animate={
          live
            ? { scale: state === "speaking" ? [1, 1.08, 1] : [1, 1.03, 1] }
            : { scale: 1 }
        }
        transition={{
          duration: 0.9,
          repeat: live ? Infinity : 0,
          ease: "easeInOut",
        }}
      />
    </div>
  )
}
