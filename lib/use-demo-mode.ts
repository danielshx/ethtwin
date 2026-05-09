"use client"

import { useCallback, useEffect, useState } from "react"

const ENV_FLAG =
  typeof process !== "undefined" && process.env?.NEXT_PUBLIC_DEMO_MODE === "1"

const STORAGE_KEY = "ethtwin.demoMode"

function readInitial(): boolean {
  if (typeof window === "undefined") return ENV_FLAG
  try {
    const url = new URL(window.location.href)
    const param = url.searchParams.get("demoMode")
    if (param === "1") return true
    if (param === "0") return false
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === "1") return true
    if (stored === "0") return false
  } catch {}
  return ENV_FLAG
}

/**
 * Returns the current demo-mode flag and a setter that:
 *   - updates React state
 *   - mirrors to localStorage so refreshes stick
 *   - reflects in the URL (?demoMode=1/0) without a page reload
 *   - toggles the html.maria-mode class for the CSS overlay
 */
export function useDemoMode(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(ENV_FLAG)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setEnabled(readInitial())
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (typeof document === "undefined") return
    const root = document.documentElement
    if (enabled) root.classList.add("maria-mode")
    else root.classList.remove("maria-mode")
    return () => {
      root.classList.remove("maria-mode")
    }
  }, [enabled])

  const set = useCallback((next: boolean) => {
    setEnabled(next)
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0")
      const url = new URL(window.location.href)
      url.searchParams.set("demoMode", next ? "1" : "0")
      window.history.replaceState({}, "", url.toString())
    } catch {}
  }, [])

  // Suppress UI flash before hydration: callers can ignore this — they
  // just see `false` initially, which matches SSR. After mount the real
  // value lands.
  void hydrated
  return [enabled, set]
}
