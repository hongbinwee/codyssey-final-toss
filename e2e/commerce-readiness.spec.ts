import { expect, test } from "@playwright/test"
import {
  createOrderForCustomer,
  discoverCatalog,
  getOrderApi,
  registerCustomerApi,
} from "./utils/api"
import { TEST_PASSWORD, testEmail, trackConsoleErrors } from "./utils/helpers"
import {
  REVIEW_CONTRACT,
  assertReviewContract,
  assertReviewUiContract,
  assertSeedContract,
  assertVariantContract,
  createReturnApi,
  getPublicReviewStats,
  getReviewStatsBatch,
  importReviews,
  listPublicReviews,
  reviewItemsOf,
} from "./helpers/readiness"
import type { SyntheticReviewInput } from "./helpers/readiness"
import { storeApi } from "./utils/api"

// 이 스펙은 독립 실험 환경(backend 9002 / storefront 8002)에서만 실행한다.
// 공유 prod 9000/8000에는 write 테스트를 절대 실행하지 않는다.
// 실행 설정은 기존 E2E_BASE_URL/E2E_BACKEND_URL env를 사용한다 — config 변경 없음.
// Admin import fixture는 E2E_ADMIN_TOKEN(env만)이 필요하다.

// ============================================================
// 반품 API 권한 보호
// 설치 코어 확인: @medusajs/medusa@2.21.2 route.js는 의도적 비인증이고
// validator는 order_id·items·return_shipping(option_id)을 요구한다.
// 01이 프로젝트 middlewares로 인증+소유권+receive_now 제한을 추가한다.
// 확정 상태(SOL): 익명 401 / 타인 주문 404 / receive_now=true 400.
// ============================================================
test.describe("반품 API 권한 보호", () => {
  test.describe.configure({ mode: "serial" })

  let orderAId = ""
  let returnBody: Record<string, unknown> = {}
  let tokenA = ""
  let tokenB = ""

  test.beforeAll(async () => {
    const cat = await discoverCatalog()
    const variantId = cat.simple.variants[0].id
    const emailA = testEmail("ret-a")
    const a = await registerCustomerApi(emailA, TEST_PASSWORD, {
      first_name: "Return",
      last_name: "A",
    })
    tokenA = a.token
    const created = await createOrderForCustomer({
      token: tokenA,
      email: emailA,
      region: cat.region,
      countryCode: cat.countryCode,
      variantId,
    })
    orderAId = created.id
    const detail = await getOrderApi(
      orderAId,
      tokenA,
      "id,items.id,items.quantity"
    )
    expect(detail.ok, "픽스처 주문 조회 실패").toBe(true)
    const items = (detail.json?.order?.items ?? []).map(
      (item: { id: string }) => ({ id: item.id, quantity: 1 })
    )
    expect(items.length).toBeGreaterThan(0)
    // return_shipping은 코어 validator 필수 필드다. 독립 env에 반품 배송
    // 옵션이 있으면 env로 id를 제공한다 — 없으면 스키마 유효성 대조는
    // 해당 테스트가 자체적으로 보고한다.
    const returnShippingOptionId =
      process.env.E2E_RETURN_SHIPPING_OPTION_ID ?? ""
    returnBody = {
      order_id: orderAId,
      items,
      ...(returnShippingOptionId
        ? { return_shipping: { option_id: returnShippingOptionId } }
        : {}),
    }
    const b = await registerCustomerApi(testEmail("ret-b"), TEST_PASSWORD, {
      first_name: "Return",
      last_name: "B",
    })
    tokenB = b.token
  })

  test("익명 요청은 401 — 인증이 바디 검증보다 선행한다", async () => {
    // 의도적으로 형식이 불완전한 바디를 보낸다: 401이면 인증이
    // zod 검증보다 먼저 거부한 것이고, 400이면 인증 부재로 실패다.
    const res = await createReturnApi({ order_id: orderAId })
    expect(res.status).toBe(401)
    expect(res.json?.return).toBeUndefined()
  })

  test("고객B는 고객A의 order_id로 반품을 만들 수 없다 — 404", async () => {
    const res = await createReturnApi({ ...returnBody }, tokenB)
    // 주문 존재 유무를 노출하지 않는 기존 주문 상세 패턴과 동일하게 404다.
    expect(res.status).toBe(404)
    expect(res.json?.return).toBeUndefined()
  })

  test("receive_now=true는 400 — 즉시 수령 상태 변경을 거부한다", async () => {
    const denied = await createReturnApi(
      { ...returnBody, receive_now: true },
      tokenA
    )
    expect(denied.status).toBe(400)
    expect(denied.json?.return).toBeUndefined()

    // 대조: 같은 바디에서 receive_now만 빼면 정책 거부가 아니어야 한다.
    // return_shipping 옵션이 env로 제공된 경우에만 스키마가 완전히 유효해
    // 진정한 대조가 된다. 미제공이면 스키마 실패로 둘 다 400이 될 수 있어
    // 대조 불가를 결과로 첨부한다(통과로 위장하지 않는다).
    const control = await createReturnApi({ ...returnBody }, tokenA)
    if (process.env.E2E_RETURN_SHIPPING_OPTION_ID) {
      const sameFailure =
        control.status === denied.status &&
        JSON.stringify(control.json) === JSON.stringify(denied.json)
      expect(
        sameFailure,
        "receive_now 없이도 동일 실패 — 정책 거부가 아닐 수 있다"
      ).toBe(false)
    } else {
      await test.info().attach("receive-now-control", {
        body: JSON.stringify({
          skipped_contrast: true,
          reason: "E2E_RETURN_SHIPPING_OPTION_ID 미설정 — 대조 불가",
          control_status: control.status,
        }),
        contentType: "application/json",
      })
    }
  })

  test("인증 후에도 order_id 누락은 400 — validator 경계가 유지된다", async () => {
    const res = await createReturnApi({ items: returnBody.items }, tokenA)
    expect(res.status).toBe(400)
    expect(res.json?.return).toBeUndefined()
  })
})

