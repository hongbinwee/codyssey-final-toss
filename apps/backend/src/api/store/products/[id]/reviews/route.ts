import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

import { PRODUCT_REVIEW_MODULE } from "../../../../../modules/product-review"
import {
  assertStoreProductVisibility,
  requireSalesChannelIds,
} from "../../../../../workflows/product-reviews/helpers"
import {
  listStoreProductReviewsParams,
  publicReviewFields,
  reviewSortOrders,
} from "./validators"

/**
 * GET /store/products/:id/reviews
 *
 * Public, unauthenticated read of the displayable review set for one product.
 * The product must be published and (when the publishable key carries sales
 * channels) belong to one of them, mirroring the core product visibility
 * guard: a missing or channel-less publishable key context answers 400, a
 * product outside the key's channels answers 404. Optional variant_id
 * narrows the list and the summary to one variant, and must belong to the
 * product. Only status=approved AND displayable=true rows are returned,
 * paginated (offset/limit, default 10, max 50) and sorted
 * newest|rating_desc|rating_asc.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  // express 5 typings dropped req.params; the route path guarantees :id.
  const { id } = (req as unknown as { params: Record<string, string> }).params

  const parsed = listStoreProductReviewsParams.safeParse(req.query)
  if (!parsed.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid query parameters: " + parsed.error.message,
    )
  }
  const { sort, offset, limit, variant_id } = parsed.data

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const salesChannelIds = requireSalesChannelIds(
    req as unknown as {
      publishable_key_context?: { sales_channel_ids?: string[] }
    },
  )
  await assertStoreProductVisibility(query, [id], salesChannelIds)

  if (variant_id) {
    const {
      data: [variant],
    } = await query.graph({
      entity: "variant",
      fields: ["id", "product_id"],
      filters: { id: variant_id },
    })
    if (!variant) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Variant not found")
    }
    if (variant.product_id !== id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Variant does not belong to product",
      )
    }
  }

  const service = req.scope.resolve(PRODUCT_REVIEW_MODULE)

  const [reviews, count] = await service.listAndCountProductReviews(
    {
      product_id: id,
      status: "approved",
      displayable: true,
      ...(variant_id ? { variant_id } : {}),
    },
    {
      select: [...publicReviewFields],
      skip: offset,
      take: limit,
      order: reviewSortOrders[sort],
    },
  )

  const summaries = await service.summarizeApprovedByProduct(
    [id],
    variant_id,
  )
  const summary = summaries.get(id) ?? {
    average_rating: null,
    review_count: 0,
  }

  res.status(200).json({
    reviews: reviews.map((review) => ({
      id: review.id,
      product_id: review.product_id,
      variant_id: review.variant_id ?? null,
      title: review.title || null,
      body: review.body,
      rating: review.rating,
      written_at: review.written_at,
      source: review.source,
      source_ref: review.source_ref || null,
      is_synthetic: review.is_synthetic,
      verified_purchase: review.verified_purchase ?? null,
    })),
    count,
    offset,
    limit,
    summary,
  })
}
