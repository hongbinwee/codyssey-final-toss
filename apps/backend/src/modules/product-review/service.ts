import { MedusaService } from "@medusajs/framework/utils"

import { ProductReview } from "./models/product-review"

export type ProductReviewSummary = {
  average_rating: number | null
  review_count: number
}

class ProductReviewModuleService extends MedusaService({
  ProductReview,
}) {
  /**
   * Aggregates rating stats for the public review set
   * (status = approved AND displayable = true) of the given products.
   *
   * Pages through ALL matching rows in fixed-size batches instead of relying
   * on the service list default take, so counts/averages stay correct beyond
   * the first page. Snapshot limitation: reviews created or moderated while
   * the pages are read can make the aggregate slightly inconsistent; that is
   * acceptable for the current corpus and documented here on purpose.
   *
   * Implementation note: this loads the product_id/rating columns of all
   * matching rows and aggregates in memory, which is appropriate for the
   * current small review corpus. Direct raw SQL is intentionally avoided so
   * the module stays on official ORM touchpoints. If the corpus grows large,
   * move this to a database-side aggregate behind the same method signature.
   */
  async summarizeApprovedByProduct(
    productIds: string[],
    variantId?: string,
  ): Promise<Map<string, ProductReviewSummary>> {
    const summaries = new Map<string, ProductReviewSummary>()
    const uniqueIds = [...new Set(productIds)].filter(Boolean)
    for (const id of uniqueIds) {
      summaries.set(id, { average_rating: null, review_count: 0 })
    }
    if (!uniqueIds.length) {
      return summaries
    }

    const totals = new Map<string, { sum: number; count: number }>()
    const PAGE_SIZE = 1000
    let skip = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const reviews = await this.listProductReviews(
        {
          product_id: uniqueIds,
          status: "approved",
          displayable: true,
          ...(variantId ? { variant_id: variantId } : {}),
        },
        { select: ["product_id", "rating"], skip, take: PAGE_SIZE, order: { id: "ASC" } },
      )
      for (const review of reviews) {
        const bucket = totals.get(review.product_id) ?? { sum: 0, count: 0 }
        bucket.sum += review.rating
        bucket.count += 1
        totals.set(review.product_id, bucket)
      }
      if (reviews.length < PAGE_SIZE) {
        break
      }
      skip += PAGE_SIZE
    }

    for (const [productId, bucket] of totals) {
      summaries.set(productId, {
        average_rating:
          Math.round((bucket.sum / bucket.count) * 100) / 100,
        review_count: bucket.count,
      })
    }

    return summaries
  }
}

export default ProductReviewModuleService
