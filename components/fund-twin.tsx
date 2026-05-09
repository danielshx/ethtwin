"use client"

// Self-fund a twin's KMS-managed address from the user's own wallet.
//
// Why this exists: every twin's signing identity is a SpaceComputer KMS
// key, and its derived EVM address holds the funds the twin can spend.
// Without an external top-up, that address starts at 0 ETH / 0 USDC and
// the twin can't send anything. This component prompts the user's
// browser wallet (MetaMask, Rabby, Frame, etc.) to send ETH or USDC
// directly to the twin's KMS address — one-tap funding.
//
// We deliberately avoid wagmi/RainbowKit here. The wallet contract is
// trivial: switch chain, send ETH or call USDC.transfer. EIP-1193 +
// viem's encodeFunctionData is enough and keeps the dep graph small.

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Wallet } from "lucide-react"
import { toast } from "sonner"
import {
  encodeFunctionData,
  parseEther,
  parseUnits,
  type Address,
  type Hex,
} from "viem"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type Chain = "sepolia" | "base-sepolia"
type Asset = "ETH" | "USDC"

const CHAIN_HEX: Record<Chain, `0x${string}`> = {
  sepolia: "0xaa36a7", // 11155111
  "base-sepolia": "0x14a34", // 84532
}

const CHAIN_LABEL: Record<Chain, string> = {
  sepolia: "Sepolia",
  "base-sepolia": "Base Sepolia",
}

const USDC: Record<Chain, Address> = {
  sepolia: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
}

const EXPLORER: Record<Chain, string> = {
  sepolia: "https://sepolia.etherscan.io",
  "base-sepolia": "https://sepolia.basescan.org",
}

const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const

// Loose typing for window.ethereum so we don't pull in @types/ethereum.
type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, handler: (...args: unknown[]) => void) => void
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider
  }
}

function getProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null
  return window.ethereum ?? null
}

export function FundTwin({
  twinAddress,
  defaultChain = "base-sepolia",
  className,
}: {
  /** The recipient: the twin's KMS-derived address. */
  twinAddress: Address | null
  defaultChain?: Chain
  className?: string
}) {
  const provider = useMemo(() => getProvider(), [])
  const [connected, setConnected] = useState<Address | null>(null)
  const [chain, setChain] = useState<Chain>(defaultChain)
  const [asset, setAsset] = useState<Asset>("USDC")
  const [amount, setAmount] = useState(asset === "USDC" ? "0.5" : "0.005")
  const [busy, setBusy] = useState(false)
  const [lastTx, setLastTx] = useState<Hex | null>(null)

  // Mount-time: see if the wallet was previously authorized so we can show
  // its address without re-prompting. eth_accounts returns [] when not
  // connected — safe to call.
  useEffect(() => {
    if (!provider) return
    let cancelled = false
    provider
      .request({ method: "eth_accounts" })
      .then((accs) => {
        if (cancelled) return
        if (Array.isArray(accs) && accs.length > 0) {
          setConnected(accs[0] as Address)
        }
      })
      .catch(() => {
        // ignore
      })
    return () => {
      cancelled = true
    }
  }, [provider])

  const connect = useCallback(async () => {
    if (!provider) {
      toast.error("No browser wallet detected. Install MetaMask or another EIP-1193 wallet.")
      return
    }
    setBusy(true)
    try {
      const accs = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[]
      if (!Array.isArray(accs) || accs.length === 0) {
        throw new Error("Wallet returned no accounts.")
      }
      setConnected(accs[0] as Address)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connect failed")
    } finally {
      setBusy(false)
    }
  }, [provider])

  const send = useCallback(async () => {
    if (!provider || !connected || !twinAddress) return
    setBusy(true)
    setLastTx(null)
    try {
      // Switch the wallet to the chosen chain — most wallets prompt the user.
      const targetChainHex = CHAIN_HEX[chain]
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: targetChainHex }],
        })
      } catch (err) {
        // Some wallets need the chain to be added first. Fail loudly so the
        // user understands what happened.
        const msg = err instanceof Error ? err.message : String(err)
        throw new Error(
          `Could not switch to ${CHAIN_LABEL[chain]}: ${msg}. Add the chain manually if your wallet doesn't recognize it.`,
        )
      }

      let txHash: Hex
      if (asset === "ETH") {
        const value = parseEther(amount)
        txHash = (await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: connected,
              to: twinAddress,
              value: ("0x" + value.toString(16)) as Hex,
            },
          ],
        })) as Hex
      } else {
        const raw = parseUnits(amount, 6)
        const data = encodeFunctionData({
          abi: ERC20_TRANSFER_ABI,
          functionName: "transfer",
          args: [twinAddress, raw],
        })
        txHash = (await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: connected,
              to: USDC[chain],
              data,
            },
          ],
        })) as Hex
      }
      setLastTx(txHash)
      toast.success(
        `${amount} ${asset} → twin (${CHAIN_LABEL[chain]})`,
        {
          description: `${EXPLORER[chain]}/tx/${txHash}`,
        },
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Top-up failed")
    } finally {
      setBusy(false)
    }
  }, [provider, connected, twinAddress, chain, asset, amount])

  if (!twinAddress) {
    return (
      <div className={cn("text-[11px] text-muted-foreground", className)}>
        Mint or sign in to a twin first to fund it.
      </div>
    )
  }

  return (
    <div
      className={cn(
        "rounded-md border border-border/60 bg-card/40 p-3 text-xs",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-medium text-foreground/90">Fund your twin</span>
        {connected ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            from {short(connected)}
          </span>
        ) : null}
      </div>

      {!connected ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={connect}
          disabled={busy}
          className="w-full"
        >
          {busy ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wallet className="mr-2 h-3.5 w-3.5" />
          )}
          {busy ? "Connecting…" : "Connect wallet"}
        </Button>
      ) : (
        <div className="grid gap-2">
          <div className="flex gap-1">
            {(["base-sepolia", "sepolia"] as const).map((c) => (
              <Button
                key={c}
                type="button"
                size="sm"
                variant={chain === c ? "default" : "outline"}
                onClick={() => setChain(c)}
                disabled={busy}
                className="flex-1 text-[11px]"
              >
                {CHAIN_LABEL[c]}
              </Button>
            ))}
          </div>
          <div className="flex gap-1">
            {(["USDC", "ETH"] as const).map((a) => (
              <Button
                key={a}
                type="button"
                size="sm"
                variant={asset === a ? "default" : "outline"}
                onClick={() => {
                  setAsset(a)
                  setAmount(a === "USDC" ? "0.5" : "0.005")
                }}
                disabled={busy}
                className="flex-1 text-[11px]"
              >
                {a}
              </Button>
            ))}
          </div>
          <Input
            type="number"
            step={asset === "USDC" ? "0.1" : "0.001"}
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
            className="font-mono text-[12px]"
          />
          <Button
            type="button"
            size="sm"
            onClick={send}
            disabled={busy || Number(amount) <= 0}
            className="w-full"
          >
            {busy ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Send {amount} {asset} to {short(twinAddress)}
          </Button>
          {lastTx ? (
            <a
              href={`${EXPLORER[chain]}/tx/${lastTx}`}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] font-mono text-primary/80 hover:text-primary"
            >
              tx · {short(lastTx)} ↗
            </a>
          ) : null}
        </div>
      )}
    </div>
  )
}

function short(value: string): string {
  if (value.length <= 12) return value
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}
