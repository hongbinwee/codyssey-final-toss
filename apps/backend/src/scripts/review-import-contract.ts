/**
 * Minimal review import/read contract — PROPOSED DRAFT (SOL 확정 계약 반영).
 *
 * 01 Commerce Core가 공식 Module 방식으로 schema/API/migration을 직접 확정하고,
 * 이 파일은 계약 타입 + 검증/투영 헬퍼만 제공한다 (소유: 03).
 *
 * 확정된 읽기 표준:
 *   GET /store/products/:id/reviews
 *     ?sort=newest|rating_desc|rating_asc&offset=0&limit=10 (limit max 50)
 *     &variant_id=<id>  // 지정 시 그 exact variant의 리뷰만 (상품 전체와 섞지 않음)
 *   -> { reviews: ReviewPublicItem[], count, offset, limit,
 *        summary: { average_rating: number|null, review_count: number } }
 *   GET /store/product-review-stats?product_ids=a,b,c
 *   -> { stats: [{ product_id, average_rating: number|null, review_count }] }
 *   (유효한 product_id에 대해 리뷰가 없으면 review_count=0, average=null로 채운다)
 *
 * 규칙:
 * - 공개 조회는 status="approved" AND displayable=true 만. client가 pending을
 *   요청할 수 없다.
 * - P0에 리뷰 쓰기 UI는 없다. 적재는 Admin만:
 *   POST /admin/product-reviews/import (body 최대 100건, Admin only).
 * - 외부 리뷰는 기존 Medusa customer/order 없이도 허용돼야 한다 (필수).
 * - verified_purchase는 출처 사이트의 claim일 뿐 Medusa 구매 인증이 아니다.
 * - unique (source, external_review_id). 중복은 datasource 충돌로 명시.
 * - ASIN으로 상품을 자동 추정 매핑하지 않는다 — product_id/variant_id는
 *   적재 측이 명시하고, variant_id는 해당 product 소속이어야 한다.
 * - 적재 전 전체 validation을 통과한 뒤 atomic하게 쓰고 멱등(idempotent).
 * - 실측되지 않은 값은 null — 추정 금지. rights 불명이면 displayable=false.
 */

export const REVIEW_CONTRACT_VERSION = "review-contract-draft-3"

/** 출처 채널 — 합성 여부(is_synthetic)와 직교하는 별개 축이다. */
export type ReviewSource = "native" | "amazon" | "synthetic"

/** moderation 상태. flagged = 숨김 검토 대상. 공개는 approved뿐. */
export type ReviewStatus = "pending" | "approved" | "flagged"

export type ReviewSort = "newest" | "rating_desc" | "rating_asc"

/**
 * POST /admin/product-reviews/import 의 body.reviews[] 원소 — 적재 측 입력.
 */
export interface ReviewImportItem {
  // --- Medusa 연결 (적재 측이 명시, ASIN 자동 추정 매핑 금지) ---
  product_id: string // prod_* 필수
  variant_id?: string | null // 지정 시 해당 product 소속이어야 함

  // --- 외부 식별 ---
  external_review_id: string // unique(source, external_review_id)의 일부
  asin?: string | null
  parent_asin?: string | null

  // --- 내용 ---
  title: string | null // 입력 optional null. 01 model이 text 필수면 '' 저장하거나 model nullable로 — canonical public은 null 유지 (SOL 결정)
  body: string // 원문 필수
  rating: number // 1..5 정수 필수
  written_at: string // 리뷰 작성일, ISO 8601

  // --- 출처/상태 ---
  source: ReviewSource // "synthetic"이면 is_synthetic=true 필수 (double-false 금지)
  source_ref: string | null // 원본 참조 — 공개-safe 내용만
  is_synthetic: boolean
  verified_purchase?: boolean | null // 출처 사이트의 claim, Medusa 인증 아님
  status: ReviewStatus // 기본값 "pending"
  displayable: boolean // rights 불명/비공개 원본이면 false
  rights_ref: string | null // 이용조건·라이선스 참조 — 외부 데이터 필수
}

export const REVIEW_IMPORT_MAX_BATCH = 100 // Admin import 배치 상한 (01 Admin schema 동일). 참고: Store 목록의 limit max 50과는 별개 값이다.

