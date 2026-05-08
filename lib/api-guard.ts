import { z } from "zod"

export function jsonError(message: string, status = 400, details?: unknown) {
  return Response.json(
    {
      ok: false,
      error: message,
      ...(details === undefined ? {} : { details }),
    },
    { status },
  )
}

export async function parseJsonBody<T>(req: Request, schema: z.ZodType<T>) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return {
      ok: false as const,
      response: jsonError("Invalid JSON body", 400),
    }
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false as const,
      response: jsonError("Invalid request body", 400, parsed.error.flatten()),
    }
  }

  return { ok: true as const, data: parsed.data }
}

export function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    return {
      ok: false as const,
      response: jsonError(`${name} missing`, 500),
    }
  }
  return { ok: true as const, value }
}

// Resolves the public app URL: explicit NEXT_PUBLIC_APP_URL wins, otherwise
// fall back to Vercel's auto-injected VERCEL_PROJECT_PRODUCTION_URL / VERCEL_URL
// so preview + prod deployments work without manual env config.
export function resolveAppUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL
  if (explicit) return { ok: true as const, value: explicit.replace(/\/$/, "") }
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (prod) return { ok: true as const, value: `https://${prod}` }
  const vercel = process.env.VERCEL_URL
  if (vercel) return { ok: true as const, value: `https://${vercel}` }
  return {
    ok: false as const,
    response: jsonError("App URL not configured (set NEXT_PUBLIC_APP_URL)", 500),
  }
}

export const ethereumAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Expected a valid EVM address")

export const ensLabelSchema = z
  .string()
  .min(2)
  .max(24)
  .regex(/^[a-z0-9][a-z0-9-]{1,23}$/, "Use lowercase letters, numbers, and dashes")
