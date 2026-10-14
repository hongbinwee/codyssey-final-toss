"use client"

import { useEffect, useState } from "react"

import { ProductReviewStat } from "@lib/commerce-contracts"
import { fetchProductReviewStats } from "@lib/data/reviews-client"

export type ProductReviewStatsState =
  | { status: "idle" | "loading"; map: Record<string, ProductReviewStat> }
  | { status: "ready"; map: Record<string, ProductReviewStat> }
  | { status: "error"; map: Record<string, ProductReviewStat> }

/**
 * 검색 결과처럼 클라이언트에서 목록이 결정되는 경우에 쓰는 후기 통계 배치 조회.
 * 조회 실패는 status: "error"로 노출해 카드에서 "미조회"와 "0건"을 구분한다.
 */
export function useProductReviewStats(productIds: string[]) {
  const idsKey = productIds.join(",")

  const [state, setState] = useState<ProductReviewStatsState>({
    status: "idle",
    map: {},
  })

  useEffect(() => {
    if (!idsKey) {
      setState({ status: "idle", map: {} })
      return
    }
    const ids = idsKey.split(",")

    let cancelled = false
    setState((prev) => ({ status: "loading", map: prev.map }))

    fetchProductReviewStats(ids)
      .then((map) => {
        if (!cancelled) {
          setState({ status: "ready", map })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState((prev) => ({ status: "error", map: prev.map }))
        }
      })

    return () => {
      cancelled = true
    }
  }, [idsKey])

  return state
}

export default useProductReviewStats
