/**
 * DB-free unit checks for the catalog spec contract and review contract.
 * Review runtime/schema는 01 소유 — 여기서는 계약 타입·검증·투영만 검증한다.
 */
import {
  DEMO_SPEC_FIXTURES,
  buildSpecPatchInputs,
  mergeSpecs,
  SPEC_SCHEMA_VERSION,
  type KeyboardSpecFields,
  type MonitorSpecFields,
} from "../catalog-spec-contract"
import {
  aggregateReviewStats,
  REVIEW_CONTRACT_VERSION,
  toPublicReview,
  validateReviewImportBatch,
  validateReviewImportItem,
  type ReviewImportItem,
} from "../review-import-contract"
import { KOREAN_DEMO_PRODUCTS } from "../seed-korean-catalog-data"

const validItem = (over: Partial<ReviewImportItem> = {}): ReviewImportItem => ({
  product_id: "prod_01M4VE6BE9ZB146HJW469S61XF",
  variant_id: null,
  external_review_id: "R-TEST-1",
  asin: null,
  parent_asin: null,
  title: "홀수 리뷰",
  body: "본문입니다.",
  rating: 5,
  written_at: "2026-10-01T00:00:00Z",
  source: "synthetic",
  source_ref: "test-fixture",
  is_synthetic: true,
  verified_purchase: null,
  status: "approved",
  displayable: true,
  rights_ref: "internal-test-data",
  ...over,
})

describe("catalog spec contract", () => {
  const patches = buildSpecPatchInputs()

  it("covers every Korean demo product and matches its category", () => {
    const demoHandles = KOREAN_DEMO_PRODUCTS.map((p) => p.handle)
    expect(patches.map((p) => p.handle).sort()).toEqual([...demoHandles].sort())
    for (const p of patches) {
      const demo = KOREAN_DEMO_PRODUCTS.find((d) => d.handle === p.handle)!
      expect(p.product_metadata_patch.specs.schema_version).toBe(SPEC_SCHEMA_VERSION)
      expect(p.product_metadata_patch.specs.category).toBe(demo.category)
      expect(p.product_metadata_patch.specs.spec_source).toBe("seed_demo_text")
    }
  })

  it("keeps unverifiable fields as null instead of guessing", () => {
    const mon24 = DEMO_SPEC_FIXTURES["toss3days-monitor-24-fhd"]
      .product.fields as MonitorSpecFields
    expect(mon24.usb_c).toBeNull() // USB-C 언급 없음 — false가 아니라 unknown
    const kb87 = DEMO_SPEC_FIXTURES["toss3days-keyboard-87"]
      .product.fields as KeyboardSpecFields
    expect(kb87.connection).toBeNull() // 연결 방식 미명시
    const retro = DEMO_SPEC_FIXTURES["toss3days-keyboard-retro"]
      .product.fields as KeyboardSpecFields
    expect(retro.connection).toEqual(["wireless"]) // 무선만 확인됨, 프로토콜 미명시
  })

  it("puts panel as variant override for the dual-panel monitor", () => {
    const f = DEMO_SPEC_FIXTURES["toss3days-monitor-27-qhd"]
    expect((f.product.fields as MonitorSpecFields).panel).toBeNull()
    expect(f.variants["T3D-MON27-IPS"].fields).toEqual({ panel: "ips" })
    expect(f.variants["T3D-MON27-VA"].fields).toEqual({ panel: "va" })

    const merged = mergeSpecs(f.product, f.variants["T3D-MON27-IPS"])
    expect((merged as MonitorSpecFields).panel).toBe("ips")
    expect((merged as MonitorSpecFields).refresh_hz).toBe(144)
  })

  it("maps keyboard switch options to canonical switch+noise overrides", () => {
    const f = DEMO_SPEC_FIXTURES["toss3days-keyboard-87"]
    expect(Object.keys(f.variants)).toHaveLength(6)
    expect(f.variants["T3D-KB87-BLK-RED"].fields).toEqual({
      switch: "red",
      noise: null,
    })
    expect(f.variants["T3D-KB87-BLK-BLU"].fields).toEqual({
      switch: "blue",
      noise: "clicky",
    })
    const lp = DEMO_SPEC_FIXTURES["toss3days-keyboard-lowprofile"]
    expect(lp.variants["T3D-KBLP-RED"].fields).toEqual({
      switch: "red_quiet",
      noise: "quiet",
    })
  })

  it("never copies logistics weight into spec fields", () => {
    // 물류 weight(90g)가 있어도 제품 무게 스펙은 텍스트 확인 불가면 null.
    const ms = DEMO_SPEC_FIXTURES["toss3days-mouse-wireless"]
      .product.fields as import("../catalog-spec-contract").MouseSpecFields
    expect(ms.product_weight_g).toBeNull()
    // 63g은 제품 무게가 텍스트로 확인되므로 허용.
    const gm = DEMO_SPEC_FIXTURES["toss3days-mouse-gaming"]
      .product.fields as import("../catalog-spec-contract").MouseSpecFields
    expect(gm.product_weight_g).toBe(63)
    expect(gm.dpi).toBe(26000)
  })

  it("emits metadata patch shapes that preserve existing keys", () => {
    for (const p of patches) {
      // patch는 specs 키만 담는다 — demo/seed/scenario와 병합될 객체의 부분만.
      expect(Object.keys(p.product_metadata_patch)).toEqual(["specs"])
      for (const v of p.variant_metadata_patches) {
        expect(Object.keys(v.metadata_patch)).toEqual(["specs"])
        expect(v.sku).toMatch(/^T3D-/)
      }
    }
  })
})

