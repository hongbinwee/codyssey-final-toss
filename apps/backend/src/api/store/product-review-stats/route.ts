import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

import { PRODUCT_REVIEW_MODULE } from "../../../modules/product-review"
import {
  assertStoreProductVisibility,
  requireSalesChannelIds,
} from "../../../workflows/product-reviews/helpers"
import {
  listStoreProductReviewStatsParams,
  MAX_STATS_PRODUCT_IDS,
  parseProductIds,
} from "./validators"

/**
 * GET /store/product-review-stats?product_ids=id1,id2,...
 *
 * Batched rating summary for product cards, avoiding one request per card
 * (N+1). Every requested product must exist, be published, and be visible in
 * the publishable key's sales channels - a single invalid id fails the whole
 * request with 404 rather than returning misleading zero rows. Only the
 * public review set (approved + displayable) is aggregated; products without
 * approved reviews return a null average and zero count. Capped at 100 ids.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = listStoreProductReviewStatsParams.safeParse(req.query)
  if (!parsed.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid query parameters: " + parsed.error.message,
    )
  }

  const productIds = parseProductIds(parsed.data.product_ids)
  if (!productIds.length || productIds.length > MAX_STATS_PRODUCT_IDS) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "product_ids must contain 1-" + MAX_STATS_PRODUCT_IDS + " ids",
    )
  }

  const salesChannelIds = requireSalesChannelIds(
    req as unknown as {
      publishable_key_context?: { sales_channel_ids?: string[] }
    },
  )

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  await assertStoreProductVisibility(query, productIds, salesChannelIds)

  const service = req.scope.resolve(PRODUCT_REVIEW_MODULE)
  const summaries = await service.summarizeApprovedByProduct(productIds)

  res.status(200).json({
    stats: productIds.map((product_id) => ({
      product_id,
      ...(summaries.get(product_id) ?? {
        average_rating: null,
        review_count: 0,
      }),
    })),
  })
}