/** Import 아이템 1건의 field-level 검증 — 문제 목록을 반환(비어 있으면 유효). */
export function validateReviewImportItem(item: ReviewImportItem): string[] {
  const problems: string[] = []

  if (!item.product_id || !item.product_id.startsWith("prod_")) {
    problems.push("product_id missing or not a prod_* id")
  }
  if (!Number.isInteger(item.rating) || item.rating < 1 || item.rating > 5) {
    problems.push("rating must be an integer in 1..5")
  }
  if (!item.body || !item.body.trim()) {
    problems.push("body is required")
  }
  if (!item.written_at || Number.isNaN(Date.parse(item.written_at))) {
    problems.push("written_at must be a parseable ISO 8601 date")
  }
  if (!item.external_review_id || !item.external_review_id.trim()) {
    problems.push("external_review_id is required for unique(source,id)")
  }
  if (item.source !== "native") {
    if (!item.source_ref) {
      problems.push("non-native source requires source_ref")
    }
    if (!item.rights_ref) {
      problems.push("non-native source requires rights_ref")
    }
  }
  if (item.rights_ref == null && item.displayable === true) {
    problems.push("rights_ref unknown => displayable must be false")
  }
  if (item.source === "synthetic" && item.is_synthetic !== true) {
    problems.push("source=synthetic requires is_synthetic=true")
  }
  return problems
}

/** 배치 검증 — 중복 (source, external_review_id) 충돌을 명시하고 atomic해야 한다. */
export function validateReviewImportBatch(
  items: ReviewImportItem[]
): { problems: string[] } {
  const problems: string[] = []
  if (items.length === 0) problems.push("empty batch")
  if (items.length > REVIEW_IMPORT_MAX_BATCH) {
    problems.push("batch exceeds max " + REVIEW_IMPORT_MAX_BATCH)
  }
  const seen = new Map<string, number>()
  items.forEach((item, idx) => {
    for (const p of validateReviewImportItem(item)) {
      problems.push("reviews[" + idx + "]: " + p)
    }
    const key = item.source + ":" + item.external_review_id
    if (seen.has(key)) {
      problems.push(
        "reviews[" + idx + "]: duplicate (source,external_review_id) conflicts with reviews[" + seen.get(key) + "]"
      )
    } else {
      seen.set(key, idx)
    }
  })
  return { problems }
}

/**
 * Store 공개 리뷰 — asin/parent_asin/external_review_id/rights_ref/status와
 * 고객 개인정보는 투영하지 않는다. source_ref는 공개-safe 내용만.
 */
export interface ReviewPublicItem {
  id: string
  product_id: string
  variant_id: string | null
  title: string | null
  body: string
  rating: number
  written_at: string
  source: ReviewSource
  source_ref: string | null
  is_synthetic: boolean
  verified_purchase: boolean | null // 출처 사이트 claim — Medusa 인증 아님
}

export interface ReviewListResponse {
  reviews: ReviewPublicItem[]
  count: number
  offset: number
  limit: number
  summary: { average_rating: number | null; review_count: number }
}

export interface ProductReviewStatsItem {
  product_id: string
  average_rating: number | null
  review_count: number
}

export interface ProductReviewStatsResponse {
  stats: ProductReviewStatsItem[]
}

interface StoredReview extends ReviewImportItem {
  id: string
}

/** approved + displayable이 아니면 공개 아이템으로 투영하지 않는다. */
export function toPublicReview(
  item: StoredReview | (ReviewImportItem & { id: string })
): ReviewPublicItem | null {
  if (item.status !== "approved" || item.displayable !== true) return null
  return {
    id: item.id,
    product_id: item.product_id,
    variant_id: item.variant_id ?? null,
    title: item.title,
    body: item.body,
    rating: item.rating,
    written_at: item.written_at,
    source: item.source,
    source_ref: item.source_ref,
    is_synthetic: item.is_synthetic,
    verified_purchase: item.verified_purchase ?? null,
  }
}

/** approved + displayable 건만 집계. 0건이면 average=null (0점 표시 금지). 평균은 backend 표준 소수점 2자리(01 메서드 동일), UI 표시는 toFixed(1) 등 별도. */
export function aggregateReviewStats(
  product_id: string,
  items: (ReviewImportItem & { id?: string })[]
): ProductReviewStatsItem {
  const pub = items.filter(
    (r) =>
      r.product_id === product_id &&
      r.status === "approved" &&
      r.displayable === true
  )
  if (!pub.length) {
    return { product_id, review_count: 0, average_rating: null }
  }
  const sum = pub.reduce((acc, r) => acc + r.rating, 0)
  return {
    product_id,
    review_count: pub.length,
    average_rating: Math.round((sum / pub.length) * 100) / 100,
  }
}