// ============================================================
// 리뷰·평점 읽기 — SOL 확정 계약 (01 공식 Module)
// GET /store/products/:id/reviews?sort=&offset=&limit=&variant_id=
// GET /store/product-review-stats?product_ids=
// POST /admin/product-reviews/import (Admin only)
// 합성 fixture는 QA 전용 상품(E2E_FIXTURE_PRODUCT_A/B)에만 주입하고,
// main toss3days-* 상품은 실제 리뷰 0을 유지한다.
// ============================================================
test.describe("리뷰·평점", () => {
  const c = REVIEW_CONTRACT

  test("리뷰가 없는 main 상품: average=null, count=0, '후기 없음'", async ({
    page,
  }) => {
    const cat = await discoverCatalog()
    const product = cat.simple
    // 유효 상품의 리뷰 없음도 stats 항목으로 반환하는 계약이다
    const stats = await getPublicReviewStats(product.id)
    expect(stats.count).toBe(0)
    // 리뷰 없음을 0점으로 위장하지 않는다 — 평균은 null이어야 한다
    expect(stats.average).toBeNull()

    assertReviewUiContract()
    const errors = trackConsoleErrors(page)
    await page.goto("/" + cat.countryCode + "/products/" + product.handle)
    await expect(page.getByTestId(c.ui.emptyState)).toBeVisible()
    await expect(page.getByTestId(c.ui.item)).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test("유효하지 않은 product_id는 404", async () => {
    const res = await listPublicReviews("prod_00000000000000000000000000")
    expect(res.ok).toBe(false)
    expect(res.status).toBe(404)
  })

  test("공개 조회는 status 필터를 받지 않는다 — 400", async () => {
    // 공개 목록은 approved+displayable 고정 — status 파라미터는 400 기대(SOL)
    const cat = await discoverCatalog()
    const res = await storeApi(c.listPath.replace(":id", cat.simple.id), {
      query: { status: "pending" },
    })
    expect(res.status).toBe(400)
  })

  test.describe("synthetic fixture", () => {
    test.describe.configure({ mode: "serial" })

    const SEED_SOURCE = "synthetic"
    const SEED_REF = "qa-fixture"
    // approved+displayable 4건(별점 동률 4 포함), approved+미표시 1건,
    // pending 2건, flagged 1건을 A에. approved 1건을 B에.
    // variant 연결은 E2E_FIXTURE_VARIANT_A1이 있을 때만 심는다.
    const planA = [
      { tag: "a1", rating: 5, status: "approved", display: true, day: 10 },
      { tag: "a2", rating: 4, status: "approved", display: true, day: 9 },
      { tag: "a3", rating: 4, status: "approved", display: true, day: 8 },
      { tag: "a4", rating: 2, status: "approved", display: true, day: 7 },
      { tag: "a5", rating: 5, status: "approved", display: false, day: 6 },
      { tag: "a6", rating: 1, status: "pending", display: true, day: 5 },
      { tag: "a7", rating: 3, status: "pending", display: true, day: 4 },
      { tag: "a8", rating: 2, status: "flagged", display: true, day: 3 },
    ] as const
    const seedTitle = (tag: string) => "qa-fixture-" + tag
    let productA: { id: string; handle: string } | null = null
    let productB: { id: string; handle: string } | null = null
    let seeds: SyntheticReviewInput[] = []
    let expectedCount = 0
    let expectedAvg = 0
    let expectedTitlesNewestFirst: string[] = []

    const resolveProduct = async (key: string) => {
      const cat = await discoverCatalog()
      const found = (cat.products as { id?: string; handle?: string }[]).find(
        (p) => p.id === key || p.handle === key
      )
      if (!found?.id || !found.handle) {
        throw new Error("[E2E] fixture 상품이 카탈로그에 없다: " + key)
      }
      return { id: found.id, handle: found.handle }
    }

    test.beforeAll(async () => {
      assertReviewContract()
      assertSeedContract()
      productA = await resolveProduct(c.fixtureProductA)
      productB = await resolveProduct(c.fixtureProductB)

      const mk = (args: {
        product_id: string
        tag: string
        rating: number
        status: string
        displayable: boolean
        day: number
        variant_id?: string
      }): SyntheticReviewInput => ({
        product_id: args.product_id,
        variant_id: args.variant_id,
        external_review_id: "qa-" + args.tag,
        title: seedTitle(args.tag),
        body: "QA fixture review " + args.tag,
        rating: args.rating,
        written_at: new Date(Date.UTC(2026, 0, args.day)).toISOString(),
        source: SEED_SOURCE,
        source_ref: SEED_REF,
        is_synthetic: true,
        status: args.status,
        displayable: args.displayable,
      })

      seeds = [
        ...planA.map((s) =>
          mk({
            product_id: productA!.id,
            tag: s.tag,
            rating: s.rating,
            status: s.status,
            displayable: s.display,
            day: s.day,
          })
        ),
        mk({
          product_id: productB!.id,
          tag: "b1",
          rating: 3,
          status: "approved",
          displayable: true,
          day: 11,
        }),
        ...(c.fixtureVariantA1
          ? [
              mk({
                product_id: productA!.id,
                variant_id: c.fixtureVariantA1,
                tag: "a9v",
                rating: 5,
                status: "approved",
                displayable: true,
                day: 12,
              }),
            ]
          : []),
      ]

      // 한 번의 배치로 주입 — atomic validation 계약
      const res = await importReviews(seeds)
      expect(res.ok, "fixture import 실패: " + res.status).toBe(true)

      const visible = seeds.filter(
        (s) =>
          s.product_id === productA!.id &&
          s.status === c.approvedValue &&
          s.displayable
      )
      expectedCount = visible.length
      expectedAvg =
        visible.reduce((sum, s) => sum + s.rating, 0) /
        (visible.length || 1)
      expectedTitlesNewestFirst = [...visible]
        .sort(
          (x, y) =>
            new Date(y.written_at).getTime() - new Date(x.written_at).getTime()
        )
        .map((s) => s.title)
    })

    test("approved+displayable만 공개 — pending/flagged/미표시는 제외", async () => {
      const res = await listPublicReviews(productA!.id, { limit: c.maxLimit })
      expect(res.ok).toBe(true)
      const items = reviewItemsOf(res)
      expect(items.length).toBe(expectedCount)
      // pending·flagged·displayable:false fixture의 제목이 없어야 한다
      for (const tag of ["a5", "a6", "a7", "a8"]) {
        expect(
          items.some((i) => i[c.titleField] === seedTitle(tag)),
          "비공개 리뷰 노출: " + tag
        ).toBe(false)
      }
      // 응답의 count와 summary.review_count는 동일한 공개 범위다
      expect(res.json?.[c.countField]).toBe(expectedCount)
      expect(res.json?.summary?.review_count).toBe(expectedCount)
      expect(res.json?.summary?.average_rating).toBeCloseTo(expectedAvg, 5)
      // batch stats의 같은 상품 집계와 일치해야 한다
      const stats = await getPublicReviewStats(productA!.id)
      expect(stats.count).toBe(expectedCount)
      expect(stats.average).not.toBeNull()
      expect(stats.average!).toBeCloseTo(expectedAvg, 5)
    })

    test("리뷰는 정확한 product에 귀속되고 variant 연결이 보존된다", async () => {
      const resB = await listPublicReviews(productB!.id)
      expect(resB.ok).toBe(true)
      const itemsB = reviewItemsOf(resB)
      expect(itemsB.length).toBe(1)
      expect(itemsB[0]?.[c.productField]).toBe(productB!.id)
      for (const s of planA) {
        expect(
          itemsB.some((i) => i[c.titleField] === seedTitle(s.tag)),
          "타 상품 리뷰 노출: " + s.tag
        ).toBe(false)
      }

      assertVariantContract()
      // 상품 전체 조회는 모든 variant 리뷰를 포함한다
      const resA = await listPublicReviews(productA!.id, {
        limit: c.maxLimit,
      })
      const itemsA = reviewItemsOf(resA)
      const variantReview = itemsA.find(
        (i) => i[c.titleField] === seedTitle("a9v")
      )
      expect(variantReview, "variant 리뷰가 상품 목록에 없다").toBeTruthy()
      expect(variantReview![c.variantField]).toBe(c.fixtureVariantA1)
      // ?variant_id= 는 정확히 해당 variant 리뷰만 반환한다
      const resV = await listPublicReviews(productA!.id, {
        variantId: c.fixtureVariantA1,
      })
      expect(resV.ok).toBe(true)
      const itemsV = reviewItemsOf(resV)
      for (const item of itemsV) {
        expect(item[c.variantField]).toBe(c.fixtureVariantA1)
      }
      expect(itemsV.some((i) => i[c.titleField] === seedTitle("a9v"))).toBe(
        true
      )
      // 다른 product 소속 variant로는 조회할 수 없다 (400/404)
      const variantOfB = process.env.E2E_FIXTURE_VARIANT_B1
      if (variantOfB) {
        const resWrong = await listPublicReviews(productA!.id, {
          variantId: variantOfB,
        })
        expect(resWrong.ok).toBe(false)
        expect([400, 404]).toContain(resWrong.status)
      }
    })

    test("정렬: newest desc / rating desc·asc + 동률 결정적", async () => {
      const latest = await listPublicReviews(productA!.id, {
        sort: "latest",
        limit: c.maxLimit,
      })
      expect(latest.ok).toBe(true)
      const latestItems = reviewItemsOf(latest)
      expect(latestItems.length).toBe(expectedCount)
      // fixture의 written_at은 명시적이므로 정확한 순서를 단언한다
      const latestTitles = latestItems.map((i) => String(i[c.titleField]))
      expect(latestTitles).toEqual(expectedTitlesNewestFirst)

      const desc = await listPublicReviews(productA!.id, {
        sort: "rating",
        limit: c.maxLimit,
      })
      expect(desc.ok).toBe(true)
      const descItems = reviewItemsOf(desc)
      const ratings = descItems.map((i) => Number(i[c.ratingField]))
      for (let i = 1; i < ratings.length; i++) {
        expect(ratings[i]).toBeLessThanOrEqual(ratings[i - 1])
      }

      const asc = await listPublicReviews(productA!.id, {
        sort: "rating_asc",
        limit: c.maxLimit,
      })
      expect(asc.ok).toBe(true)
      const ascRatings = reviewItemsOf(asc).map((i) =>
        Number(i[c.ratingField])
      )
      for (let i = 1; i < ascRatings.length; i++) {
        expect(ascRatings[i]).toBeGreaterThanOrEqual(ascRatings[i - 1])
      }

      // 동률(4점 2건, 5점 2건) 순서가 결정적이어야 한다
      const desc2 = await listPublicReviews(productA!.id, {
        sort: "rating",
        limit: c.maxLimit,
      })
      expect(JSON.stringify(reviewItemsOf(desc2))).toBe(
        JSON.stringify(descItems)
      )
    })

    test("페이지네이션: 전 페이지 누적이 count와 정확히 일치", async () => {
      const limit = 2
      const collected: Record<string, unknown>[] = []
      let offset = 0
      let reportedTotal = -1
      for (let guard = 0; guard < 10; guard++) {
        const res = await listPublicReviews(productA!.id, {
          offset,
          limit,
        })
        expect(res.ok).toBe(true)
        const items = reviewItemsOf(res)
        if (reportedTotal === -1) {
          reportedTotal = Number(res.json?.[c.countField])
        }
        collected.push(...items)
        if (items.length < limit) {
          break
        }
        offset += limit
      }
      // 페이지 간 중복 없음, 전체 합계가 count와 정확히 일치한다
      const titles = collected.map((i) => String(i[c.titleField]))
      expect(new Set(titles).size).toBe(titles.length)
      expect(collected.length).toBe(expectedCount)
      expect(reportedTotal).toBe(expectedCount)

      // 범위 초과 — 빈 배열 또는 400을 허용하되 5xx·성공+데이터는 실패
      const out = await listPublicReviews(productA!.id, {
        offset: 9999,
        limit,
      })
      expect(out.status).toBeLessThan(500)
      if (out.ok) {
        expect(reviewItemsOf(out)).toHaveLength(0)
      } else {
        expect(out.status).toBe(400)
      }
    })

    test("합성 리뷰는 source/is_synthetic으로 구분되고 개인정보가 없다", async () => {
      const res = await listPublicReviews(productA!.id, { limit: c.maxLimit })
      expect(res.ok).toBe(true)
      const items = reviewItemsOf(res)
      expect(items.length).toBe(expectedCount)
      for (const item of items) {
        expect(item[c.sourceField]).toBe(SEED_SOURCE)
        expect(item[c.syntheticFlagField]).toBe(true)
      }
      // 공개 DTO에 ASIN·rights·개인정보 필드가 없어야 한다
      const serialized = JSON.stringify(items)
      expect(serialized).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+.[a-z]{2,}/i)
      const collectKeys = (value: unknown, acc: Set<string>): Set<string> => {
        if (Array.isArray(value)) {
          value.forEach((v) => collectKeys(v, acc))
        } else if (value && typeof value === "object") {
          for (const [k, v] of Object.entries(value)) {
            acc.add(k)
            collectKeys(v, acc)
          }
        }
        return acc
      }
      const keys = collectKeys(items, new Set())
      for (const key of keys) {
        expect(key).not.toMatch(/email|phone|customer_id|asin|rights/i)
      }
    })

    test("중복 import는 idempotent — unique(source, external_review_id)", async () => {
      const before = await listPublicReviews(productA!.id, {
        limit: c.maxLimit,
      })
      const dup = await importReviews([seeds[0]!])
      // 멱등: 성공 응답이어야 하며 신규 생성이 없어야 한다
      expect(dup.ok, "중복 import가 멱등이 아니다: " + dup.status).toBe(true)
      const after = await listPublicReviews(productA!.id, {
        limit: c.maxLimit,
      })
      expect(JSON.stringify(reviewItemsOf(after))).toBe(
        JSON.stringify(reviewItemsOf(before))
      )
    })

    test("미매핑 import는 거부되고 배치는 atomic이다", async () => {
      // 존재하지 않는 product_id — 명시적 거부
      const invalid = await importReviews([
        {
          product_id: "prod_00000000000000000000000000",
          external_review_id: "qa-invalid-1",
          title: "qa-invalid",
          body: "should be rejected",
          rating: 5,
          written_at: new Date(Date.UTC(2026, 0, 20)).toISOString(),
          source: SEED_SOURCE,
          source_ref: SEED_REF,
          is_synthetic: true,
          status: "approved",
          displayable: true,
        },
      ])
      expect(invalid.ok).toBe(false)
      expect([400, 404, 422]).toContain(invalid.status)

      // atomic: 유효+무효가 섞인 배치는 전체가 거부되어 유효 항목도 쓰이지 않는다
      const atomicBatch: SyntheticReviewInput[] = [
        {
          product_id: productB!.id,
          external_review_id: "qa-atomic-valid",
          title: seedTitle("atomic-valid"),
          body: "should not persist",
          rating: 4,
          written_at: new Date(Date.UTC(2026, 0, 21)).toISOString(),
          source: SEED_SOURCE,
          source_ref: SEED_REF,
          is_synthetic: true,
          status: "approved",
          displayable: true,
        },
        {
          product_id: "prod_00000000000000000000000000",
          external_review_id: "qa-atomic-invalid",
          title: seedTitle("atomic-invalid"),
          body: "rejects the batch",
          rating: 5,
          written_at: new Date(Date.UTC(2026, 0, 21)).toISOString(),
          source: SEED_SOURCE,
          source_ref: SEED_REF,
          is_synthetic: true,
          status: "approved",
          displayable: true,
        },
      ]
      const atomic = await importReviews(atomicBatch)
      expect(atomic.ok).toBe(false)
      const listB = await listPublicReviews(productB!.id)
      const itemsB = reviewItemsOf(listB)
      expect(
        itemsB.some((i) => i[c.titleField] === seedTitle("atomic-valid")),
        "atomic 배치의 유효 항목이 쓰였다 — atomic validation 위반"
      ).toBe(false)
    })

    test("상품 카드와 상세에 평점·리뷰 수·합성 표시가 나타난다", async ({
      page,
    }) => {
      assertReviewUiContract()
      const errors = trackConsoleErrors(page)
      const cat = await discoverCatalog()
      // 카드 — 목록에서 해당 상품에 평점 요약과 리뷰 수가 표시된다
      await page.goto("/" + cat.countryCode + "/store")
      const card = page
        .getByTestId("product-wrapper")
        .filter({
          has: page.locator(
            'a[href*="/products/' + productA!.handle + '"]'
          ),
        })
      const cardSummary = card.getByTestId(c.ui.cardSummary)
      await expect(cardSummary).toBeVisible()
      await expect(cardSummary).toContainText(String(expectedCount))
      // 상세 — 요약(평균·수)·목록·항목·합성 표시가 보인다
      await page.goto("/" + cat.countryCode + "/products/" + productA!.handle)
      await expect(page.getByTestId(c.ui.summary)).toBeVisible()
      await expect(page.getByTestId(c.ui.count)).toContainText(
        String(expectedCount)
      )
      await expect(page.getByTestId(c.ui.item)).toHaveCount(expectedCount)
      await expect(
        page
          .getByTestId(c.ui.item)
          .filter({ hasText: /synthetic|합성|샘플|테스트/i })
          .first()
      ).toBeVisible()
      // 정렬·다음 페이지 컨트롤이 계약에 있으면 존재를 확인한다
      await expect(page.getByTestId(c.ui.sortControl)).toBeVisible()
      if (expectedCount > 10) {
        await expect(page.getByTestId(c.ui.pageNext)).toBeVisible()
      }
      expect(errors).toEqual([])
    })

    test("batch stats는 상품별 전체 합계를 정확히 반환한다", async () => {
      const cat = await discoverCatalog()
      const stats = await getReviewStatsBatch([
        productA!.id,
        productB!.id,
        cat.simple.id,
      ])
      const a = stats.find((s) => s.product_id === productA!.id)
      const b = stats.find((s) => s.product_id === productB!.id)
      const empty = stats.find((s) => s.product_id === cat.simple.id)
      expect(a?.review_count).toBe(expectedCount)
      expect(a?.average_rating).toBeCloseTo(expectedAvg, 5)
      expect(b?.review_count).toBe(1)
      // 리뷰 없는 유효 상품은 기본 0을 미리 반환한다
      expect(empty).toBeTruthy()
      expect(empty!.review_count).toBe(0)
      expect(empty!.average_rating).toBeNull()
    })
  })
})
