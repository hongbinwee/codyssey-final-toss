import { expect, test } from "@playwright/test"
import {
  discoverCatalog,
  storeApi,
  type ApiResult,
  type StoreProduct,
} from "./utils/api"
import { trackConsoleErrors } from "./utils/helpers"
import { e2eEnv } from "./utils/env"
import { getReviewStatsBatch } from "./helpers/readiness"

// ============================================================
// 조건 검색 → 비교 → 구매 (TDD RED — 01 endpoint / 02 UI 머지 전)
//
// 확정 요청 계약 (SOL, 01 구현 중):
//   POST /store/product-condition-search
//   { region_id, query?, category?,
//     conditions: [{ field, operator: eq|gte|lte|contains, value }],
//     max_price?, in_stock_only?, offset?, limit? }
// 확정 응답 DTO (SOL, 01 기본 계약):
//   { results: [...], count, offset, limit, observed_at }
//   result: { product_id, variant_id, handle, title, thumbnail,
//     variant_title, sku, options, specs, price, inventory }
//   price = { calculated_amount: number | null, original_amount,
//     currency_code }
//   inventory = { quantity, manage_inventory, allow_backorder, purchasable }
//
// 공유 selector (02 지정): condition-search-form, condition-category,
//   condition-max-price, condition-search-submit, condition-search-results,
//   condition-search-result, condition-search-empty, condition-search-error,
//   compare-toggle, compare-tray, compare-open
// 02 추가 예정 selector: condition-search-loading, condition-search-item-price,
//   compare-tray-count, comparison-availability
//
// 02 flow 계약:
//   1) /store의 폼 — category 선택 시 해당 카테고리 조건 필드 노출,
//      max_price 기본값 400000, submit 후 results|empty|error 중 하나.
//      결과 카드 링크는 /products/{handle}?v_id={variant_id}.
//   2) compare-toggle 2~4개 → compare-tray → compare-open이
//      /compare?products=..&variants=.. 로 이동 (인덱스 순서 대응).
//   3) 회귀(05): calculated_price null인 variant는 comparison-availability가
//      '가격 미확인' — '구매 가능'을 표시하면 안 된다.
//
// fixture는 시드된 toss3days-* 카탈로그를 그대로 쓴다 — 새 seed/DB 쓰기 없음.
// 카트 생성만 isolated env의 Store API를 쓴다 (cart line 확인용).
// ============================================================

const SEARCH_PATH = "/store/product-condition-search"

type Condition = { field: string; operator: string; value: unknown }
type ConditionSearchBody = {
  region_id: string
  query?: string
  category?: string
  conditions?: Condition[]
  max_price?: number
  in_stock_only?: boolean
  offset?: number
  limit?: number
}

const conditionSearch = (body: ConditionSearchBody): Promise<ApiResult> =>
  storeApi(SEARCH_PATH, { method: "POST", body })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const resultsOf = (res: ApiResult): any[] => {
  const j = res.json
  const arr = j?.results
  if (!Array.isArray(arr)) {
    throw new Error(
      "[E2E] condition-search 응답에 results 배열이 없다 — 확정 DTO 계약 위반: " +
        JSON.stringify(j)?.slice(0, 300)
    )
  }
  // envelope 계약: count·offset·limit·observed_at (확정 DTO)
  expect(typeof j?.count, "count가 없다").toBe("number")
  // count는 조건 매치 총량 — 현 페이지 크기보다 작을 수 없다
  expect(j.count).toBeGreaterThanOrEqual(arr.length)
  expect(typeof j?.offset, "offset이 없다").toBe("number")
  expect(typeof j?.limit, "limit이 없다").toBe("number")
  expect(typeof j?.observed_at, "observed_at이 없다").toBe("string")
  expect(
    Number.isNaN(Date.parse(j.observed_at)),
    "observed_at이 날짜가 아니다: " + j.observed_at
  ).toBe(false)
  return arr
}

