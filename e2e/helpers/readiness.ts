import type { ApiResult } from "../utils/api"
import { storeApi } from "../utils/api"
import { e2eEnv } from "../utils/env"

// ============================================================
// SOL 확정 리뷰 계약 (01 공식 Module 채택)
// 읽기:
//   GET /store/products/:id/reviews
//     ?sort=newest|rating_desc|rating_asc&offset=0&limit=10(max 50)
//     &variant_id=<exact variant only — 상품 전체와 섞지 않음>
//   → { reviews:[{id,product_id,variant_id,title,body,rating,
//       written_at,source:"native"|"amazon"|"synthetic",source_ref,
//       is_synthetic,verified_purchase}],
//       count, offset, limit,
//       summary:{average_rating:null|number, review_count} }
//   공개 조회는 approved+displayable만 — status 필터 요청은 400 기대.
//   GET /store/product-review-stats?product_ids=a,b
//   → { stats:[{product_id,average_rating:null|number,review_count}] }
//   유효 상품의 리뷰 없음은 review_count=0·average=null을 미리 반환.
// 쓰기(fixture):
//   POST /admin/product-reviews/import  (Admin 전용, max100, atomic)
//   body { reviews:[{product_id,variant_id?,external_review_id,asin?,
//     parent_asin?,title,body,rating:int 1..5,written_at:ISO,source,
//     source_ref,is_synthetic,verified_purchase?,status:pending|
//     approved|flagged,displayable,rights_ref}] }
//   unique(source, external_review_id) + idempotent. ASIN 자동추정 금지.
// UI testid (02 지정): review-summary review-count review-average
//   review-list review-item review-sort review-page-next review-empty
//   product-review-summary
// ============================================================
export const REVIEW_CONTRACT = {
  listPath: "/store/products/:id/reviews",
  statsPath: "/store/product-review-stats", // batch: ?product_ids=a,b
  sortParam: "sort",
  sortLatest: "newest",
  sortRating: "rating_desc",
  sortRatingAsc: "rating_asc",
  pageParam: "offset",
  limitParam: "limit",
  maxLimit: 50,
  variantParam: "variant_id",
  itemsField: "reviews",
  countField: "count",
  // 리뷰 항목 필드 (공개 DTO에 status·email·ASIN·rights 없음)
  ratingField: "rating",
  titleField: "title",
  bodyField: "body",
  createdField: "written_at",
  productField: "product_id",
  variantField: "variant_id",
  sourceField: "source",
  syntheticFlagField: "is_synthetic",
  // Admin import (fixture 전용 — SOL provision 키를 env로만 제공)
  seedPath: "/admin/product-reviews/import",
  approvedValue: "approved",
  pendingValue: "pending",
  flaggedValue: "flagged",
  syntheticSourceValue: "synthetic",
  // fixture 식별 — isolated env의 QA 전용 상품만 지정한다.
  // main toss3days-* 상품에는 리뷰를 심지 않는다.
  fixtureProductA: process.env.E2E_FIXTURE_PRODUCT_A ?? "",
  fixtureProductB: process.env.E2E_FIXTURE_PRODUCT_B ?? "",
  fixtureVariantA1: process.env.E2E_FIXTURE_VARIANT_A1 ?? "",
  ui: {
    summary: "review-summary",
    count: "review-count",
    average: "review-average",
    list: "review-list",
    item: "review-item",
    sortControl: "review-sort",
    pageNext: "review-page-next",
    emptyState: "review-empty",
    cardSummary: "product-review-summary",
  },
} as const

const REQUIRED_KEYS: (keyof typeof REVIEW_CONTRACT)[] = [
  "fixtureProductA",
  "fixtureProductB",
]

const missingKeys = (): string[] =>
  REQUIRED_KEYS.filter((k) => !REVIEW_CONTRACT[k])

// 읽기 계약은 확정됐다 — fixture 상품 식별만 환경 의존이다.
export const assertReviewContract = (): void => {
  const missing = missingKeys()
  if (missing.length > 0) {
    throw new Error(
      "[E2E] 리뷰 fixture 식별 env 미설정 — isolated env provision 후 설정: " +
        missing.map((k) => "E2E_" + k.replace(/([A-Z])/g, "_$1").toUpperCase()).join(", ")
    )
  }
}

export const assertReviewUiContract = (): void => {
  // UI testid는 02가 지정해 확정됐다 — 별도 env 요구 없음.
}

// Admin import에는 SOL provision의 admin 토큰이 필요하다 — env로만 제공.
export const assertSeedContract = (): void => {
  if (!process.env.E2E_ADMIN_TOKEN) {
    throw new Error(
      "[E2E] E2E_ADMIN_TOKEN 미설정 — Admin import fixture는 isolated env에서만 실행"
    )
  }
}

