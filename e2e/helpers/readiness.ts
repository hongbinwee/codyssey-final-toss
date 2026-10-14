import type { ApiResult } from "../utils/api"
import { storeApi } from "../utils/api"

// ============================================================
// SOL 확정 계약 블록 (04 소유)
// 리뷰 저장·조회 방식(플러그인 vs 공식 모듈), metadata 스펙 규격,
// UI testid 계약이 아직 미확정이다. 빈 문자열 값은 "계약 미확정"을
// 뜻하고, 해당 테스트는 skip이 아니라 명시적 오류로 실패한다.
// SOL이 API/type 계약을 전달하면 이 상수만 갱신한다.
// ============================================================
export const REVIEW_CONTRACT = {
  // 공개 리뷰 목록 경로 — ":id"는 product_id로 치환한다
  listPath: "",
  // 집계(평균·수) 별도 경로 — 없으면 ""로 두고 list에서 재계산한다
  statsPath: "",
  // 정렬·페이지 파라미터
  sortParam: "",
  sortLatest: "",
  sortRating: "",
  pageParam: "",
  limitParam: "",
  // 목록 응답 shape
  itemsField: "",
  countField: "",
  avgField: "",
  // 리뷰 항목 필드
  ratingField: "",
  titleField: "",
  bodyField: "",
  createdField: "",
  statusField: "",
  productField: "",
  variantField: "", // 계약에 variant 연결이 없으면 "" — 매핑 테스트는 별도 가드로 실패한다
  sourceField: "", // 실제/합성/외부 출처 구분 필드
  approvedValue: "",
  pendingValue: "",
  // 합성 fixture 주입 — SOL이 지정한 Admin import 경로만 사용한다.
  // main toss3days-* 상품에는 리뷰를 심지 않는다.
  seedPath: "",
  fixtureProductA: "", // QA 전용 synthetic 상품 handle 또는 id
  fixtureProductB: "",
  fixtureVariantA1: "",
  fixtureVariantA2: "",
  // UI testid 계약 (02 확정)
  ui: {
    section: "",
    emptyState: "",
    item: "",
    sortControl: "",
    cardStars: "",
    cardCount: "",
    syntheticLabel: "",
    specTable: "",
    compareTable: "",
  },
} as const

const REQUIRED_KEYS: (keyof typeof REVIEW_CONTRACT)[] = [
  "listPath",
  "sortParam",
  "sortLatest",
  "sortRating",
  "pageParam",
  "limitParam",
  "itemsField",
  "countField",
  "ratingField",
  "createdField",
  "statusField",
  "productField",
  "sourceField",
  "approvedValue",
  "pendingValue",
  "seedPath",
  "fixtureProductA",
  "fixtureProductB",
]

const REQUIRED_UI_KEYS: (keyof typeof REVIEW_CONTRACT.ui)[] = [
  "section",
  "emptyState",
  "item",
  "cardStars",
  "cardCount",
  "syntheticLabel",
]

const missingKeys = (): string[] =>
  REQUIRED_KEYS.filter((k) => !REVIEW_CONTRACT[k])

// 계약이 채워지기 전에는 어떤 리뷰 테스트도 통과로 위장하지 않는다.
export const assertReviewContract = (): void => {
  const missing = missingKeys()
  if (missing.length > 0) {
    throw new Error(
      "[E2E] 리뷰 API/type 계약 미확정 — SOL 계약 전달 후 REVIEW_CONTRACT 갱신: " +
        missing.join(", ")
    )
  }
}

export const assertReviewUiContract = (): void => {
  assertReviewContract()
  const missing = REQUIRED_UI_KEYS.filter((k) => !REVIEW_CONTRACT.ui[k])
  if (missing.length > 0) {
    throw new Error(
      "[E2E] 리뷰 UI testid 계약 미확정(02): " + missing.join(", ")
    )
  }
}

// variant 연결은 계약 선택 사항이 될 수 있다 — 없으면 실패가 아니라
// 계약 공백 보고 항목이므로 전용 가드로 구분한다.
export const assertVariantContract = (): void => {
  assertReviewContract()
  if (!REVIEW_CONTRACT.variantField) {
    throw new Error(
      "[E2E] 리뷰 계약에 variant 연결 필드가 없다 — 계약 공백으로 SOL에 보고 필요"
    )
  }
}

// ---- 리뷰 조회 헬퍼 ----------------------------------------------------

export type ReviewSort = "latest" | "rating"

export const listPublicReviews = async (
  productId: string,
  opts: { sort?: ReviewSort; page?: number; limit?: number } = {}
): Promise<ApiResult> => {
  assertReviewContract()
  const c = REVIEW_CONTRACT
  const query: Record<string, string | number | undefined> = {}
  if (opts.sort) {
    query[c.sortParam] = opts.sort === "latest" ? c.sortLatest : c.sortRating
  }
  if (opts.page !== undefined) {
    query[c.pageParam] = opts.page
  }
  if (opts.limit !== undefined) {
    query[c.limitParam] = opts.limit
  }
  return storeApi(c.listPath.replace(":id", productId), { query })
}

export const reviewItemsOf = (res: ApiResult): Record<string, unknown>[] => {
  const items = res.json?.[REVIEW_CONTRACT.itemsField]
  return Array.isArray(items) ? items : []
}

// 공개 통계 — stats endpoint가 있으면 조회하고, 없으면 목록에서 계산한다.
// 페이지네이션으로 목록이 잘릴 때 재계산은 금지(평균 왜곡).
export const getPublicReviewStats = async (
  productId: string
): Promise<{ count: number; average: number | null }> => {
  assertReviewContract()
  const c = REVIEW_CONTRACT
  if (c.statsPath) {
    const res = await storeApi(c.statsPath.replace(":id", productId))
    if (!res.ok) {
      throw new Error("[E2E] 리뷰 stats 조회 실패: " + res.status)
    }
    const avg = c.avgField ? res.json?.[c.avgField] : null
    return {
      count: Number(res.json?.[c.countField] ?? 0),
      average: typeof avg === "number" ? avg : null,
    }
  }
  const res = await listPublicReviews(productId)
  if (!res.ok) {
    throw new Error("[E2E] 리뷰 목록 조회 실패: " + res.status)
  }
  const items = reviewItemsOf(res)
  const count = Number(res.json?.[c.countField] ?? items.length)
  if (items.length !== count) {
    throw new Error(
      "[E2E] stats endpoint 없이 페이지네이션된 목록으로 평균을 계산할 수 없다"
    )
  }
  if (count === 0) {
    return { count: 0, average: null }
  }
  const ratings = items
    .map((item) => item[c.ratingField])
    .filter((v): v is number => typeof v === "number")
  if (ratings.length !== items.length) {
    throw new Error("[E2E] rating 필드가 숫자가 아닌 항목이 있다")
  }
  const average = ratings.reduce((a, b) => a + b, 0) / ratings.length
  return { count, average }
}

// ---- 합성 fixture ------------------------------------------------------
// SOL 지정 isolated DB + Admin import 경로에서만 호출한다.
// main toss3days-* 상품의 실제 리뷰 수는 0을 유지한다.

export type SyntheticReviewInput = {
  product_id: string
  variant_id?: string
  rating: number
  title?: string
  body?: string
  status?: string
  source?: string
  external_id?: string
  created_at?: string
}

export const seedSyntheticReview = async (
  input: SyntheticReviewInput
): Promise<ApiResult> => {
  assertReviewContract()
  return storeApi(REVIEW_CONTRACT.seedPath, {
    method: "POST",
    body: input,
  })
}

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
