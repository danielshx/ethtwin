"use client"

// Client-side session hook — replaces `usePrivy().authenticated` /
// `getAccessToken` for the React tree. Reads the HMAC-signed cookie via
// /api/session GET on mount, then exposes login/logout helpers backed by the
// same endpoint.
//
// The KMS-only stack means there's no token to forward to API routes — the
// cookie travels automatically with same-origin fetches. Components should
// check `session.ens` for identity and stop passing `getAuthToken` around.

import { useCallback, useEffect, useState } from "react"

export type Session = {
  ens: string
  kmsKeyId: string | null
  exp: number
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [busy, setBusy] = useState(false)

  // One-shot fetch on mount so the rest of the tree only renders post-hydration.
  useEffect(() => {
    let cancelled = false
    fetch("/api/session", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data: { ok?: boolean; session?: Session | null }) => {
        if (cancelled) return
        if (data.ok) setSession(data.session ?? null)
      })
      .catch(() => {
        // Best-effort — treat a failed read as "no session".
      })
      .finally(() => {
        if (!cancelled) setHydrated(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(
    async (ens: string, recoveryCode?: string): Promise<Session> => {
      setBusy(true)
      try {
        const res = await fetch("/api/session", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ens,
            ...(recoveryCode ? { recoveryCode } : {}),
          }),
        })
        const data = (await res.json()) as {
          ok?: boolean
          error?: string
          session?: Session
          legacy?: boolean
        }
        if (!res.ok || !data.ok || !data.session) {
          throw new Error(data.error ?? `Login failed (${res.status})`)
        }
        setSession(data.session)
        return data.session
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  const logout = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      await fetch("/api/session", {
        method: "DELETE",
        credentials: "same-origin",
      })
      setSession(null)
    } finally {
      setBusy(false)
    }
  }, [])

  // After /api/onboarding the server sets the cookie itself; this lets the
  // client mirror that into its own state without an extra round-trip.
  const adoptServerSession = useCallback((next: Session) => {
    setSession(next)
  }, [])

  return { session, hydrated, busy, login, logout, adoptServerSession }
}