export const assertVariantContract = (): void => {
  if (!REVIEW_CONTRACT.variantField) {
    throw new Error("[E2E] 리뷰 계약에 variant 필드가 없다")
  }
}

// ---- 리뷰 조회 헬퍼 ----------------------------------------------------

export type ReviewSort = "latest" | "rating"

export const listPublicReviews = async (
  productId: string,
  opts: {
    sort?: ReviewSort | "rating_asc"
    offset?: number
    limit?: number
    variantId?: string
  } = {}
): Promise<ApiResult> => {
  const c = REVIEW_CONTRACT
  const query: Record<string, string | number | undefined> = {}
  if (opts.sort) {
    query[c.sortParam] =
      opts.sort === "latest"
        ? c.sortLatest
        : opts.sort === "rating"
          ? c.sortRating
          : c.sortRatingAsc
  }
  if (opts.offset !== undefined) {
    query[c.pageParam] = opts.offset
  }
  if (opts.limit !== undefined) {
    query[c.limitParam] = opts.limit
  }
  if (opts.variantId !== undefined) {
    query[c.variantParam] = opts.variantId
  }
  return storeApi(c.listPath.replace(":id", productId), { query })
}

export const reviewItemsOf = (res: ApiResult): Record<string, unknown>[] => {
  const items = res.json?.[REVIEW_CONTRACT.itemsField]
  return Array.isArray(items) ? items : []
}

// batch stats — 유효 상품의 리뷰 없음도 stats 항목(count0·avg null)으로
// 반환되므로 항목 부재는 "유효하지 않은 상품" 신호로 해석한다.
export const getReviewStatsBatch = async (
  productIds: string[]
): Promise<{ product_id: string; average_rating: number | null; review_count: number }[]> => {
  const res = await storeApi(REVIEW_CONTRACT.statsPath, {
    query: { product_ids: productIds.join(",") },
  })
  if (!res.ok) {
    throw new Error("[E2E] 리뷰 stats 조회 실패: " + res.status)
  }
  const stats = res.json?.stats
  if (!Array.isArray(stats)) {
    throw new Error("[E2E] 리뷰 stats 응답에 stats 배열이 없다")
  }
  return stats
}

export const getPublicReviewStats = async (
  productId: string
): Promise<{ count: number; average: number | null }> => {
  const stats = await getReviewStatsBatch([productId])
  const entry = stats.find((s) => s.product_id === productId)
  if (!entry) {
    throw new Error(
      "[E2E] stats 응답에 해당 product_id가 없다 — 유효 상품에 기본0을 반환하는 계약 위반: " +
        productId
    )
  }
  return { count: entry.review_count, average: entry.average_rating }
}

// ---- 합성 fixture (Admin import 전용) -----------------------------------
// isolated env의 QA 전용 상품에만 주입한다. main toss3days-* 상품의
// 실제 리뷰 수는 0을 유지한다.

export type SyntheticReviewInput = {
  product_id: string
  variant_id?: string
  external_review_id: string
  title: string
  body: string
  rating: number
  written_at: string
  source: string
  source_ref?: string
  is_synthetic: boolean
  status: string
  displayable: boolean
  verified_purchase?: boolean
  asin?: string
  parent_asin?: string
  rights_ref?: string
}

export const adminApi = async (
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<ApiResult> => {
  assertSeedContract()
  const url = new URL(e2eEnv.backendURL + path)
  const res = await fetch(url.toString(), {
    method: init.method ?? "GET",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + process.env.E2E_ADMIN_TOKEN,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, ok: res.ok, json }
}

export const importReviews = async (
  reviews: SyntheticReviewInput[]
): Promise<ApiResult> =>
  adminApi(REVIEW_CONTRACT.seedPath, {
    method: "POST",
    body: { reviews },
  })

export const seedSyntheticReview = async (
  input: SyntheticReviewInput
): Promise<ApiResult> => importReviews([input])

// ---- 반품 API ----------------------------------------------------------
// 설치 코어 확인: @medusajs/medusa@2.21.2 dist/api/store/returns/route.js는
// 의도적 비인증이며 createAndCompleteReturnOrderWorkflow를 직접 실행한다.
// 권한 보호는 01이 프로젝트 middlewares로 추가한다 — 코어 route를 복제하지 않는다.

export const createReturnApi = (
  body: unknown,
  token?: string
): Promise<ApiResult> =>
  storeApi("/store/returns", {
    method: "POST",
    token,
    body,
  })
