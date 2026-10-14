import { sdk } from "@lib/config"
import {
  ProductReviewSort,
  ProductReviewStat,
  StoreProductReviewListResponse,
  StoreProductReviewStatsResponse,
} from "@lib/commerce-contracts"

// 클라이언트 컴포넌트에서 호출하는 리뷰 읽기 fetcher.
// cookies.ts 같은 server-only 모듈을 가져오지 않는다.

export const REVIEW_PAGE_SIZE = 10

export const fetchProductReviews = async (params: {
  productId: string
  sort?: ProductReviewSort
  offset?: number
  /** 서버 최대 50 */
  limit?: number
  /** 지정하면 그 variant에 달린 후기만 정확히 조회한다 */
  variantId?: string | null
}): Promise<StoreProductReviewListResponse> => {
  const {
    productId,
    sort = "newest",
    offset = 0,
    limit = REVIEW_PAGE_SIZE,
    variantId,
  } = params

  return sdk.client.fetch<StoreProductReviewListResponse>(
    `/store/products/${productId}/reviews`,
    {
      method: "GET",
      query: {
        sort,
        offset,
        limit,
        ...(variantId ? { variant_id: variantId } : {}),
      },
      cache: "no-store",
    }
  )
}

export const fetchProductReviewStats = async (
  productIds: string[]
): Promise<Record<string, ProductReviewStat>> => {
  const ids = Array.from(new Set(productIds.filter(Boolean)))
  if (!ids.length) {
    return {}
  }

  const { stats } = await sdk.client.fetch<StoreProductReviewStatsResponse>(
    "/store/product-review-stats",
    {
      method: "GET",
      query: { product_ids: ids.join(",") },
      cache: "no-store",
    }
  )
  const map: Record<string, ProductReviewStat> = {}
  for (const stat of stats) {
    map[stat.product_id] = stat
  }
  return map
}