describe("review import contract", () => {
  it("accepts a minimal external review without customer/order", () => {
    const item = validItem({ source: "amazon", rights_ref: "amazon-reviews-2023" })
    expect(validateReviewImportItem(item)).toEqual([])
    // medusa customer/order 필드가 계약에 없어도 외부 리뷰가 유효하다.
  })

  it("rejects bad rating, missing body, bad ids and dates", () => {
    expect(validateReviewImportItem(validItem({ rating: 0 }))).toContain(
      "rating must be an integer in 1..5"
    )
    expect(validateReviewImportItem(validItem({ rating: 6 }))).toContain(
      "rating must be an integer in 1..5"
    )
    expect(validateReviewImportItem(validItem({ rating: 4.5 }))).toContain(
      "rating must be an integer in 1..5"
    )
    expect(validateReviewImportItem(validItem({ body: "  " }))).toContain(
      "body is required"
    )
    expect(
      validateReviewImportItem(validItem({ product_id: "notprod" }))
    ).toContain("product_id missing or not a prod_* id")
    expect(
      validateReviewImportItem(validItem({ written_at: "not-a-date" }))
    ).toContain("written_at must be a parseable ISO 8601 date")
    expect(
      validateReviewImportItem(validItem({ external_review_id: "" }))
    ).toContain("external_review_id is required for unique(source,id)")
  })

  it("requires source_ref and rights_ref for non-native sources", () => {
    const noRights = validItem({ source: "amazon", rights_ref: null })
    expect(validateReviewImportItem(noRights)).toContain(
      "non-native source requires rights_ref"
    )
    const noRef = validItem({ source: "amazon", source_ref: null })
    expect(validateReviewImportItem(noRef)).toContain(
      "non-native source requires source_ref"
    )
  })

  it("blocks displayable=true when rights are unknown", () => {
    const item = validItem({ source: "amazon", rights_ref: null, displayable: true })
    expect(validateReviewImportItem(item)).toContain(
      "rights_ref unknown => displayable must be false"
    )
  })

  it("requires is_synthetic=true when source is synthetic", () => {
    const bad = validItem({ source: "synthetic", is_synthetic: false })
    expect(validateReviewImportItem(bad)).toContain(
      "source=synthetic requires is_synthetic=true"
    )
    // 직교 방향은 허용: native 소스도 is_synthetic 플래그 자유
    expect(
      validateReviewImportItem(
        validItem({ source: "native", is_synthetic: true, source_ref: "t", rights_ref: "t" })
      )
    ).toEqual([])
  })

  it("caps batch at 100 items", () => {
    const items = Array.from({ length: 101 }, (_, i) =>
      validItem({ external_review_id: "R-" + i })
    )
    const { problems } = validateReviewImportBatch(items)
    expect(problems).toContain("batch exceeds max 100")
  })

  it("flags duplicate (source, external_review_id) inside a batch", () => {
    const a = validItem({ external_review_id: "R-1" })
    const b = validItem({ external_review_id: "R-1" })
    const { problems } = validateReviewImportBatch([a, b])
    expect(problems.some((p) => p.includes("duplicate (source,external_review_id)"))).toBe(true)
  })

  it("projects only approved+displayable and hides private/meta fields", () => {
    const approved = toPublicReview({ ...validItem(), id: "rev_1" })
    expect(approved).not.toBeNull()
    expect(Object.keys(approved!).sort()).toEqual(
      [
        "body",
        "id",
        "is_synthetic",
        "product_id",
        "rating",
        "source",
        "source_ref",
        "title",
        "variant_id",
        "verified_purchase",
        "written_at",
      ].sort()
    )
    // pending/flagged/displayable=false는 공개되지 않는다.
    expect(
      toPublicReview({ ...validItem({ status: "pending" }), id: "rev_2" })
    ).toBeNull()
    expect(
      toPublicReview({ ...validItem({ status: "flagged" }), id: "rev_3" })
    ).toBeNull()
    expect(
      toPublicReview({
        ...validItem({ displayable: false }),
        id: "rev_4",
      })
    ).toBeNull()
  })

  it("aggregates stats only over approved+displayable, null avg when empty", () => {
    const pid = "prod_01M4VE6BE9ZB146HJW469S61XF"
    const items = [
      validItem({ rating: 5 }),
      validItem({ rating: 3, external_review_id: "R-2" }),
      validItem({ rating: 1, external_review_id: "R-3", status: "pending" }),
      validItem({ rating: 4, external_review_id: "R-4", displayable: false }),
    ]
    const stats = aggregateReviewStats(pid, items)
    expect(stats.review_count).toBe(2)
    expect(stats.average_rating).toBe(4)
    const empty = aggregateReviewStats("prod_OTHER", items)
    expect(empty.review_count).toBe(0)
    expect(empty.average_rating).toBeNull()
  })

  it("rounds average to 2 decimals (backend standard)", () => {
    const pid = "prod_01M4VE6BE9ZB146HJW469S61XF"
    const items = [
      validItem({ rating: 5 }),
      validItem({ rating: 4, external_review_id: "R-8" }),
      validItem({ rating: 4, external_review_id: "R-9" }),
    ]
    // (5+4+4)/3 = 4.333… → 4.33
    expect(aggregateReviewStats(pid, items).average_rating).toBe(4.33)
  })
})

// 타입 버전 고정 — 계약 변경 시 버전 범프 필수.
describe("contract versions", () => {
  it("pins the draft versions", () => {
    expect(REVIEW_CONTRACT_VERSION).toBe("review-contract-draft-3")
    expect(SPEC_SCHEMA_VERSION).toBe("catalog-spec-v1")
  })
})
