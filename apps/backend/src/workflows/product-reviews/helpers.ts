import { MedusaError } from "@medusajs/framework/utils"

import type { ProductReviewImportItem } from "./types"

/**
 * Store visibility guard shared by the review list and stats endpoints:
 * products must exist, be published, and belong to one of the publishable
 * key's sales channels. Any unknown, unpublished, or out-of-channel product
 * answers 404 (and for batch stats the whole request fails, never partial).
 */
export function requireSalesChannelIds(req: {
  publishable_key_context?: { sales_channel_ids?: string[] }
}): string[] {
  const ids = req.publishable_key_context?.sales_channel_ids ?? []
  if (!ids.length) {
    // Same failure the core store routes produce when the publishable key
    // context is missing or carries no sales channel.
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Publishable key needs to have a sales channel configured",
    )
  }
  return ids
}

type VisibilityQuery = {
  graph: (args: {
    entity: string
    fields: string[]
    filters: Record<string, unknown>
  }) => Promise<{ data: Record<string, unknown>[] }>
}

export async function assertStoreProductVisibility(
  query: VisibilityQuery,
  productIds: string[],
  salesChannelIds: string[],
): Promise<void> {
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id"],
    filters: { id: productIds, status: "published" },
  })
  const published = new Set(products.map((p) => p.id as string))
  const missing = productIds.filter((id) => !published.has(id))
  if (missing.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Products not found: " + missing.join(", "),
    )
  }

  const { data: channelLinks } = await query.graph({
    entity: "product_sales_channel",
    fields: ["product_id"],
    filters: {
      product_id: productIds,
      sales_channel_id: salesChannelIds,
    },
  })
  const inChannel = new Set(
    channelLinks.map((l) => l.product_id as string),
  )
  const outOfChannel = productIds.filter((id) => !inChannel.has(id))
  if (outOfChannel.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Products not found: " + outOfChannel.join(", "),
    )
  }
}

export type ExistingReviewFingerprint = {
  product_id: string
  variant_id: string | null
  title: string
  body: string
  rating: number
}

/**
 * Idempotency key for imported reviews. Reviews without an
 * external_review_id have no dedup key and are always treated as new.
 */
export function externalDedupKey(
  review: Pick<ProductReviewImportItem, "source" | "external_review_id">,
): string | null {
  if (!review.external_review_id) {
    return null
  }
  return review.source + "::" + review.external_review_id
}

/**
 * Applies import invariants: status/displayable defaults (pending, not
 * displayable until explicitly opted in) and the rule that
 * source = "synthetic" always carries is_synthetic = true.
 */
export function normalizeImportReview(
  review: ProductReviewImportItem,
): ProductReviewImportItem & {
  status: "pending" | "approved" | "flagged"
  displayable: boolean
  is_synthetic: boolean
} {
  return {
    ...review,
    status: review.status ?? "pending",
    // displayable is opt-in AND, for external-source reviews, requires a
    // rights_ref (redistribution permission provenance). Without rights
    // evidence the review stays private even if the caller asked for public.
    displayable:
      (review.displayable ?? false) &&
      (review.source !== "amazon" || Boolean(review.rights_ref)),
    is_synthetic:
      review.source === "synthetic" ? true : Boolean(review.is_synthetic),
  }
}

function sameFingerprint(
  a: ExistingReviewFingerprint,
  review: ProductReviewImportItem,
): boolean {
  return (
    a.product_id === review.product_id &&
    (a.variant_id ?? null) === (review.variant_id ?? null) &&
    a.title === (review.title ?? "") &&
    a.body === review.body &&
    a.rating === review.rating
  )
}

/**
 * Splits an import batch into rows to create, a skipped-idempotent count,
 * and hard conflicts. Re-importing the exact same review (same dedup key AND
 * same product_id/variant_id/title/body/rating) is idempotent and skipped.
 * Reusing an external_review_id for a different product, a moved variant,
 * or changed content is a conflict: import never silently overwrites an
 * existing review.
 */
export function dedupeImportReviews(
  reviews: ProductReviewImportItem[],
  existingByKey: ReadonlyMap<string, ExistingReviewFingerprint>,
): {
  creates: ProductReviewImportItem[]
  skipped: number
  conflicts: { source: string; external_review_id: string }[]
} {
  const seen = new Map<string, ExistingReviewFingerprint>()
  const creates: ProductReviewImportItem[] = []
  const conflicts: { source: string; external_review_id: string }[] = []
  let skipped = 0

  for (const review of reviews) {
    const key = externalDedupKey(review)
    if (!key) {
      creates.push(review)
      continue
    }
    const prior = existingByKey.get(key) ?? seen.get(key)
    if (prior) {
      if (sameFingerprint(prior, review)) {
        skipped += 1
      } else {
        conflicts.push({
          source: review.source,
          external_review_id: review.external_review_id as string,
        })
      }
      continue
    }
    seen.set(key, {
      product_id: review.product_id,
      variant_id: review.variant_id ?? null,
      title: review.title ?? "",
      body: review.body,
      rating: review.rating,
    })
    creates.push(review)
  }

  return { creates, skipped, conflicts }
}
