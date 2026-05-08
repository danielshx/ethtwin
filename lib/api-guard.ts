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

export const ethereumAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Expected a valid EVM address")

export const ensLabelSchema = z
  .string()
  .min(2)
  .max(24)
  .regex(/^[a-z0-9][a-z0-9-]{1,23}$/, "Use lowercase letters, numbers, and dashes")