// 확정 DTO 필수 키 — 하나라도 없으면 계약 위반으로 실패한다.
const RESULT_KEYS = [
  "product_id",
  "variant_id",
  "handle",
  "title",
  "variant_title",
  "sku",
  "options",
  "specs",
  "price",
  "inventory",
] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const assertResultShape = (r: any): void => {
  for (const key of RESULT_KEYS) {
    expect(
      Object.prototype.hasOwnProperty.call(r, key),
      "result 필드 누락: " + key
    ).toBe(true)
  }
  expect(typeof r.product_id).toBe("string")
  expect(typeof r.variant_id).toBe("string")
  expect(typeof r.specs).toBe("object")
  // 05 review 반영 — 가격 계산이 불가한 variant는 calculated_amount가 null이다
  expect(
    Object.prototype.hasOwnProperty.call(r.price ?? {}, "calculated_amount"),
    "price.calculated_amount 키가 없다"
  ).toBe(true)
  expect(
    r.price.calculated_amount === null ||
      typeof r.price.calculated_amount === "number",
    "price.calculated_amount는 number|null이어야 한다"
  ).toBe(true)
  expect(typeof r.inventory?.purchasable).toBe("boolean")
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const priceOf = (r: any): number =>
  typeof r?.price?.calculated_amount === "number"
    ? r.price.calculated_amount
    : NaN

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const purchasableOf = (r: any): boolean | undefined => {
  const v = r?.inventory?.purchasable
  return typeof v === "boolean" ? v : undefined
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const specOf = (r: any, key: string): unknown => r?.specs?.fields?.[key]

type CatalogFixture = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  product: any
  handle: string
}

const fetchProduct = async (
  regionId: string,
  handle: string
): Promise<CatalogFixture> => {
  const res = await storeApi("/store/products", {
    query: {
      handle,
      region_id: regionId,
      fields: "id,handle,title,metadata,*variants,*variants.calculated_price,+variants.inventory_quantity",
    },
  })
  if (!res.ok || !res.json?.products?.[0]) {
    throw new Error("[E2E] fixture 상품 조회 실패: " + handle)
  }
  return { product: res.json.products[0], handle }
}

test.describe("조건 검색 API", () => {
  let regionId = ""
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let qhd: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fhd: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let uhd: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let limited: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let retro: any

  test.beforeAll(async () => {
    const cat = await discoverCatalog()
    regionId = cat.region.id
    qhd = (await fetchProduct(regionId, "toss3days-monitor-27-qhd")).product
    fhd = (await fetchProduct(regionId, "toss3days-monitor-24-fhd")).product
    uhd = (await fetchProduct(regionId, "toss3days-monitor-32-uhd")).product
    limited = (await fetchProduct(regionId, "toss3days-monitor-27-limited"))
      .product
    retro = (await fetchProduct(regionId, "toss3days-keyboard-retro")).product
  })

  test("27인치 QHD 144Hz 조건은 정확히 매치된 상품의 variant만 반환한다", async () => {
    const res = await conditionSearch({
      region_id: regionId,
      category: "monitor",
      conditions: [
        { field: "inch", operator: "eq", value: 27 },
        { field: "refresh_hz", operator: "gte", value: 144 },
      ],
    })
    expect(res.ok, "condition-search 응답 실패: " + res.status).toBe(true)
    const results = resultsOf(res)
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      assertResultShape(r)
    }

    // 결과의 sku·variant_title·options·가격은 동일 상품의 Product API
    // variant와 정확히 일치해야 한다 — 검색 결과가 별도 데이터로 번짐 방지
    const catAll = await discoverCatalog()
    const variantMap = new Map<
      string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { product: any; variant: any }
    >()
    for (const p of catAll.products as StoreProduct[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const v of (p.variants ?? []) as any[]) {
        variantMap.set(v.id, { product: p, variant: v })
      }
    }
    for (const r of results) {
      const hit = variantMap.get(String(r.variant_id))
      expect(
        hit,
        "카탈로그에 없는 variant_id가 결과에 있다: " + r.variant_id
      ).toBeTruthy()
      expect(hit!.product.id).toBe(r.product_id)
      expect(r.sku).toBe(hit!.variant.sku)
      expect(r.variant_title).toBe(hit!.variant.title)
      expect(priceOf(r)).toBe(
        hit!.variant.calculated_price?.calculated_amount
      )
      // result.options는 해당 variant의 실제 옵션값을 담아야 한다
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const o of (hit!.variant.options ?? []) as any[]) {
        expect(JSON.stringify(r.options)).toContain(JSON.stringify(o.value))
      }
    }

    const qhdIds = (qhd.variants ?? []).map((v: StoreProduct) => v.id)
    const found = results.filter((r) => r.product_id === qhd.id)
    expect(
      found.length,
      "27인치 QHD 144Hz 조건에 monitor-27-qhd가 없다"
    ).toBeGreaterThan(0)
    for (const r of found) {
      expect(qhdIds, "다른 상품의 variant가 섞였다").toContain(r.variant_id)
      expect(specOf(r, "inch")).toBe(27)
      expect(Number(specOf(r, "refresh_hz"))).toBeGreaterThanOrEqual(144)
    }
    // 조건 미충족·unknown(refresh null) 상품은 결과에 없어야 한다
    const productIds = new Set(results.map((r) => String(r.product_id)))
    expect(productIds.has(fhd.id), "24인치 FHD 노출").toBe(false)
    expect(productIds.has(uhd.id), "32인치 UHD 노출").toBe(false)
    expect(
      productIds.has(limited.id),
      "refresh_hz unknown(27-limited) 노출"
    ).toBe(false)
  })

  test("조건이 서로 다른 variant에 분산되면 거짓양성이 없다", async () => {
    // monitor-27-qhd: IPS variant 319,000원 / VA variant 289,000원.
    // panel=ips + max_price 300000 을 동시에 만족하는 단일 variant는 없다.
    const res = await conditionSearch({
      region_id: regionId,
      category: "monitor",
      conditions: [{ field: "panel", operator: "eq", value: "ips" }],
      max_price: 300000,
    })
    expect(res.ok).toBe(true)
    const results = resultsOf(res)
    expect(
      results.some((r) => r.product_id === qhd.id),
      "ips(319000)와 ≤300000(va)를 다른 variant에서 합쳐 매치 — 거짓양성"
    ).toBe(false)

    // 대조: panel=va + max_price 300000 은 VA variant만 정확히 반환한다
    const vaRes = await conditionSearch({
      region_id: regionId,
      category: "monitor",
      conditions: [{ field: "panel", operator: "eq", value: "va" }],
      max_price: 300000,
    })
    expect(vaRes.ok).toBe(true)
    const vaVariant = (qhd.variants ?? []).find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (v: any) => v.metadata?.specs?.fields?.panel === "va"
    )
    const ipsVariant = (qhd.variants ?? []).find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (v: any) => v.metadata?.specs?.fields?.panel === "ips"
    )
    const vaResults = resultsOf(vaRes).filter((r) => r.product_id === qhd.id)
    expect(vaResults.map((r) => r.variant_id)).toEqual([vaVariant.id])
    expect(
      vaResults.some((r) => r.variant_id === ipsVariant.id),
      "조건 불일치 IPS variant 노출"
    ).toBe(false)
  })

  test("unknown(null) 스펙은 eq·gte 조건에 매치되지 않는다", async () => {
    const res = await conditionSearch({
      region_id: regionId,
      category: "monitor",
      conditions: [{ field: "refresh_hz", operator: "gte", value: 60 }],
    })
    expect(res.ok).toBe(true)
    const productIds = new Set(
      resultsOf(res).map((r) => String(r.product_id))
    )
    // refresh_hz가 null(unknown)인 상품은 최소 60Hz라도 증명 불가 — 제외
    expect(productIds.has(uhd.id), "refresh_hz unknown UHD 노출").toBe(false)
    expect(productIds.has(limited.id), "refresh_hz unknown limited 노출").toBe(
      false
    )
  })

  test("max_price는 variant 계산가 상한으로 동작한다", async () => {
    const res = await conditionSearch({
      region_id: regionId,
      category: "monitor",
      conditions: [{ field: "inch", operator: "gte", value: 20 }],
      max_price: 400000,
    })
    expect(res.ok).toBe(true)
    const results = resultsOf(res)
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      const price = priceOf(r)
      expect(Number.isFinite(price), "결과에 계산가가 없다").toBe(true)
      expect(price).toBeLessThanOrEqual(400000)
    }
    // UHD(549,000원)는 상한 초과 — 제외
    expect(
      results.some((r) => r.product_id === uhd.id),
      "400,000 초과 UHD 노출"
    ).toBe(false)
    // QHD의 두 variant(319,000 / 289,000)는 둘 다 상한 이내
    expect(
      results.filter((r) => r.product_id === qhd.id).length
    ).toBe(2)
  })

  test("in_stock_only와 purchasable 표시는 품절 상품을 구분한다", async () => {
    const all = await conditionSearch({
      region_id: regionId,
      category: "keyboard",
    })
    expect(all.ok).toBe(true)
    const allResults = resultsOf(all)
    const retroEntry = allResults.find((r) => r.product_id === retro.id)
    // 품절 상품도 결과에 나올 수 있으나 purchasable=false로 표시돼야 한다
    if (retroEntry) {
      expect(
        purchasableOf(retroEntry),
        "품절 상품의 purchasable=false 표시가 없다"
      ).toBe(false)
    }

    const inStock = await conditionSearch({
      region_id: regionId,
      category: "keyboard",
      in_stock_only: true,
    })
    expect(inStock.ok).toBe(true)
    const inStockResults = resultsOf(inStock)
    expect(
      inStockResults.some((r) => r.product_id === retro.id),
      "in_stock_only인데 품절 상품 노출"
    ).toBe(false)
    for (const r of inStockResults) {
      expect(purchasableOf(r)).toBe(true)
    }
  })

  test("결과 항목은 머지된 specs·계산가·purchasable을 포함한다", async () => {
    const res = await conditionSearch({
      region_id: regionId,
      category: "monitor",
      conditions: [{ field: "panel", operator: "eq", value: "ips" }],
    })
    expect(res.ok).toBe(true)
    const ips = resultsOf(res).find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r) =>
        r.product_id === qhd.id &&
        (qhd.variants ?? []).find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (v: any) => v.id === r.variant_id
        )?.metadata?.specs?.fields?.panel === "ips"
    )
    expect(ips, "IPS variant 결과가 없다").toBeTruthy()
    // variant override(panel=ips) + 상품 기본값(inch=27) 머지 확인
    expect(specOf(ips, "panel")).toBe("ips")
    expect(specOf(ips, "inch")).toBe(27)
    expect(Number(priceOf(ips))).toBe(319000)
    expect(purchasableOf(ips)).toBe(true)
  })

  test("category에 없는 field와 잘못된 operator는 400으로 거부된다", async () => {
    const wrongField = await conditionSearch({
      region_id: regionId,
      category: "monitor",
      conditions: [{ field: "dpi", operator: "eq", value: 26000 }],
    })
    expect(wrongField.status).toBe(400)

    const wrongOp = await conditionSearch({
      region_id: regionId,
      category: "monitor",
      conditions: [{ field: "inch", operator: "between", value: [20, 30] }],
    })
    expect(wrongOp.status).toBe(400)

    const noRegion = await storeApi(SEARCH_PATH, {
      method: "POST",
      body: { conditions: [{ field: "inch", operator: "eq", value: 27 }] },
    })
    expect(noRegion.status).toBe(400)
  })
})

