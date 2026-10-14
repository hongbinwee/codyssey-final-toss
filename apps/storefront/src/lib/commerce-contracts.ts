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

// 구조 조건 검색 계약 — POST /store/product-condition-search (01 backend).
// 요청 필드 이름은 backend route DTO와 동일하게 유지한다.

export type ProductConditionOperator = "eq" | "gte" | "lte" | "contains"

export type ProductCondition = {
  field: string
  operator: ProductConditionOperator
  value: string | number | boolean
}

export type ConditionSearchRequest = {
  region_id: string
  query?: string
  /** catalog spec category — monitor | keyboard | mouse | living */
  category?: string
  conditions: ProductCondition[]
  /** region 통화 기준 상한 (KRW 등 major 단위) */
  max_price?: number
  in_stock_only?: boolean
  offset?: number
  limit?: number
}

/** 응답의 개별 결과 — exact variant까지 반환되어 ?v_id= 연결에 쓴다 */
export type ConditionSearchResult = {
  product_id: string
  /** 매칭은 variant 단위 — 항상 존재 */
  variant_id: string
  handle: string
  title: string
  thumbnail: string | null
  variant_title: string
  sku: string | null
  /** 해당 variant의 선택 옵션쌍 (예: {title:"스위치", value:"적축"}) */
  options: { title: string; value: string }[] | null
  /** 병합된 스펙 필드(product+variant). 없으면 null — "스펙 미확인"으로 표시 */
  specs: {
    schema_version: string
    category: string
    spec_source: string
    /** variant 우선 병합 결과. 값 null = 확인 불가 */
    fields: Record<string, unknown>
  } | null
  /** 요청 region_id 기준 가격. calculated_amount가 null이면 "가격 미확인" */
  price: {
    calculated_amount: number | null
    original_amount: number | null
    currency_code: string
  } | null
  inventory: {
    quantity: number | null
    manage_inventory: boolean
    allow_backorder: boolean
    purchasable: boolean
  } | null
}

export type ConditionSearchResponse = {
  results: ConditionSearchResult[]
  count: number
  offset: number
  limit: number
  observed_at: string
}
