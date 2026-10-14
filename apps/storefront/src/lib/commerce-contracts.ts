// Shopping Brain 공통 계약 — 리뷰 읽기 표준(SOL 확정본).
// 01 backend의 store route DTO와 동일한 필드 이름을 유지한다.
// 표시 전용 DTO에는 ASIN·원본 권리 참조·이메일 등 비공개 필드를 포함하지 않는다.

export type ProductReviewSort = "newest" | "rating_desc" | "rating_asc"

export type ProductReviewSource = "native" | "amazon" | "synthetic"

export type StoreProductReview = {
  id: string
  product_id: string
  variant_id: string | null
  title: string | null
  body: string
  /** 1~5 */
  rating: number
  /** ISO 8601 작성일 */
  written_at: string
  source: ProductReviewSource
  source_ref: string | null
  is_synthetic: boolean
  /** 실제 구매 인증 — 확인 불가면 null */
  verified_purchase: boolean | null
}

export type ProductReviewSummary = {
  /** 리뷰가 없으면 null — 0점으로 표시하지 않는다 */
  average_rating: number | null
  review_count: number
}

/** GET /store/products/:id/reviews 응답. 기본 approved+displayable만 조회된다 */
export type StoreProductReviewListResponse = {
  reviews: StoreProductReview[]
  count: number
  offset: number
  limit: number
  summary: ProductReviewSummary
}

/** GET /store/product-review-stats 응답의 개별 항목 */
export type ProductReviewStat = {
  product_id: string
} & ProductReviewSummary

export type StoreProductReviewStatsResponse = {
  stats: ProductReviewStat[]
}

/** 유효하지만 후기가 없는 상품의 카드 표시용 공통값 */
export const EMPTY_REVIEW_SUMMARY: ProductReviewSummary = {
  average_rating: null,
  review_count: 0,
}