// ============================================================
// UI 흐름 — 02 구현의 공유 selector를 기다린다.
// 폼 위치는 02 확인 필요 — 우선 /store에서 찾고 없으면 실패로 보고한다.
// ============================================================
test.describe("조건 검색 UI 흐름", () => {
  const openSearchForm = async (
    page: import("@playwright/test").Page,
    countryCode: string
  ) => {
    await page.goto("/" + countryCode + "/store")
    const form = page.getByTestId("condition-search-form")
    await expect(
      form,
      "condition-search-form이 store에 없다 — 02 배치 위치 확인"
    ).toBeVisible()
    return form
  }

  test("폼: category 선택 시 조건 필드가 나타나고 max_price 기본값은 400000", async ({
    page,
  }) => {
    const errors = trackConsoleErrors(page)
    const cat = await discoverCatalog()
    const form = await openSearchForm(page, cat.countryCode)
    await expect(page.getByTestId("condition-max-price")).toHaveValue(
      "400000"
    )
    const before = await form.locator("input, select, textarea").count()
    await page.getByTestId("condition-category").selectOption("monitor")
    await expect
      .poll(
        async () => form.locator("input, select, textarea").count(),
        "category 선택 후 조건 필드가 나타나지 않았다"
      )
      .toBeGreaterThan(before)
    expect(errors).toEqual([])
  })

  test("조건 검색 결과에서 정확한 variant의 상세로 이동한다", async ({
    page,
  }) => {
    const errors = trackConsoleErrors(page)
    const cat = await discoverCatalog()
    const { product: qhd } = await fetchProduct(
      cat.region.id,
      "toss3days-monitor-27-qhd"
    )
    await openSearchForm(page, cat.countryCode)
    await page.getByTestId("condition-category").selectOption("monitor")
    await page.getByTestId("condition-max-price").fill("400000")
    await page.getByTestId("condition-search-submit").click()

    const results = page.getByTestId("condition-search-results")
    await expect(results).toBeVisible()
    const items = results.getByTestId("condition-search-result")
    await expect(items.first()).toBeVisible()
    const count = await items.count()
    expect(count).toBeGreaterThan(0)

    // 가격 null 결과 카드는 구매 가능을 주장하면 안 된다 (05 회귀, UI 수준).
    // 카드의 v_id를 카탈로그 variant와 대조해 null 가격 카드만 검사한다.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const variantPrice = new Map<string, any>()
    for (const p of cat.products as StoreProduct[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const v of (p.variants ?? []) as any[]) {
        variantPrice.set(v.id, v.calculated_price?.calculated_amount)
      }
    }
    const cardLinks = await items
      .locator('a[href*="v_id="]')
      .all()
    for (const link of cardLinks) {
      const href = await link.getAttribute("href")
      const vid = new URL(href!, e2eEnv.baseURL).searchParams.get("v_id")
      const amount = vid ? variantPrice.get(vid) : undefined
      if (amount == null) {
        const card = items.filter({ has: link }).first()
        await expect(card).not.toContainText(/구매 가능|담기|장바구니/)
      }
    }

    // 결과 카드는 선택 variant의 계산가를 표시한다 (VA 결과는 289,000)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const va = (qhd.variants ?? []).find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (v: any) => v.metadata?.specs?.fields?.panel === "va"
    )
    const vaResult = items.filter({
      has: page.locator('a[href*="v_id=' + va.id + '"]'),
    })
    await expect(
      vaResult.getByTestId("condition-search-item-price")
    ).toContainText(
      Number(va.calculated_price.calculated_amount).toLocaleString("ko-KR")
    )

    // 결과 링크는 상세로 가며 v_id로 정확한 variant를 지정한다 —
    // VA 결과 카드로 진입해 상세가 그 variant를 선택하는지 검증한다
    const target = vaResult.locator("a").first()
    const href = await target.getAttribute("href")
    expect(href).toContain("/products/toss3days-monitor-27-qhd")
    expect(href).toContain("v_id=" + va.id)

    await target.click()
    await page.waitForURL(/\/products\/toss3days-monitor-27-qhd/)
    expect(page.url()).toContain("v_id=" + va.id)
    const container = page.getByTestId("product-container")
    await expect(container.getByTestId("product-title")).toContainText(
      "27인치 QHD"
    )
    // 선택된 variant의 옵션·가격·머지 스펙이 상세에 반영된다
    const optionGroup = container.getByTestId("product-options")
    await expect(
      optionGroup.getByRole("button", { name: "VA", exact: true })
    ).toHaveClass(/border-ui-border-interactive/)
    await expect(
      container.getByTestId("product-price").first()
    ).toContainText(
      Number(va.calculated_price.calculated_amount).toLocaleString("ko-KR")
    )
    await expect(
      page.getByTestId("product-specs").locator('[data-spec-key="panel"]')
    ).toHaveText("VA")
    await expect(
      optionGroup.getByRole("button", { name: "IPS", exact: true })
    ).not.toHaveClass(/border-ui-border-interactive/)

    // 리뷰 요약 — stats API의 평균·수와 상세 표시가 일치한다
    const statsEntry = (await getReviewStatsBatch([qhd.id])).find(
      (s) => s.product_id === qhd.id
    )
    expect(statsEntry, "stats 응답에 해당 상품이 없다").toBeTruthy()
    const summaryBox = page.getByTestId("product-review-summary")
    if (statsEntry!.review_count > 0) {
      await expect(
        summaryBox.getByTestId("review-count")
      ).toContainText(String(statsEntry!.review_count))
      await expect(
        summaryBox.getByTestId("review-average")
      ).toHaveText(statsEntry!.average_rating!.toFixed(1))
    } else {
      await expect(page.getByTestId("review-empty")).toBeVisible()
    }
    await expect(page.getByTestId("review-list")).toBeVisible()
    expect(errors).toEqual([])
  })

  test("선택한 variant의 가격·스펙·평점이 비교표에 반영된다", async ({
    page,
  }) => {
    const errors = trackConsoleErrors(page)
    const cat = await discoverCatalog()
    const { product: qhd } = await fetchProduct(
      cat.region.id,
      "toss3days-monitor-27-qhd"
    )
    const { product: fhd } = await fetchProduct(
      cat.region.id,
      "toss3days-monitor-24-fhd"
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const va = (qhd.variants ?? []).find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (v: any) => v.metadata?.specs?.fields?.panel === "va"
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fhdVariant = (fhd.variants ?? [])[0] as any

    await openSearchForm(page, cat.countryCode)
    await page.getByTestId("condition-category").selectOption("monitor")
    await page.getByTestId("condition-search-submit").click()
    const items = page.getByTestId("condition-search-result")
    await expect(items.first()).toBeVisible()

    // 두 결과에서 compare-toggle — 선택한 variant가 tray에 유지된다
    const qhdResult = items.filter({
      has: page.locator('a[href*="' + va.id + '"]'),
    })
    const fhdResult = items.filter({
      has: page.locator('a[href*="' + fhdVariant.id + '"]'),
    })
    await qhdResult.getByTestId("compare-toggle").click()
    await fhdResult.getByTestId("compare-toggle").click()
    const tray = page.getByTestId("compare-tray")
    await expect(tray).toBeVisible()
    await expect(tray.getByTestId("compare-tray-count")).toContainText("2")
    await tray.getByTestId("compare-open").click()

    await page.waitForURL(/\/compare/)
    const url = new URL(page.url())
    // products와 variants는 같은 순서로 대응한다 (02 flow 계약)
    const productsParam = (url.searchParams.get("products") ?? "").split(",")
    const variantsParam = (url.searchParams.get("variants") ?? "").split(",")
    expect(productsParam).toContain("toss3days-monitor-27-qhd")
    expect(productsParam).toContain("toss3days-monitor-24-fhd")
    expect(productsParam.length).toBe(variantsParam.length)
    const qhdIndex = productsParam.indexOf("toss3days-monitor-27-qhd")
    const fhdIndex = productsParam.indexOf("toss3days-monitor-24-fhd")
    expect(variantsParam[qhdIndex]).toBe(va.id)
    expect(variantsParam[fhdIndex]).toBe(fhdVariant.id)

    const table = page.getByTestId("comparison-table")
    await expect(table).toBeVisible()
    // 선택 variant의 계산가·머지된 스펙이 비교표에 표시된다
    const qhdCol = table.getByTestId("comparison-price").filter({
      hasText: Number(
        va.calculated_price.calculated_amount
      ).toLocaleString("ko-KR"),
    })
    await expect(qhdCol).toBeVisible()
    await expect(
      table.locator('tr[data-spec-key="panel"]')
    ).toContainText("VA")
    // 가격이 있는 variant는 가용성 셀이 실제 재고 규칙을 표시한다
    // (구매 가능 또는 품절 — '가격 미확인'이 아니다)
    const availability = table.getByTestId("comparison-availability")
    const availabilityTexts = await availability.allTextContents()
    for (const t of availabilityTexts) {
      expect(t).not.toContain("가격 미확인")
    }
    // 리뷰 평점 — 비교 항목의 평점 행이 렌더된다 (0건이면 '후기 없음' 계열)
    await expect(
      table.locator('tr[data-spec-key="rating"], [data-testid="comparison-rating"]').first()
    ).toBeVisible()
    expect(errors).toEqual([])
  })

  test("가격이 없는 variant는 '가격 미확인'이며 '구매 가능'이 아니다 (05 회귀)", async ({
    page,
  }) => {
    const cat = await discoverCatalog()
    // 계산가가 null인 variant를 카탈로그에서 찾는다 — 없으면 fixture gap
    // 으로 실패해 SOL에 보고한다 (PASS 위장 금지).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidates: { product: any; variant: any }[] = []
    for (const p of cat.products as StoreProduct[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const v of (p.variants ?? []) as any[]) {
        if (v.calculated_price?.calculated_amount == null) {
          candidates.push({ product: p, variant: v })
        }
      }
    }
    if (candidates.length === 0) {
      throw new Error(
        "[E2E] calculated_price null인 variant가 카탈로그에 없다 — " +
          "05 회귀 검증용 fixture 필요 (SOL에 fixture gap 보고)"
      )
    }
    const { product: nullPrice, variant: nullVariant } = candidates[0]
    const { product: priced } = await fetchProduct(
      cat.region.id,
      "toss3days-monitor-24-fhd"
    )
    const errors = trackConsoleErrors(page)
    await page.goto(
      "/" +
        cat.countryCode +
        "/compare?products=" +
        nullPrice.handle +
        "," +
        priced.handle +
        "&variants=" +
        nullVariant.id +
        "," +
        priced.variants[0].id
    )
    const table = page.getByTestId("comparison-table")
    await expect(table).toBeVisible()
    const cells = table.getByTestId("comparison-availability")
    const texts = await cells.allTextContents()
    expect(texts.length).toBeGreaterThanOrEqual(2)
    // null 가격 셀 — '가격 미확인', '구매 가능' 금지
    expect(texts[0]).toContain("가격 미확인")
    expect(texts[0]).not.toContain("구매 가능")
    // 대조: 가격 있는 variant는 기존 재고 규칙(구매 가능/품절)을 표시한다
    expect(texts[1]).toMatch(/구매 가능|품절/)
    expect(errors).toEqual([])
  })

  test("결과에서 선택한 variant가 그대로 cart line이 된다", async ({
    page,
  }) => {
    const errors = trackConsoleErrors(page)
    const cat = await discoverCatalog()
    const { product: qhd } = await fetchProduct(
      cat.region.id,
      "toss3days-monitor-27-qhd"
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const va = (qhd.variants ?? []).find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (v: any) => v.metadata?.specs?.fields?.panel === "va"
    )

    // 직접 URL 진입이 아니라 실제 검색 결과 카드 클릭에서 시작한다
    await openSearchForm(page, cat.countryCode)
    await page.getByTestId("condition-category").selectOption("monitor")
    await page.getByTestId("condition-search-submit").click()
    const items = page.getByTestId("condition-search-result")
    await expect(items.first()).toBeVisible()
    const vaCard = items
      .filter({ has: page.locator('a[href*="v_id=' + va.id + '"]') })
      .first()
    await expect(vaCard, "VA variant 결과 카드가 없다").toBeVisible()
    await vaCard.locator("a").first().click()
    await page.waitForURL(/\/products\/toss3days-monitor-27-qhd/)
    expect(page.url()).toContain("v_id=" + va.id)

    const container = page.getByTestId("product-container")
    await expect(
      container.getByTestId("add-product-button")
    ).toBeEnabled()
    await container.getByTestId("add-product-button").click()

    // 서버 액션 완료를 카트 항목 수 폴링으로 기다린다
    await expect
      .poll(async () => {
        const cookies = await page.context().cookies()
        const cartId = cookies.find((c) => c.name === "_medusa_cart_id")?.value
        if (!cartId) {
          return 0
        }
        const res = await storeApi("/store/carts/" + cartId)
        return res.json?.cart?.items?.length ?? 0
      })
      .toBe(1)

    const cookies = await page.context().cookies()
    const cartId = cookies.find((c) => c.name === "_medusa_cart_id")!.value
    const cart = await storeApi("/store/carts/" + cartId)
    const line = cart.json?.cart?.items?.[0]
    // 검색 결과 variant가 cart line으로 정확히 전달된다
    expect(
      line?.variant_id ?? line?.variant?.id,
      "cart line이 선택한 VA variant가 아니다"
    ).toBe(va.id)
    expect(
      line?.product_id ?? line?.variant?.product_id,
      "cart line의 product_id가 결과 상품과 다르다"
    ).toBe(qhd.id)
    expect(
      line?.variant?.sku ?? line?.variant_sku,
      "cart line의 SKU가 결과 variant와 다르다"
    ).toBe(va.sku)
    // unit_price는 선택 variant의 계산가와 같아야 한다
    expect(Number(line?.unit_price)).toBe(
      Number(va.calculated_price.calculated_amount)
    )

    // 대조: 같은 조건의 condition-search 결과 가격과도 일치한다
    const res = await conditionSearch({
      region_id: cat.region.id,
      category: "monitor",
    })
    expect(res.ok).toBe(true)
    const vaResult = resultsOf(res).find((r) => r.variant_id === va.id)
    expect(vaResult, "검색 결과에 VA variant가 없다").toBeTruthy()
    expect(Number(line.unit_price)).toBe(priceOf(vaResult))
    expect(errors).toEqual([])
  })

  test("매치 없음은 empty 상태로 표시된다", async ({ page }) => {
    const cat = await discoverCatalog()
    await openSearchForm(page, cat.countryCode)
    await page.getByTestId("condition-category").selectOption("mouse")
    await page.getByTestId("condition-max-price").fill("10000")
    await page.getByTestId("condition-search-submit").click()
    await expect(page.getByTestId("condition-search-empty")).toBeVisible()
    await expect(
      page.getByTestId("condition-search-result")
    ).toHaveCount(0)
  })

  test("검색 API 실패는 error 상태로 표시된다", async ({ page }) => {
    const cat = await discoverCatalog()
    await page.route("**/store/product-condition-search*", async (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "QA isolated temporary outage" }),
      })
    )
    await openSearchForm(page, cat.countryCode)
    await page.getByTestId("condition-search-submit").click()
    await expect(page.getByTestId("condition-search-error")).toBeVisible()
  })
})
