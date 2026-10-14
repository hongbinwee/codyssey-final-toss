import { z } from "zod"

export const listStoreProductReviewsParams = z.object({
  sort: z
    .enum(["newest", "rating_desc", "rating_asc"])
    .default("newest"),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  variant_id: z.string().min(1).optional(),
}).strict()

/**
 * Store-facing review DTO: no customer PII and no internal fields
 * (status/displayable/rights_ref/asin/external_review_id). External
 * strings are rendered by the storefront as plain text.
 */
export const publicReviewFields = [
  "id",
  "title",
  "body",
  "rating",
  "written_at",
  "source",
  "source_ref",
  "verified_purchase",
  "is_synthetic",
  "product_id",
  "variant_id",
] as const

export const reviewSortOrders = {
  newest: { written_at: "DESC", id: "ASC" },
  rating_desc: { rating: "DESC", written_at: "DESC", id: "ASC" },
  rating_asc: { rating: "ASC", written_at: "DESC", id: "ASC" },
} as const
