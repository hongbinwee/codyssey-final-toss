"use server"

import { sdk } from "@lib/config"
import {
  ProductReviewStat,
  StoreProductReviewStatsResponse,
} from "@lib/commerce-contracts"

import { getAuthHeaders, getCacheOptions } from "./cookies"

/**
 * 상품 ID 목록의 후기 통계를 한 번에 조회한다(서버 컴포넌트용 배치).
 * 카드별 개별 호출(N+1)을 막기 위해 항상 이 배치를 사용한다.
 *
 * 반환: product_id → stat 맵. 요청 자체가 실패하면 null을 돌려 호출부가
 * "0건"과 "미조회"를 구분해 표시할 수 있게 한다.
 */
export const getProductReviewStats = async (
  productIds: string[]
): Promise<Record<string, ProductReviewStat> | null> => {
  const ids = Array.from(new Set(productIds.filter(Boolean)))
  if (!ids.length) {
    return {}
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("reviews")),
  }

  try {
    const { stats } = await sdk.client.fetch<StoreProductReviewStatsResponse>(
      "/store/product-review-stats",
      {
        method: "GET",
        query: { product_ids: ids.join(",") },
        headers,
        next,
        cache: "no-store",
      }
    )
    const map: Record<string, ProductReviewStat> = {}
    for (const stat of stats) {
      map[stat.product_id] = stat
    }
    return map
  } catch {
    return null
  }
}
