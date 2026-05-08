import { verifyAuthToken } from "@/lib/privy-server"
import { setName } from "@/lib/namestone"
import { encodeInteropAddress, ERC8004_REGISTRY, CHAIN_REFERENCE } from "@/lib/ensip25"
import { PARENT_DOMAIN } from "@/lib/viem"

export const runtime = "nodejs"

type OnboardingBody = {
  privyToken: string
  username: string
  smartWalletAddress: `0x${string}`
  stealthMetaAddress: string
  twinAgentId: string
}

export async function POST(req: Request) {
  const body = (await req.json()) as OnboardingBody

  await verifyAuthToken(body.privyToken)

  const interop = encodeInteropAddress(
    ERC8004_REGISTRY.baseSepolia,
    CHAIN_REFERENCE.baseSepolia,
  )
  const ensipKey = `agent-registration[${interop}][${body.twinAgentId}]`

  await setName({
    domain: PARENT_DOMAIN,
    name: body.username,
    address: body.smartWalletAddress,
    textRecords: {
      description: `${body.username}'s AI co-pilot`,
      "twin.persona": JSON.stringify({
        tone: "concise, friendly, slightly dry",
        style: "plain English",
      }),
      "twin.capabilities": JSON.stringify([
        "transact",
        "research",
        "stealth_send",
      ]),
      "twin.endpoint": `${process.env.NEXT_PUBLIC_APP_URL}/api/twin`,
      "twin.version": "0.1.0",
      "stealth-meta-address": body.stealthMetaAddress,
      [ensipKey]: "1",
    },
  })

  return Response.json({
    ok: true,
    ensName: `${body.username}.${PARENT_DOMAIN}`,
  })
}
