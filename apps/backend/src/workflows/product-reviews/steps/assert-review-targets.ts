import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import type { ProductReviewImportItem } from "../types"

export const assertReviewTargetsStepId = "assert-review-targets"

/**
 * Validates the whole import batch before any write: every product_id must
 * exist (404) and every variant_id must exist and belong to the review's own
 * product_id (404 missing, 400 foreign). Import never guesses a product from
 * an ASIN or title; the product reference must be explicit.
 *
 * Returns the validated reviews: downstream steps MUST consume this output
 * so the workflow engine chains them after validation instead of running
 * them in parallel with it.
 */
export const assertReviewTargetsStep = createStep(
  assertReviewTargetsStepId,
  async (reviews: ProductReviewImportItem[], { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    const productIds = [...new Set(reviews.map((r) => r.product_id))]
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id"],
      filters: { id: productIds },
    })
    const foundProducts = new Set(products.map((p) => p.id as string))
    const missingProducts = productIds.filter((id) => !foundProducts.has(id))
    if (missingProducts.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Products not found: " + missingProducts.join(", "),
      )
    }

    const variantIds = [
      ...new Set(
        reviews
          .map((r) => r.variant_id)
          .filter((v): v is string => Boolean(v)),
      ),
    ]
    if (!variantIds.length) {
      return new StepResponse(reviews)
    }

    const { data: variants } = await query.graph({
      entity: "variant",
      fields: ["id", "product_id"],
      filters: { id: variantIds },
    })
    const variantOwner = new Map(
      variants.map((v) => [v.id as string, v.product_id as string]),
    )

    for (const review of reviews) {
      if (!review.variant_id) {
        continue
      }
      const owner = variantOwner.get(review.variant_id)
      if (!owner) {
        throw new MedusaError(
          MedusaError.Types.NOT_FOUND,
          "Variant not found: " + review.variant_id,
        )
      }
      if (owner !== review.product_id) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Variant " +
            review.variant_id +
            " does not belong to product " +
            review.product_id,
        )
      }
    }

    return new StepResponse(reviews)
  },
)
