import { z } from "zod"
import { verifyAuthToken } from "@/lib/privy-server"
import { setName } from "@/lib/namestone"
import { encodeInteropAddress, ERC8004_REGISTRY, CHAIN_REFERENCE } from "@/lib/ensip25"
import { PARENT_DOMAIN } from "@/lib/viem"
import {
  ensLabelSchema,
  ethereumAddressSchema,
  jsonError,
  parseJsonBody,
  requireEnv,
} from "@/lib/api-guard"

export const runtime = "nodejs"

const onboardingBodySchema = z.object({
  privyToken: z.string().min(1, "Privy token is required"),
  username: ensLabelSchema,
  smartWalletAddress: ethereumAddressSchema,
  stealthMetaAddress: z.string().min(1, "stealthMetaAddress is required"),
  twinAgentId: z.string().min(1, "twinAgentId is required"),
})

export async function POST(req: Request) {
  const appUrl = requireEnv("NEXT_PUBLIC_APP_URL")
  if (!appUrl.ok) return appUrl.response

  const namestoneKey = requireEnv("NAMESTONE_API_KEY")
  if (!namestoneKey.ok) return namestoneKey.response

  const parsed = await parseJsonBody(req, onboardingBodySchema)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  try {
    await verifyAuthToken(body.privyToken)
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Privy token verification failed",
      401,
    )
  }

  const interop = encodeInteropAddress(
    ERC8004_REGISTRY.baseSepolia,
    CHAIN_REFERENCE.baseSepolia,
  )
  const ensipKey = `agent-registration[${interop}][${body.twinAgentId}]`

  try {
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
        "twin.endpoint": `${appUrl.value}/api/twin`,
        "twin.version": "0.1.0",
        "stealth-meta-address": body.stealthMetaAddress,
        [ensipKey]: "1",
      },
    })
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "NameStone onboarding failed",
      502,
    )
  }

  return Response.json({
    ok: true,
    ensName: `${body.username}.${PARENT_DOMAIN}`,
  })
}
