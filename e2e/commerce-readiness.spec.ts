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
  assertSeedContract,
  assertReadinessEnvironment,
  assertVariantContract,
  createReturnApi,
  fixtureKey,
  getPublicReviewStats,
  getReviewStatsBatch,
  importReviews,
  listPublicReviews,
  reviewItemsOf,
} from "./helpers/readiness"
import type { SyntheticReviewInput } from "./helpers/readiness"
import { storeApi } from "./utils/api"
assertReadinessEnvironment()

// 이 스펙은 독립 실험 환경(backend 9002 / storefront 8002)에서만 실행한다.
// 공유 prod 9000/8000에는 write 테스트를 절대 실행하지 않는다.
// 실행 설정은 기존 E2E_BASE_URL/E2E_BACKEND_URL env를 사용한다 — config 변경 없음.
// Admin import fixture는 E2E_ADMIN_TOKEN(env만)이 필요하다.
//
// 프로젝트별 분리(SOL 지시): fixture 상품 handle과 external_review_id에
// project.name 접미사를 붙여 desktop/desktop-dark/mobile이 서로 누적
// 영향을 주지 않는다. 예: qa-fixture-a-desktop / qa-a1-desktop.

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
      process.env.E2E_RETURN_SHIPPING_OPTION_ID ?? "so_qa_unconfigured"
    returnBody = {
      order_id: orderAId,
      items,
      return_shipping: { option_id: returnShippingOptionId },
    }
    const b = await registerCustomerApi(testEmail("ret-b"), TEST_PASSWORD, {
      first_name: "Return",
      last_name: "B",
    })
    tokenB = b.token
  })

  test("익명 요청은 유효한 반품 바디로도 401", async () => {
    // Core schema runs before custom middleware in this installed version.
    // Use a valid shape to prove authentication, rather than validator order.
    const res = await createReturnApi({ ...returnBody })
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
    expect(denied.json?.message).toContain("cannot set receive_now")
    expect(denied.json?.return).toBeUndefined()

    // 대조: 같은 바디에서 receive_now만 빼면 정책 거부가 아니어야 한다.
    // return_shipping 옵션이 env로 제공된 경우에만 스키마가 완전히 유효해
    // 진정한 대조가 된다. 미제공이면 대조 불가를 첨부물로 보고한다.
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
// 합성 fixture는 프로젝트별 QA 전용 상품(<base>-<project>)에만
// Admin import로 주입하고, main toss3days-* 상품은 리뷰 0을 유지한다.
// ============================================================
test.describe("리뷰·평점", () => {
  const c = REVIEW_CONTRACT

  test("리뷰가 없는 main 상품: average=null, count=0, '후기 없음'", async ({
    page,
  }) => {
    const cat = await discoverCatalog()
    // SOL의 seed-review-test-fixtures가 앞 상품에 리뷰를 넣었다 —
    // review_count=0인 main toss3days-* 상품을 batch stats로 찾는다.
    // 전부 리뷰가 있으면 fixture 정책 위반으로 실패한다.
    const mains = (cat.products as { id: string; handle: string }[]).filter(
      (p) => p.handle.startsWith("toss3days-")
    )
    const statsList = await getReviewStatsBatch(mains.map((p) => p.id))
    const zeroEntry = statsList.find((s) => s.review_count === 0)
    if (!zeroEntry) {
      throw new Error(
        "[E2E] 리뷰 0인 main 상품이 없다 — main 상품의 실제 리뷰 0 유지 계약 확인"
      )
    }
    // 리뷰 없음을 0점으로 위장하지 않는다 — 평균은 null이어야 한다
    expect(zeroEntry.average_rating).toBeNull()
    const product = mains.find((p) => p.id === zeroEntry.product_id)!

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
    const res = await storeApi(
      c.listPath.replace(":id", cat.simple.id),
      { query: { status: "pending" } }
    )
    expect(res.status).toBe(400)
  })

  test.describe("synthetic fixture", () => {
    test.describe.configure({ mode: "serial" })

    const SEED_SOURCE = "synthetic"
    const SEED_REF = "https://example.invalid/qa-fixture"
    // 공개 대상 총 21건 — 상품 레벨 20건 + variant 연결 1건(아래 var1).
    // 명시 rating 배열(동률 다수 포함)과 작성일. 평균은 공개 21건으로 산출.
    const VISIBLE_RATINGS = [
      5, 4, 4, 3, 5, 2, 4, 3, 5, 1, 4, 3, 2, 5, 4, 3, 2, 4, 5, 3,
    ] as const
    // 비공개 추가분 — 집계에서 반드시 제외돼야 한다
    const HIDDEN_PLAN = [
      { tag: "hidden", rating: 5, status: "approved", display: false },
      { tag: "pend1", rating: 1, status: "pending", display: true },
      { tag: "pend2", rating: 3, status: "pending", display: true },
      { tag: "flag1", rating: 2, status: "flagged", display: true },
    ] as const
    const seedTitle = (tag: string) => "qa-fixture-" + tag
    let projectSuffix = ""
    let productA: { id: string; handle: string; variants: { id: string }[] } | null =
      null
    let productB: { id: string; handle: string; variants: { id: string }[] } | null =
      null
    let seeds: SyntheticReviewInput[] = []
    let expectedCount = 0
    let expectedAvg = 0
    let expectedTitlesNewestFirst: string[] = []
    let variantA1 = ""

    const resolveProduct = async (key: string) => {
      const cat = await discoverCatalog()
      const found = (
        cat.products as {
          id?: string
          handle?: string
          variants?: { id: string }[]
        }[]
      ).find((p) => p.id === key || p.handle === key)
      if (!found?.id || !found.handle) {
        throw new Error(
          "[E2E] fixture 상품이 카탈로그에 없다: " +
            key +
            " — SOL provision된 QA 상품 규약 확인"
        )
      }
      return {
        id: found.id,
        handle: found.handle,
        variants: (found.variants ?? []).map((v) => ({ id: v.id })),
      }
    }

    test.beforeAll(async ({}, testInfo) => {
      assertSeedContract()
      // 프로젝트별 fixture 분리 — 상품과 external_review_id 모두 구분한다
      projectSuffix = testInfo.project.name
      productA = await resolveProduct(
        fixtureKey(c.fixtureProductBaseA, projectSuffix)
      )
      productB = await resolveProduct(
        fixtureKey(c.fixtureProductBaseB, projectSuffix)
      )
      variantA1 = productA.variants[0]?.id ?? ""

      const extId = (tag: string) => "qa-" + tag + "-" + projectSuffix
      const mk = (args: {
        product_id: string
        tag: string
        rating: number
        status: string
        displayable: boolean
        day: number
        variant_id?: string
        source_ref?: string
      }): SyntheticReviewInput => ({
        product_id: args.product_id,
        variant_id: args.variant_id,
        external_review_id: extId(args.tag),
        title: seedTitle(args.tag) + "-" + projectSuffix,
        body: "QA fixture review " + args.tag,
        rating: args.rating,
        written_at: new Date(Date.UTC(2026, 0, args.day)).toISOString(),
        source: SEED_SOURCE,
        source_ref: args.source_ref ?? SEED_REF,
        is_synthetic: true,
        status: args.status,
        displayable: args.displayable,
      })

      seeds = [
        // A: 공개 21건 (day 21..1 — 인덱스 i가 클수록 과거)
        ...VISIBLE_RATINGS.map((rating, i) =>
          mk({
            product_id: productA!.id,
            tag: "v" + (i + 1),
            rating,
            status: "approved",
            displayable: true,
            day: VISIBLE_RATINGS.length - i,
          })
        ),
        mk({
          product_id: productA!.id,
          tag: "source-ref-query",
          rating: 4,
          status: "approved",
          displayable: true,
          day: VISIBLE_RATINGS.length + 1,
          source_ref:
            "https://example.invalid/qa-fixture?source_marker=qa-query-marker#qa-fragment-marker",
        }),
        // A: 비공개 대조군
        ...HIDDEN_PLAN.map((s, i) =>
          mk({
            product_id: productA!.id,
            tag: s.tag,
            rating: s.rating,
            status: s.status,
            displayable: s.display,
            day: i + 1,
          })
        ),
        // B: approved 1건 — 상품 간 근교 오염 검증용
        mk({
          product_id: productB!.id,
          tag: "b1",
          rating: 3,
          status: "approved",
          displayable: true,
          day: 25,
        }),
        // A: variant 연결 1건 — fixture 상품의 실제 첫 variant
        ...(variantA1
          ? [
              mk({
                product_id: productA!.id,
                variant_id: variantA1,
                tag: "var1",
                rating: 5,
                status: "approved",
                displayable: true,
                day: 26,
              }),
            ]
          : []),
      ]

      // 한 번의 배치로 주입 — atomic validation 계약. max 100 준수.
      const res = await importReviews(seeds)
      expect(res.ok, "fixture import 실패: " + res.status).toBe(true)

      const visible = seeds.filter(
        (s) =>
          s.product_id === productA!.id &&
          s.status === c.approvedValue &&
          s.displayable
      )
      expectedCount = visible.length
      expectedAvg = Math.round(
        (visible.reduce((sum, s) => sum + s.rating, 0) / (visible.length || 1)) * 100
      ) / 100
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
      for (const s of HIDDEN_PLAN) {
        expect(
          items.some((i) => i[c.titleField] === seedTitle(s.tag) + "-" + projectSuffix),
          "비공개 리뷰 노출: " + s.tag
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
      // A의 리뷰 제목이 B에 섞이지 않는다
      const titlesB = new Set(itemsB.map((i) => String(i[c.titleField])))
      for (const s of seeds.filter((x) => x.product_id === productA!.id)) {
        expect(titlesB.has(s.title), "타 상품 리뷰 노출: " + s.title).toBe(
          false
        )
      }

      assertVariantContract()
      if (!variantA1) {
        throw new Error(
          "[E2E] fixture 상품에 variant가 없다 — variant 귀속 검증 불가"
        )
      }
      // 상품 전체 조회는 variant 리뷰도 포함한다
      const resA = await listPublicReviews(productA!.id, {
        limit: c.maxLimit,
      })
      const itemsA = reviewItemsOf(resA)
      const variantReview = itemsA.find(
        (i) => i[c.titleField] === seedTitle("var1") + "-" + projectSuffix
      )
      expect(variantReview, "variant 리뷰가 상품 목록에 없다").toBeTruthy()
      expect(variantReview![c.variantField]).toBe(variantA1)
      // ?variant_id= 는 정확히 해당 variant 리뷰만 반환한다
      const resV = await listPublicReviews(productA!.id, {
        variantId: variantA1,
      })
      expect(resV.ok).toBe(true)
      const itemsV = reviewItemsOf(resV)
      for (const item of itemsV) {
        expect(item[c.variantField]).toBe(variantA1)
      }
      expect(
        itemsV.some(
          (i) => i[c.titleField] === seedTitle("var1") + "-" + projectSuffix
        )
      ).toBe(true)
      // 다른 product 소속 variant로는 조회할 수 없다 (400/404)
      const variantOfB = productB!.variants[0]?.id
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

      // 동률이 다수 있으므로 순서가 결정적이어야 한다 — 같은 요청을
      // 두 번 보내 동일 순서를 단언한다.
      const desc2 = await listPublicReviews(productA!.id, {
        sort: "rating",
        limit: c.maxLimit,
      })
      expect(JSON.stringify(reviewItemsOf(desc2))).toBe(
        JSON.stringify(descItems)
      )
    })

    test("페이지네이션: 전 페이지 누적이 count와 정확히 일치", async () => {
      const limit = 10 // 기본 페이지 크기 — 21건은 3페이지(10+10+1)가 된다
      const collected: Record<string, unknown>[] = []
      let offset = 0
      let reportedTotal = -1
      for (let guard = 0; guard < 10; guard++) {
        const res = await listPublicReviews(productA!.id, { offset, limit })
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

      // 현재 공개 계약의 최대 offset은 10000이다.
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
      const excessive = await listPublicReviews(productA!.id, {
        offset: 10001,
        limit,
      })
      expect(excessive.status).toBe(400)
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
      const sourceRefReview = items.find(
        (item) =>
          item[c.titleField] ===
          seedTitle("source-ref-query") + "-" + projectSuffix
      )
      expect(sourceRefReview?.source_ref).toBe(SEED_REF)
      expect(JSON.stringify(sourceRefReview)).not.toContain("qa-query-marker")
      expect(JSON.stringify(sourceRefReview)).not.toContain("qa-fragment-marker")
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
      // 전체 배치 재주입 — 단건이 아니라 21건+ 대상으로도 멱등이어야 한다
      const dup = await importReviews(seeds)
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
          external_review_id: "qa-invalid-1-" + projectSuffix,
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
          external_review_id: "qa-atomic-valid-" + projectSuffix,
          title: seedTitle("atomic-valid") + "-" + projectSuffix,
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
          external_review_id: "qa-atomic-invalid-" + projectSuffix,
          title: seedTitle("atomic-invalid") + "-" + projectSuffix,
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
        itemsB.some(
          (i) =>
            i[c.titleField] === seedTitle("atomic-valid") + "-" + projectSuffix
        ),
        "atomic 배치의 유효 항목이 쓰였다 — atomic validation 위반"
      ).toBe(false)
    })

    test("상품 카드와 상세에 평점·리뷰 수·합성 표시가 나타난다", async ({
      page,
    }) => {
      const errors = trackConsoleErrors(page)
      const cat = await discoverCatalog()
      // 카드 — 목록에서 해당 상품에 평점 요약과 리뷰 수가 표시된다
      await page.goto("/" + cat.countryCode + "/store")
      await page.getByTestId("store-search-input").fill("QA 합성 리뷰 상품 " + productA!.handle)
      const card = page.locator('a[href*="/products/' + productA!.handle + '"]').filter({ has: page.getByTestId("product-wrapper") })
      const cardSummary = card.getByTestId(c.ui.summary)
      await expect(cardSummary).toBeVisible()
      await expect(cardSummary.getByTestId(c.ui.average)).toHaveText(
        expectedAvg.toFixed(1)
      )
      await expect(cardSummary.getByTestId(c.ui.count)).toHaveText(
        `(${expectedCount})`
      )
      // 상세 — 요약(평균·수)·목록·항목·합성 표시가 보인다
      await page.goto("/" + cat.countryCode + "/products/" + productA!.handle)
      const detailReviews = page.locator('section[aria-labelledby="product-reviews-heading"]')
      await expect(detailReviews.getByTestId(c.ui.summary)).toBeVisible()
      await expect(detailReviews.getByTestId(c.ui.count)).toContainText(
        String(expectedCount)
      )
      await expect(detailReviews.getByTestId(c.ui.average)).toHaveText(expectedAvg.toFixed(1))
      // 첫 페이지는 최신순 기본 — 첫 항목은 가장 최근 written_at의 제목이다
      const firstItems = page.getByTestId(c.ui.item)
      await expect(firstItems.first()).toBeVisible()
      const firstCount = await firstItems.count()
      expect(firstCount).toBeGreaterThan(0)
      expect(firstCount).toBeLessThanOrEqual(expectedCount)
      await expect(firstItems.first()).toContainText(
        expectedTitlesNewestFirst[0]!
      )
      // 합성 라벨 표시
      await expect(
        firstItems
          .filter({ hasText: /synthetic|합성|샘플|테스트/i })
          .first()
      ).toBeVisible()
      await expect(page.getByTestId(c.ui.sortControl)).toBeVisible()
      await page.getByTestId(c.ui.sortControl).selectOption("rating_asc")
      await expect(firstItems.first()).toContainText("1점")
      expect(errors).toEqual([])
    })

    test("리뷰 UI 페이지네이션: 다음 버튼 → 새 목록 → 이전 페이지 복귀", async ({
      page,
    }) => {
      const errors = trackConsoleErrors(page)
      const cat = await discoverCatalog()
      await page.goto("/" + cat.countryCode + "/products/" + productA!.handle)
      const items = page.getByTestId(c.ui.item)
      await expect(items.first()).toBeVisible()

      // 첫 페이지 1번 항목과 기대 최신순 첫 제목을 기록한다
      const firstPageFirstTitle = (
        await items.first().textContent()
      )?.trim()
      expect(firstPageFirstTitle).toBeTruthy()
      const firstPageTitles = await items.allTextContents()
      const urlBefore = page.url()

      // 실제 다음 페이지 버튼 클릭 → 목록이 바뀌어야 한다
      const next = page.getByTestId(c.ui.pageNext)
      await expect(next).toBeVisible()
      await next.click()
      // 목록 갱신을 폴링으로 기다린다 — 클릭 직후 읽으면 이전 목록을
      // 캡처할 수 있다.
      await expect
        .poll(async () => (await items.first().textContent())?.trim(), {
          message: "다음 페이지로 목록이 갱신되지 않았다",
        })
        .not.toBe(firstPageFirstTitle)
      const secondPageTitles = await items.allTextContents()
      expect(
        JSON.stringify(secondPageTitles) !==
          JSON.stringify(firstPageTitles),
        "다음 페이지 클릭 후 목록이 변하지 않았다"
      ).toBe(true)
      // 2페이지 항목은 1페이지와 겹치지 않는다
      const overlap = secondPageTitles.filter((t) =>
        firstPageTitles.includes(t)
      )
      expect(overlap, "페이지 간 항목 중복").toEqual([])

      // 이전 페이지 복귀 — URL 기반 페이징이면 브라우저 뒤로 가기,
      // 클라이언트 페이징이면 계약에 이전 컨트롤이 없으므로 결과를 첨부한다
      if (page.url() !== urlBefore) {
        await page.goBack()
        await expect
          .poll(async () => (await items.first().textContent())?.trim(), {
            message: "이전 페이지 복귀 후 첫 항목이 복원되지 않았다",
          })
          .toBe(firstPageFirstTitle)
        const restored = await items.allTextContents()
        expect(
          JSON.stringify(restored),
          "이전 페이지 복귀 후 첫 페이지 목록이 복원되지 않았다"
        ).toBe(JSON.stringify(firstPageTitles))
      } else {
        await page.getByRole("navigation", { name: "후기 페이지" }).getByRole("button", { name: "이전", exact: true }).click()
        await expect.poll(async () => (await items.first().textContent())?.trim()).toBe(firstPageFirstTitle)
        expect(await items.allTextContents()).toEqual(firstPageTitles)
      }
      expect(errors).toEqual([])
    })

    test("batch stats는 상품별 전체 합계를 정확히 반환한다", async () => {
      const cat = await discoverCatalog()
      const mains = (cat.products as { id: string; handle: string }[])
        .filter((p) => p.handle.startsWith("toss3days-"))
        .map((p) => p.id)
      const stats = await getReviewStatsBatch([
        productA!.id,
        productB!.id,
        ...mains,
      ])
      const a = stats.find((s) => s.product_id === productA!.id)
      const b = stats.find((s) => s.product_id === productB!.id)
      expect(a?.review_count).toBe(expectedCount)
      expect(a?.average_rating).toBeCloseTo(expectedAvg, 5)
      expect(b?.review_count).toBe(1)
      // 유효 상품은 리뷰 없어도 stats 항목을 미리 반환한다
      for (const id of mains) {
        expect(
          stats.some((s) => s.product_id === id),
          "stats 항목 누락: " + id
        ).toBe(true)
      }
      // seed-review-test-fixtures가 앞 상품에 리뷰를 넣었으므로
      // 리뷰 0인 main 상품이 반드시 남아 있고 avg는 null이다
      const empties = stats.filter(
        (s) => mains.includes(s.product_id) && s.review_count === 0
      )
      expect(empties.length).toBeGreaterThan(0)
      for (const e of empties) {
        expect(e.average_rating).toBeNull()
      }
    })
  })
})
