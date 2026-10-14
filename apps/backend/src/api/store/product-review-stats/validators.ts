import { z } from "zod"

export const listStoreProductReviewStatsParams = z.object({
  product_ids: z.string().min(1),
})

export const MAX_STATS_PRODUCT_IDS = 100

export function parseProductIds(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ]
}
