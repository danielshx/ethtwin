"use client"

// MariaShell — simplified one-view shell used when demo mode is on.
// Strips the 6-tab dev UI down to a single Voice surface with a small
// "use chat instead" fallback. Replaces SignedInTabs in app/page.tsx
// when useDemoMode() returns true. Dev-View remains accessible via
// ?demoMode=0 or by clearing the env flag — code is preserved 1:1.

import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { MessageCircle, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TwinChat } from "@/components/twin-chat"
import { VoiceTwin } from "@/components/voice-twin"
import { TwinAvatar } from "@/components/twin-avatar"
import { useNotifications } from "@/lib/use-notifications"
import { useTwinSound } from "@/lib/use-twin-sound"

type MariaShellProps = {
  ensName: string
  walletAddress?: string | null
  getAuthToken: () => Promise<string | null>
}

export function MariaShell({
  ensName,
  walletAddress,
  getAuthToken,
}: MariaShellProps) {
  const [mode, setMode] = useState<"voice" | "chat">("voice")
  const friendlyName = ensName.split(".")[0]
  // Drive Tom's auto-reply notification toast even though we don't render
  // the bottom-right NotificationPanel in maria-mode. The hook itself
  // toasts via sonner whenever a new on-chain message lands.
  const { items } = useNotifications(ensName, walletAddress ?? null)
  const sound = useTwinSound()
  const lastSeen = useRef(items.length)
  useEffect(() => {
    if (items.length > lastSeen.current) {
      sound.play("receive", 0.5)
    }
    lastSeen.current = items.length
  }, [items.length, sound])

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center gap-3 text-center"
      >
        <TwinAvatar ensName={ensName} size={112} />
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Hi {friendlyName}.
        </h2>
        <p className="max-w-md text-base text-muted-foreground">
          Tap and tell me what you want to do. I&apos;ll handle the rest.
        </p>
      </motion.div>

      {mode === "voice" ? (
        <VoiceTwin
          ensName={ensName}
          getAuthToken={getAuthToken}
          onSwitchToChat={() => setMode("chat")}
          className="w-full border-border/60 bg-card/90 shadow-sm backdrop-blur"
        />
      ) : (
        <TwinChat
          ensName={ensName}
          getAuthToken={getAuthToken}
          className="h-[60dvh] w-full border-border/60 bg-card/90 shadow-sm backdrop-blur"
        />
      )}

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {mode === "voice" ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMode("chat")}
            className="gap-2 rounded-full"
          >
            <MessageCircle className="h-4 w-4" />
            Use typing instead
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMode("voice")}
            className="gap-2 rounded-full"
          >
            <Wand2 className="h-4 w-4" />
            Talk to me instead
          </Button>
        )}
      </div>
    </div>
  )
}
