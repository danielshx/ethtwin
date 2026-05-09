"use client"

import { useEffect, useState } from "react"
import { useWallets } from "@privy-io/react-auth"
import {
  createPublicClient,
  encodeFunctionData,
  http,
  parseUnits,
  type Hex,
} from "viem"
import { sepolia } from "viem/chains"
import { Check, ExternalLink, Loader2, Pencil, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { addHistoryEntry } from "@/lib/history"
import { displayNameFromEns } from "@/lib/ens"
import { buildAvatarUrl } from "@/lib/twin-profile"
import { cn } from "@/lib/utils"

type AgentProfile = {
  ens: string
  addr: string | null
  avatar: string | null
  description: string | null
  url: string | null
  persona: string | null
  capabilities: string | null
  endpoint: string | null
  stealthMeta: string | null
  version: string | null
  vault: string | null
  vaultOwner: string | null
  /** Live on-chain `USDC.allowance(owner, devWallet)` — string of USDC base
   *  units (1e6 = 1 USDC). null when owner isn't set or the read fails. */
  agentUsdcAllowance: string | null
}

type AgentProfileDialogProps = {
  ens: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When true, the dialog renders an Edit button so the viewer can update
   *  avatar + description on-chain via /api/profile. Pass true only when the
   *  dialog is showing the *viewer's own* twin. */
  editable?: boolean
  getAuthToken?: () => Promise<string | null>
  /** Optional callback fired after the user successfully deletes their twin.
   *  The hosting app should sign-out / drop the session so the user is
   *  re-routed to onboarding. */
  onDeleted?: () => void
  /** The user's currently-connected wallet address. Required to expose the
   *  "Bind vault" action — that's the address that becomes the vault owner.
   *  Must be a *real* user wallet, never the dev-wallet fallback. */
  walletAddress?: string | null
  /** Opens the host app's wallet-connect modal so the user can attach a
   *  wallet when no real one is present. */
  onConnectWallet?: () => void
}

export function AgentProfileDialog({
  ens,
  open,
  onOpenChange,
  editable,
  getAuthToken,
  onDeleted,
  walletAddress,
  onConnectWallet,
}: AgentProfileDialogProps) {
  const [profile, setProfile] = useState<AgentProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftAvatar, setDraftAvatar] = useState("")
  const [draftDescription, setDraftDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [bindingVault, setBindingVault] = useState(false)
  const [overrideOwner, setOverrideOwner] = useState("")
  // Privy wallets — needed to grab an EIP-1193 provider so the user can sign
  // the USDC approve from inside this dialog without leaving the app.
  const { wallets } = useWallets()

  useEffect(() => {
    if (!open || !ens) {
      setProfile(null)
      setEditing(false)
      return
    }
    let cancelled = false
    setLoading(true)
    fetch(`/api/agent/${encodeURIComponent(ens)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data.ok) {
          setProfile(data as AgentProfile)
          setDraftAvatar(data.avatar ?? "")
          setDraftDescription(data.description ?? "")
        }
      })
      .catch(() => {
        // best-effort — UI shows a fallback
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, ens])

  async function handleSave() {
    if (!ens) return
    const trimmedAvatar = draftAvatar.trim()
    const trimmedDesc = draftDescription.trim()
    const avatarChanged = trimmedAvatar !== (profile?.avatar ?? "")
    const descChanged = trimmedDesc !== (profile?.description ?? "")
    if (!avatarChanged && !descChanged) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      // Same relaxed-auth pattern as handleDelete / onboarding.
      const token = (await getAuthToken?.().catch(() => null)) ?? null
      const payload: {
        privyToken: string | null
        ens: string
        avatar?: string
        description?: string
      } = {
        privyToken: token,
        ens,
      }
      if (avatarChanged) payload.avatar = trimmedAvatar
      if (descChanged) payload.description = trimmedDesc

      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const ct = res.headers.get("content-type") ?? ""
      if (!ct.includes("application/json")) {
        const text = await res.text()
        toast.error(
          res.status === 504
            ? "Vercel timed out — your update may still land. Refresh in ~30s."
            : `Server error ${res.status}: ${text.slice(0, 120)}`,
        )
        return
      }
      const data = (await res.json()) as {
        ok: boolean
        error?: string
        txHash?: string
        blockExplorerUrl?: string
      }
      if (!data.ok) {
        toast.error(data.error ?? "Profile update failed")
        return
      }

      const summaryBits: string[] = []
      if (avatarChanged) summaryBits.push("avatar")
      if (descChanged) summaryBits.push("bio")
      toast.success(`Updated ${summaryBits.join(" + ")} on-chain`, {
        description: data.blockExplorerUrl,
      })
      addHistoryEntry({
        kind: "other",
        status: "success",
        chain: "sepolia",
        summary: `Updated ${summaryBits.join(" + ")} on ${ens}`,
        description: "ENS text records on Sepolia",
        txHash: data.txHash,
        explorerUrl: data.blockExplorerUrl,
        ...(getAuthToken ? { syncTo: { ens, getAuthToken } } : {}),
      })
      // Optimistic local update so the dialog shows the new values immediately;
      // the on-chain copy will catch up on next reload.
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              avatar: avatarChanged ? trimmedAvatar : prev.avatar,
              description: descChanged ? trimmedDesc : prev.description,
            }
          : prev,
      )
      setEditing(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Profile update failed"
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  function resetDrafts() {
    if (!profile) return
    setDraftAvatar(profile.avatar ?? "")
    setDraftDescription(profile.description ?? "")
  }

  async function handleDelete() {
    if (!ens) return
    const confirmed = confirm(
      `Delete ${ens} forever?\n\nThis wipes the on-chain ENS subdomain (addr + every text record) and removes it from the directory. The action is irreversible.`,
    )
    if (!confirmed) return
    setDeleting(true)
    try {
      // Privy access token is best-effort — email-only / fresh wallet sessions
      // may not have one yet. The server treats it as optional.
      const token = (await getAuthToken?.().catch(() => null)) ?? null
      const res = await fetch("/api/profile/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privyToken: token, ens }),
      })
      const ct = res.headers.get("content-type") ?? ""
      if (!ct.includes("application/json")) {
        const text = await res.text()
        toast.error(
          res.status === 504
            ? "Vercel timed out — the delete may still land. Refresh in ~30s."
            : `Server error ${res.status}: ${text.slice(0, 120)}`,
        )
        return
      }
      const data = (await res.json()) as {
        ok: boolean
        error?: string
        txHash?: string
        blockExplorerUrl?: string
      }
      if (!data.ok) {
        toast.error(data.error ?? "Delete failed")
        return
      }
      toast.success(`${ens} deleted on-chain`, {
        description: data.blockExplorerUrl,
      })
      addHistoryEntry({
        kind: "other",
        status: "success",
        chain: "sepolia",
        summary: `Deleted twin: ${ens}`,
        description: "Cleared ENS subdomain records + orphaned in registry",
        txHash: data.txHash,
        explorerUrl: data.blockExplorerUrl,
        ...(getAuthToken ? { syncTo: { ens, getAuthToken } } : {}),
      })
      onOpenChange(false)
      onDeleted?.()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed"
      toast.error(msg)
    } finally {
      setDeleting(false)
    }
  }

  // Sepolia USDC on the public testnet — same value used in lib/transfers.ts.
  const USDC_SEPOLIA = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"
  // Default headroom for the agent. The user can re-approve to raise/lower.
  const DEFAULT_APPROVE_USDC = "10" // 10 USDC

  // ERC-20 approve(spender, amount) ABI fragment.
  const erc20ApproveAbi = [
    {
      name: "approve",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        { name: "spender", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      outputs: [{ name: "", type: "bool" }],
    },
  ] as const

  async function handleEnableSpending() {
    if (!ens) return
    const trimmedOverride = overrideOwner.trim()
    const owner = trimmedOverride || walletAddress
    if (!owner) {
      toast.error("Connect a wallet, or paste an owner address.")
      return
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(owner)) {
      toast.error("Owner address must be a valid 0x… 40-hex string.")
      return
    }
    const devFallback = process.env.NEXT_PUBLIC_DEV_WALLET_ADDRESS
    if (devFallback && owner.toLowerCase() === devFallback.toLowerCase()) {
      toast.error(
        "Owner equals the dev wallet — agent can't spend from itself. Use a different address.",
      )
      return
    }
    if (!devFallback) {
      toast.error(
        "NEXT_PUBLIC_DEV_WALLET_ADDRESS not configured — can't compute approval target.",
      )
      return
    }

    setBindingVault(true)
    try {
      // ── Step 1: server writes twin.owner record (dev wallet signs) ────
      const token = (await getAuthToken?.().catch(() => null)) ?? null
      const res = await fetch("/api/profile/set-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privyToken: token, ens, userWallet: owner }),
      })
      const ct = res.headers.get("content-type") ?? ""
      if (!ct.includes("application/json")) {
        const text = await res.text()
        toast.error(`Server error ${res.status}: ${text.slice(0, 160)}`)
        return
      }
      const data = (await res.json()) as {
        ok: boolean
        error?: string
        alreadySet?: boolean
        owner?: string
        recordsTx?: string
        blockExplorerUrl?: string
      }
      if (!data.ok) {
        toast.error(data.error ?? "set-owner failed")
        return
      }
      if (data.alreadySet) {
        toast.info("Owner record already set — proceeding to USDC approval")
      } else {
        toast.success("Owner record written on-chain", {
          description: data.blockExplorerUrl,
        })
      }
      addHistoryEntry({
        kind: "other",
        status: "success",
        chain: "sepolia",
        summary: `Set ${ens} owner = ${owner.slice(0, 6)}…${owner.slice(-4)}`,
        description: "ENS twin.owner record",
        ...(data.recordsTx ? { txHash: data.recordsTx } : {}),
        ...(data.blockExplorerUrl
          ? { explorerUrl: data.blockExplorerUrl }
          : {}),
        ...(getAuthToken ? { syncTo: { ens, getAuthToken } } : {}),
      })

      // ── Step 2: ask the user's wallet to USDC.approve(devWallet, X) ───
      // Find the actual wallet object so we can get an EIP-1193 provider.
      const wallet = wallets.find(
        (w) => w.address.toLowerCase() === owner.toLowerCase(),
      )
      if (!wallet) {
        toast.error(
          `Wallet ${owner.slice(0, 6)}…${owner.slice(-4)} isn't connected. Connect it via Privy/MetaMask, then click again.`,
        )
        return
      }
      let provider: {
        request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
      }
      try {
        provider = (await wallet.getEthereumProvider()) as typeof provider
      } catch (err) {
        toast.error(
          `Couldn't get a signer for ${owner.slice(0, 6)}…${owner.slice(-4)}: ${err instanceof Error ? err.message : String(err)}`,
        )
        return
      }
      // Force Sepolia. Wallet may already be on it; switch is a no-op then.
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0xaa36a7" }], // 11155111
        })
      } catch (err) {
        // Some embedded wallets don't support switching — the send may still
        // work if the wallet is already on Sepolia.
        console.warn("[approve] wallet_switchEthereumChain failed:", err)
      }
      const data2 = encodeFunctionData({
        abi: erc20ApproveAbi,
        functionName: "approve",
        args: [
          devFallback as `0x${string}`,
          parseUnits(DEFAULT_APPROVE_USDC, 6),
        ],
      })
      let approveTx: string
      try {
        approveTx = (await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: owner,
              to: USDC_SEPOLIA,
              data: data2,
            },
          ],
        })) as string
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        toast.error(`Approve rejected or failed: ${msg.slice(0, 140)}`)
        return
      }
      // Wait for the approve tx to MINE before declaring victory. Without
      // this the agent sees allowance=0 and falls back to the dev wallet —
      // exactly the bug we're trying to fix. Sepolia mines in ~12-24s.
      const pendingToast = toast.loading(
        "Waiting for approve to mine on Sepolia (~24s)…",
      )
      try {
        const sepoliaPublic = createPublicClient({
          chain: sepolia,
          transport: http(
            "https://eth-sepolia.g.alchemy.com/v2/VnDHq7fsAyloEY3w9oQGK",
          ),
        })
        const receipt = await sepoliaPublic.waitForTransactionReceipt({
          hash: approveTx as Hex,
        })
        toast.dismiss(pendingToast)
        if (receipt.status !== "success") {
          toast.error(
            `Approve tx reverted (gasUsed=${receipt.gasUsed.toString()}). tx=${approveTx}`,
          )
          return
        }
      } catch (err) {
        toast.dismiss(pendingToast)
        toast.error(
          `Couldn't confirm approve receipt: ${err instanceof Error ? err.message : String(err)}. The tx may still mine — wait ~30s and try sending.`,
        )
        return
      }
      toast.success(`Approved ${DEFAULT_APPROVE_USDC} USDC — agent can now send`, {
        description: `https://sepolia.etherscan.io/tx/${approveTx}`,
      })
      addHistoryEntry({
        kind: "other",
        status: "success",
        chain: "sepolia",
        summary: `Approved ${DEFAULT_APPROVE_USDC} USDC for the agent`,
        description: `Spender ${devFallback}`,
        txHash: approveTx,
        explorerUrl: `https://sepolia.etherscan.io/tx/${approveTx}`,
        ...(getAuthToken ? { syncTo: { ens, getAuthToken } } : {}),
      })

      // Optimistic local update so the dialog flips to "Spending enabled".
      setProfile((prev) =>
        prev ? { ...prev, vaultOwner: owner, vault: prev.vault ?? null } : prev,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Enable spending failed"
      toast.error(msg)
    } finally {
      setBindingVault(false)
    }
  }

  function suggestRandomAvatar() {
    if (!ens) return
    const label = ens.split(".")[0] ?? ens
    // Append a random component so Pollinations regenerates a different image
    // for the same label. Seed differs → image differs.
    const variant = `${label}-${Math.floor(Math.random() * 9_000) + 1_000}`
    setDraftAvatar(buildAvatarUrl(variant))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg">
                {ens ? displayNameFromEns(ens).displayName : "Agent"}
              </DialogTitle>
              <DialogDescription className="font-mono text-xs text-muted-foreground">
                {ens}
              </DialogDescription>
            </div>
            {editable && !editing && profile ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(true)}
                className="h-7 gap-1 px-2 text-[11px]"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </Button>
            ) : null}
          </div>
          {profile?.description && !editing ? (
            <p className="pt-2 text-sm">{profile.description}</p>
          ) : null}
        </DialogHeader>

        {loading || !profile ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : editing ? (
          <div className="grid gap-4">
            <div className="flex items-center gap-4">
              <AvatarImage
                src={draftAvatar.trim() || null}
                ens={profile.ens}
                size={88}
              />
              <div className="flex flex-1 flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Avatar URL
                </label>
                <Input
                  value={draftAvatar}
                  onChange={(e) => setDraftAvatar(e.target.value)}
                  placeholder="https://…/avatar.png"
                  className="font-mono text-xs"
                  disabled={saving}
                />
                <button
                  type="button"
                  onClick={suggestRandomAvatar}
                  disabled={saving}
                  className="self-start text-[10px] text-primary/80 hover:text-primary hover:underline"
                >
                  ✨ regenerate avatar
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
                Bio
              </label>
              <textarea
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                placeholder="One-line bio for your twin"
                disabled={saving}
                maxLength={280}
                rows={3}
                className="w-full resize-none rounded-md border border-border/60 bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
              />
              <div className="mt-1 text-right font-mono text-[10px] text-muted-foreground">
                {draftDescription.length}/280
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={saving || deleting}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Deleting on-chain…
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete twin
                  </>
                )}
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    resetDrafts()
                    setEditing(false)
                  }}
                  disabled={saving || deleting}
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving || deleting}>
                  {saving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Writing on-chain…
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Save on ENS
                    </>
                  )}
                </Button>
              </div>
            </div>
            <p className="font-mono text-[10px] text-muted-foreground">
              Stored on Sepolia ENS as <span className="text-foreground/80">avatar</span> +{" "}
              <span className="text-foreground/80">description</span> text records · ~24s to land.
              Deleting wipes every record + orphans the subname on-chain.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="flex items-center gap-4">
              <AvatarImage src={profile.avatar} ens={profile.ens} size={88} />
              <div className="flex flex-col gap-2">
                {profile.addr ? (
                  <Field label="addr" mono>
                    {shortAddr(profile.addr)}
                  </Field>
                ) : null}
                {profile.version ? (
                  <Field label="twin version" mono>
                    {profile.version}
                  </Field>
                ) : null}
              </div>
            </div>

            {/* Vault status — live indicator + bind action when missing.
             *  When bound, every chat-driven token send pulls from the user's
             *  vault. When unbound, the agent falls back to the dev wallet. */}
            <div className="rounded-md border border-border/60 bg-card/40 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-block h-1.5 w-1.5 rounded-full",
                      profile.vaultOwner ? "bg-emerald-400" : "bg-amber-400",
                    )}
                  />
                  <span className="text-xs font-medium">
                    {profile.vaultOwner ? "Agent spending enabled" : "Agent spending: dev wallet"}
                  </span>
                </div>
                {editable ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEnableSpending}
                    disabled={
                      bindingVault ||
                      (!walletAddress && !overrideOwner.trim())
                    }
                    className="h-7 px-2 text-[11px]"
                    title={
                      walletAddress
                        ? `Set ${ens && walletAddress.slice(0, 6)}…${walletAddress.slice(-4)} as the agent's funding wallet and approve 10 USDC.`
                        : "Paste an owner address below or connect a wallet first."
                    }
                  >
                    {bindingVault ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Enabling…
                      </>
                    ) : profile.vaultOwner ? (
                      <>Re-approve</>
                    ) : (
                      <>Enable agent spending</>
                    )}
                  </Button>
                ) : null}
              </div>
              {profile.vaultOwner ? (
                <div className="mt-1.5 grid gap-0.5 font-mono text-[10px] text-muted-foreground">
                  <div>
                    <span className="text-foreground/60">funding wallet: </span>
                    <a
                      href={`https://sepolia.etherscan.io/address/${profile.vaultOwner}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      {shortAddr(profile.vaultOwner)}
                    </a>
                  </div>
                  <div>
                    <span className="text-foreground/60">agent allowance: </span>
                    {profile.agentUsdcAllowance != null
                      ? `${(Number(profile.agentUsdcAllowance) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`
                      : "—"}
                  </div>
                  <p className="font-sans text-[10px] text-muted-foreground/80">
                    {profile.agentUsdcAllowance &&
                    BigInt(profile.agentUsdcAllowance) > 0n
                      ? "USDC sends pull from this wallet via transferFrom, capped by the allowance above. ETH sends still go via the dev wallet."
                      : "Owner is set but the USDC allowance is 0 — click Re-approve and finish the MetaMask signature so the agent can pull funds."}
                  </p>
                </div>
              ) : (
                <div className="mt-1 space-y-2 text-[10px] leading-relaxed text-muted-foreground">
                  <p>
                    USDC sends fall back to the dev wallet. Enable agent
                    spending to point the agent at your wallet — one signature
                    sets up an ERC-20 allowance, then every chat-driven send
                    moves USDC straight from your funds. No custom contract.
                  </p>
                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                      Owner address (must control this wallet)
                    </label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={overrideOwner}
                        onChange={(e) => setOverrideOwner(e.target.value)}
                        placeholder={walletAddress ?? "0x… your wallet address"}
                        className="h-7 flex-1 font-mono text-[11px]"
                        disabled={bindingVault}
                      />
                      {walletAddress ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setOverrideOwner(walletAddress)}
                          className="h-7 px-2 text-[10px] text-muted-foreground"
                          title="Use the auto-detected connected wallet"
                          disabled={bindingVault}
                        >
                          use connected
                        </Button>
                      ) : null}
                    </div>
                    <p className="text-[10px] text-muted-foreground/80">
                      Auto-detected:{" "}
                      <span className="font-mono">
                        {walletAddress ? shortAddr(walletAddress) : "none"}
                      </span>
                      . Only that wallet (or whatever you paste here) can
                      withdraw, change limits, or rotate the agent afterwards.
                    </p>
                  </div>
                  {!walletAddress && onConnectWallet ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onConnectWallet}
                      className="h-7 px-2 text-[11px]"
                    >
                      Connect a wallet via Privy
                    </Button>
                  ) : null}
                </div>
              )}
            </div>

            {profile.capabilities ? (
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Capabilities
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {parseList(profile.capabilities).map((c) => (
                    <Badge key={c} variant="secondary" className="font-mono text-[10px]">
                      {c}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {profile.persona ? (
              <PersonaBlock raw={profile.persona} />
            ) : null}

            {profile.stealthMeta ? (
              <Field label="stealth meta-key" mono breakAll>
                {profile.stealthMeta.slice(0, 24)}…{profile.stealthMeta.slice(-8)}
              </Field>
            ) : null}

            {profile.url ? (
              <a
                href={profile.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {profile.url} <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}

            <a
              href={`https://sepolia.app.ens.domains/${profile.ens}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-primary"
            >
              View on Sepolia ENS app <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function AvatarImage({
  src,
  ens,
  size = 32,
  className,
}: {
  src: string | null | undefined
  ens: string
  size?: number
  className?: string
}) {
  const label = ens.split(".")[0] ?? ens
  const fallbackUrl = buildAvatarUrl(label)
  // Three-step fallback so every chat row in the messenger always has a face:
  //   0 → on-chain ENS avatar (whatever the twin set)
  //   1 → deterministic DiceBear from the ENS label (matches what onboarding
  //       writes for fresh twins, and rescues older twins whose stored URL
  //       (e.g. stale Pollinations) no longer resolves)
  //   2 → initial-letter circle (only if even DiceBear's CDN dies)
  const [attempt, setAttempt] = useState<0 | 1 | 2>(src ? 0 : 1)
  const candidate = attempt === 0 ? src : attempt === 1 ? fallbackUrl : null
  const initial = label.charAt(0).toUpperCase()
  if (!candidate) {
    return (
      <span
        className={cn(
          "inline-grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/40 to-fuchsia-500/40 font-mono text-xs font-semibold text-primary-foreground",
          className,
        )}
        style={{ width: size, height: size }}
        aria-label={`${ens} avatar`}
      >
        {initial}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={candidate}
      alt={`${ens} avatar`}
      width={size}
      height={size}
      onError={() => setAttempt((prev) => (prev < 2 ? ((prev + 1) as 0 | 1 | 2) : 2))}
      className={cn("shrink-0 rounded-full bg-card object-cover", className)}
      style={{ width: size, height: size }}
    />
  )
}

function PersonaBlock({ raw }: { raw: string }) {
  let parsed: Record<string, unknown> | null = null
  try {
    const v = JSON.parse(raw)
    if (typeof v === "object" && v !== null) parsed = v as Record<string, unknown>
  } catch {
    // keep raw
  }
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        Persona
      </div>
      {parsed ? (
        <div className="rounded-md border border-border/60 bg-card/40 px-3 py-2 text-xs">
          {Object.entries(parsed).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="min-w-20 font-mono text-muted-foreground">{k}</span>
              <span className="break-words">{String(v)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-border/60 bg-card/40 px-3 py-2 text-xs">{raw}</p>
      )}
    </div>
  )
}

function Field({
  label,
  children,
  mono,
  breakAll,
}: {
  label: string
  children: React.ReactNode
  mono?: boolean
  breakAll?: boolean
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "text-xs",
          mono && "font-mono",
          breakAll && "break-all",
        )}
      >
        {children}
      </div>
    </div>
  )
}

function parseList(raw: string): string[] {
  try {
    const v = JSON.parse(raw)
    if (Array.isArray(v)) return v.map(String)
  } catch {
    // fall through
  }
  return raw.split(",").map((s) => s.trim()).filter(Boolean)
}

function shortAddr(a: string): string {
  if (a.length < 12) return a
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}
