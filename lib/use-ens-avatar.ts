"use client"

// Re-export of the canonical hook so existing imports under
// `@/lib/use-ens-avatar` keep working. The implementation lives in
// `components/ens-avatar.tsx` together with the <EnsAvatar> primitive.
export { useEnsAvatar } from "@/components/ens-avatar"
