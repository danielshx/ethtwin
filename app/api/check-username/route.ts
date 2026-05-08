// Pre-flight check before mint:
//   - Is `<username>.ethtwin.eth` taken?
//   - If yes, who owns it (addr record, the user-visible owner)?
//
// The UI uses this to:
//   1. Sign the caller into the existing agent if they ARE the owner
//   2. Show a "name already taken" error if a different wallet owns it
//   3. Proceed to mint if it's free

import { getAddress } from "viem"
import { z } from "zod"
import { ensLabelSchema, jsonError } from "@/lib/api-guard"
import { PARENT_DOMAIN } from "@/lib/viem"
import { resolveEnsAddress, readSubnameOwner } from "@/lib/ens"

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

const querySchema = z.object({
  u: ensLabelSchema,
})

export const runtime = "nodejs"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const parsed = querySchema.safeParse({ u: url.searchParams.get("u") })
  if (!parsed.success) {
    return jsonError("Invalid username", 400, parsed.error.flatten())
  }
  const username = parsed.data.u
  const ensName = `${username}.${PARENT_DOMAIN}`

  try {
    const [registryOwner, addr] = await Promise.all([
      readSubnameOwner(ensName),
      resolveEnsAddress(ensName),
    ])
    const taken = registryOwner !== ZERO_ADDRESS
    return Response.json({
      ok: true,
      ensName,
      taken,
      ownerAddr: addr ? getAddress(addr) : null,
    })
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Lookup failed",
      502,
    )
  }
}
