import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { importProductReviewsWorkflow } from "../../../../workflows/product-reviews/import-product-reviews"
import { productReviewImportSchema } from "./validators"

/**
 * POST /admin/product-reviews/import
 *
 * Bulk import of reviews (admin auth via the existing /admin/* boundary).
 * Body: { reviews: [...] }, max 100 items. Each item must carry an explicit
 * product_id (and optional variant_id that must belong to it); the endpoint
 * never maps an ASIN or title to a product implicitly. The whole batch is
 * validated before any write, and (source, external_review_id) is the
 * idempotency key so a repeated import adds zero rows.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = productReviewImportSchema.safeParse(req.body)
  if (!parsed.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid import payload: " + parsed.error.message,
    )
  }

  const { result } = await importProductReviewsWorkflow(req.scope).run({
    input: { reviews: parsed.data.reviews },
  })

  res.status(200).json(result)
}
