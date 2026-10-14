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
  assertVariantContract,
  createReturnApi,
  getPublicReviewStats,
  listPublicReviews,
  reviewItemsOf,
  seedSyntheticReview,
} from "./helpers/readiness"

// 이 스펙은 독립 실험 환경(backend 9002 / storefront 8002)에서만 실행한다.
// 공유 prod 9000/8000에는 write 테스트를 절대 실행하지 않는다.
// 실행 설정은 기존 E2E_BASE_URL/E2E_BACKEND_URL env를 사용한다 — config 변경 없음.

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
      // receive_now 거부와 스키마/워크플로 오류를 구분한다:
      // control이 denied와 동일한 오류면 receive_now 특정 거부가 아니다.
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
// 리뷰·평점 읽기
// REVIEW_CONTRACT 빈 값은 계약 미확정 가드로 동작한다 — SOL이
// API/type 계약을 전달하면 helpers/readiness.ts의 상수만 채운다.
// 합성 fixture는 QA 전용 상품에만 Admin import로 주입하고,
// main toss3days-* 상품은 실제 리뷰 0을 유지한다.
// ============================================================
test.describe("리뷰·평점", () => {
  test("리뷰가 없는 main 상품: average=null, count=0, '후기 없음'", async ({
    page,
  }) => {
    assertReviewContract()
    const cat = await discoverCatalog()
    const product = cat.simple
    const stats = await getPublicReviewStats(product.id)
    expect(stats.count).toBe(0)
    // 리뷰 없음을 0점으로 위장하지 않는다 — 평균은 null이어야 한다.
    expect(stats.average).toBeNull()

    assertReviewUiContract()
    const errors = trackConsoleErrors(page)
    await page.goto("/" + cat.countryCode + "/products/" + product.handle)
    await expect(
      page.getByTestId(REVIEW_CONTRACT.ui.emptyState)
    ).toBeVisible()
    await expect(
      page.getByTestId(REVIEW_CONTRACT.ui.item)
    ).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test("유효하지 않은 product_id는 404", async () => {
    assertReviewContract()
    const res = await listPublicReviews("prod_00000000000000000000000000")
    expect(res.ok).toBe(false)
    expect(res.status).toBe(404)
  })

  test.describe("synthetic fixture", () => {
    test.describe.configure({ mode: "serial" })

    const c = REVIEW_CONTRACT
    const SEED_SOURCE = "qa-synthetic"
    // approved 4건(별점 동률 포함) + pending 2건을 A에, approved 1건을 B에.
    const seedPlanA = [
      { rating: 5, status: "approved", tag: "a1", day: 10 },
      { rating: 4, status: "approved", tag: "a2", day: 9 },
      { rating: 4, status: "approved", tag: "a3", day: 8 },
      { rating: 2, status: "approved", tag: "a4", day: 7 },
      { rating: 1, status: "pending", tag: "a5", day: 6 },
      { rating: 3, status: "pending", tag: "a6", day: 5 },
    ] as const
    const seedTitle = (tag: string) => "qa-fixture-" + tag
    let productA: { id: string; handle: string } | null = null
    let productB: { id: string; handle: string } | null = null
    let expectedCount = 0
    let expectedAvg = 0

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
      productA = await resolveProduct(c.fixtureProductA)
      productB = await resolveProduct(c.fixtureProductB)

      const seeds = [
        ...seedPlanA.map((s) => ({
          product_id: productA!.id,
          rating: s.rating,
          title: seedTitle(s.tag),
          body: "QA fixture review " + s.tag,
          status: s.status === "approved" ? c.approvedValue : c.pendingValue,
          source: SEED_SOURCE,
          external_id: "qa-" + s.tag,
          created_at: new Date(Date.UTC(2026, 0, s.day)).toISOString(),
        })),
        {
          product_id: productB!.id,
          rating: 3,
          title: seedTitle("b1"),
          body: "QA fixture review b1",
          status: c.approvedValue,
          source: SEED_SOURCE,
          external_id: "qa-b1",
          created_at: new Date(Date.UTC(2026, 0, 11)).toISOString(),
        },
        // variant 연결은 계약이 지원할 때만 심는다 — 없으면 전용 가드가
        // 매핑 테스트를 계약 공백 오류로 실패시킨다.
        ...(c.variantField && c.fixtureVariantA1
          ? [
              {
                product_id: productA!.id,
                variant_id: c.fixtureVariantA1,
                rating: 5,
                title: seedTitle("a7v"),
                body: "QA fixture review a7v",
                status: c.approvedValue,
                source: SEED_SOURCE,
                external_id: "qa-a7v",
                created_at: new Date(Date.UTC(2026, 0, 12)).toISOString(),
              },
            ]
          : []),
      ]
      for (const seed of seeds) {
        const res = await seedSyntheticReview(seed)
        expect(
          res.ok,
          "fixture 주입 실패 " + seed.external_id + ": " + res.status
        ).toBe(true)
      }

      const approvedOnA = seeds.filter(
        (s) => s.product_id === productA!.id && s.status === c.approvedValue
      )
      expectedCount = approvedOnA.length
      expectedAvg =
        approvedOnA.reduce((sum, s) => sum + s.rating, 0) /
        (approvedOnA.length || 1)
    })

    test("approved만 공개 집계 — pending은 목록·통계에 모두 제외", async () => {
      const res = await listPublicReviews(productA!.id, { limit: 50 })
      expect(res.ok).toBe(true)
      const items = reviewItemsOf(res)
      expect(items.length).toBe(expectedCount)
      // pending fixture의 제목이 공개 목록에 없어야 한다
      for (const tag of ["a5", "a6"]) {
        expect(
          items.some((i) => i[c.titleField] === seedTitle(tag)),
          "pending 리뷰 노출: " + tag
        ).toBe(false)
      }
      // 목록에 status 필드가 있으면 전부 approved여야 한다
      for (const item of items) {
        if (c.statusField && c.statusField in item) {
          expect(item[c.statusField]).toBe(c.approvedValue)
        }
      }
      // 목록·통계 두 소스의 count/avg가 일치해야 한다
      const stats = await getPublicReviewStats(productA!.id)
      expect(stats.count).toBe(expectedCount)
      expect(stats.average).not.toBeNull()
      expect(stats.average!).toBeCloseTo(expectedAvg, 5)
      // 목록에서 재계산한 평균과도 일치해야 한다
      const listedAvg =
        items
          .map((i) => i[c.ratingField])
          .filter((v): v is number => typeof v === "number")
          .reduce((a, b, _, arr) => a + b / arr.length, 0)
      expect(listedAvg).toBeCloseTo(expectedAvg, 5)
    })

    test("리뷰는 정확한 product에 귀속되고 variant 연결이 보존된다", async () => {
      const resB = await listPublicReviews(productB!.id)
      expect(resB.ok).toBe(true)
      const itemsB = reviewItemsOf(resB)
      expect(itemsB.length).toBe(1)
      expect(itemsB[0]?.[c.productField]).toBe(productB!.id)
      // A의 리뷰 제목이 B에 섞이지 않는다
      for (const s of seedPlanA) {
        expect(
          itemsB.some((i) => i[c.titleField] === seedTitle(s.tag)),
          "타 상품 리뷰 노출: " + s.tag
        ).toBe(false)
      }

      // variant 연결 — 계약에 variant 필드가 없으면 전용 가드가 실패시킨다
      assertVariantContract()
      const resA = await listPublicReviews(productA!.id, { limit: 50 })
      const itemsA = reviewItemsOf(resA)
      const variantReview = itemsA.find(
        (i) => i[c.titleField] === seedTitle("a7v")
      )
      expect(variantReview, "variant 리뷰가 공개 목록에 없다").toBeTruthy()
      expect(variantReview![c.variantField]).toBe(c.fixtureVariantA1)
      // 다른 리뷰가 variant로 오인되지 않는다
      const nonVariant = itemsA.filter(
        (i) => i[c.titleField] !== seedTitle("a7v")
      )
      for (const item of nonVariant) {
        expect(item[c.variantField]).not.toBe(c.fixtureVariantA1)
      }
    })

    test("정렬: 최신순 desc / 별점순 desc + 동률 결정적", async () => {
      const latest = await listPublicReviews(productA!.id, {
        sort: "latest",
        limit: 50,
      })
      expect(latest.ok).toBe(true)
      const latestItems = reviewItemsOf(latest)
      expect(latestItems.length).toBe(expectedCount)
      const createdTimes = latestItems.map((i) =>
        new Date(String(i[c.createdField])).getTime()
      )
      for (let i = 1; i < createdTimes.length; i++) {
        expect(createdTimes[i]).toBeLessThanOrEqual(createdTimes[i - 1])
      }

      const byRating = await listPublicReviews(productA!.id, {
        sort: "rating",
        limit: 50,
      })
      expect(byRating.ok).toBe(true)
      const ratingItems = reviewItemsOf(byRating)
      const ratings = ratingItems.map((i) => Number(i[c.ratingField]))
      for (let i = 1; i < ratings.length; i++) {
        expect(ratings[i]).toBeLessThanOrEqual(ratings[i - 1])
      }
      // 동률(4점 2건)이 있으므로 순서가 결정적이어야 한다 — 같은 요청을
      // 두 번 보내 동일 순서를 단언한다.
      const byRating2 = await listPublicReviews(productA!.id, {
        sort: "rating",
        limit: 50,
      })
      expect(JSON.stringify(reviewItemsOf(byRating2))).toBe(
        JSON.stringify(ratingItems)
      )
    })

    test("페이지네이션: 중복 없음·합계 일치·범위 초과는 빈 결과", async () => {
      const page1 = await listPublicReviews(productA!.id, {
        page: 1,
        limit: 2,
      })
      const page2 = await listPublicReviews(productA!.id, {
        page: 2,
        limit: 2,
      })
      expect(page1.ok && page2.ok).toBe(true)
      const ids = (res: typeof page1) =>
        reviewItemsOf(res).map((i) => String(i[c.titleField]))
      const union = [...ids(page1), ...ids(page2)]
      expect(new Set(union).size).toBe(union.length) // 페이지 간 중복 없음
      expect(union.length).toBe(Math.min(expectedCount, 4))
      const total = Number(page1.json?.[c.countField] ?? union.length)
      expect(total).toBe(expectedCount)

      // 범위 초과 — 빈 배열 또는 400을 허용하되 5xx·성공+데이터는 실패
      const out = await listPublicReviews(productA!.id, {
        page: 999,
        limit: 2,
      })
      expect(out.status).toBeLessThan(500)
      if (out.ok) {
        expect(reviewItemsOf(out)).toHaveLength(0)
      } else {
        expect(out.status).toBe(400)
      }
    })

    test("합성 리뷰는 출처로 구분되고 고객 개인정보가 없다", async () => {
      const res = await listPublicReviews(productA!.id, { limit: 50 })
      expect(res.ok).toBe(true)
      const items = reviewItemsOf(res)
      expect(items.length).toBe(expectedCount)
      for (const item of items) {
        expect(item[c.sourceField]).toBe(SEED_SOURCE)
      }
      // 공개 응답에 고객 식별 필드·이메일/전화 패턴이 없어야 한다
      const serialized = JSON.stringify(items)
      expect(serialized).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)
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
        expect(key).not.toMatch(/email|phone|customer_id/i)
      }
    })

    test("상품 카드와 상세에 평균 별점·리뷰 수·합성 표시가 나타난다", async ({
      page,
    }) => {
      assertReviewUiContract()
      const errors = trackConsoleErrors(page)
      const cat = await discoverCatalog()
      // 카드 — 목록에서 해당 상품 카드에 별점과 리뷰 수가 표시된다
      await page.goto("/" + cat.countryCode + "/store")
      const card = page
        .getByTestId("product-wrapper")
        .filter({
          has: page.locator(
            'a[href*="/products/' + productA!.handle + '"]'
          ),
        })
      await expect(card.getByTestId(c.ui.cardStars)).toBeVisible()
      await expect(card.getByTestId(c.ui.cardCount)).toContainText(
        String(expectedCount)
      )
      // 상세 — 리뷰 영역에 승인된 항목이 표시되고 합성 라벨이 붙는다
      await page.goto("/" + cat.countryCode + "/products/" + productA!.handle)
      await expect(page.getByTestId(c.ui.section)).toBeVisible()
      await expect(page.getByTestId(c.ui.item)).toHaveCount(expectedCount)
      await expect(
        page.getByTestId(c.ui.syntheticLabel).first()
      ).toBeVisible()
      // 별점순 정렬 컨트롤이 계약에 있으면 존재를 확인한다
      if (c.ui.sortControl) {
        await expect(page.getByTestId(c.ui.sortControl)).toBeVisible()
      }
      expect(errors).toEqual([])
    })
  })
})
