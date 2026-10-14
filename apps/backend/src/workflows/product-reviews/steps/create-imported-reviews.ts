import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import { PRODUCT_REVIEW_MODULE } from "../../../modules/product-review"
import { normalizeImportReview } from "../helpers"
import type { ProductReviewImportItem } from "../types"

export const createImportedReviewsStepId = "create-imported-reviews"

/**
 * Persists the deduplicated batch. Normalization is applied again at the
 * write boundary so invariants (default pending, is_synthetic for
 * source=synthetic) hold regardless of the caller.
 */
export const createImportedReviewsStep = createStep(
  createImportedReviewsStepId,
  async (reviews: ProductReviewImportItem[], { container }) => {
    const service = container.resolve(PRODUCT_REVIEW_MODULE)

    if (!reviews.length) {
      return new StepResponse([], { ids: [] })
    }

    const created = await service.createProductReviews(
      reviews.map(normalizeImportReview),
    )

    return new StepResponse(created, {
      ids: created.map((r) => r.id as string),
    })
  },
  async (data, { container }) => {
    if (!data?.ids?.length) {
      return
    }
    const service = container.resolve(PRODUCT_REVIEW_MODULE)
    await service.deleteProductReviews(data.ids)
  },
)
