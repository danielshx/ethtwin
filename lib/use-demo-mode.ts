"use client"

import { useEffect, useState } from "react"

const ENV_FLAG =
  typeof process !== "undefined" && process.env?.NEXT_PUBLIC_DEMO_MODE === "1"

export function useDemoMode(): boolean {
  const [enabled, setEnabled] = useState<boolean>(ENV_FLAG)

  useEffect(() => {
    if (typeof window === "undefined") return
    const url = new URL(window.location.href)
    const param = url.searchParams.get("demoMode")
    if (param === "1") setEnabled(true)
    if (param === "0") setEnabled(false)
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

  return enabled
}
