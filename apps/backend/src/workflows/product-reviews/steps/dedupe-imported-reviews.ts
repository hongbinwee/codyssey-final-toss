import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import { PRODUCT_REVIEW_MODULE } from "../../../modules/product-review"
import { dedupeImportReviews, externalDedupKey } from "../helpers"
import type { ProductReviewImportItem } from "../types"

export const dedupeImportedReviewsStepId = "dedupe-imported-reviews"

/**
 * Drops rows whose (source, external_review_id) key already exists so a
 * repeated import is idempotent (created count grows by 0). Rows without an
 * external_review_id are always kept.
 */
export const dedupeImportedReviewsStep = createStep(
  dedupeImportedReviewsStepId,
  async (reviews: ProductReviewImportItem[], { container }) => {
    const service = container.resolve(PRODUCT_REVIEW_MODULE)

    const withKey = reviews.filter((r) => Boolean(r.external_review_id))
    if (!withKey.length) {
      return new StepResponse({ creates: reviews, skipped: 0 })
    }

    const sources = [...new Set(withKey.map((r) => r.source))]
    const externalIds = [
      ...new Set(withKey.map((r) => r.external_review_id as string)),
    ]

    const existing = await service.listProductReviews(
      { source: sources, external_review_id: externalIds },
      {
        select: [
          "source",
          "external_review_id",
          "product_id",
          "variant_id",
          "title",
          "body",
          "rating",
        ],
        // The import schema caps the batch at 100 items, so an explicit take
        // of the requested key count fetches every existing match instead of
        // relying on the service list default page size.
        take: externalIds.length,
      },
    )
    const existingByKey = new Map(
      existing
        .map((r) => {
          const key = externalDedupKey(r)
          return key
            ? ([
                key,
                {
                  product_id: r.product_id as string,
                  variant_id: (r.variant_id as string | null) ?? null,
                  title: r.title as string,
                  body: r.body as string,
                  rating: r.rating as number,
                },
              ] as const)
            : null
        })
        .filter((e): e is NonNullable<typeof e> => Boolean(e)),
    )

    const { creates, skipped, conflicts } = dedupeImportReviews(
      reviews,
      existingByKey,
    )

    if (conflicts.length) {
      const detail = conflicts
        .map((c) => c.source + "::" + c.external_review_id)
        .join(", ")
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "External review id already exists with different product or " +
          "content; import never overwrites: " + detail,
      )
    }

    return new StepResponse({ creates, skipped })
  },
)
