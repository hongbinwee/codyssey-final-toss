import { expect, test } from "@playwright/test"
import {
  cartItemCount,
  discoverCatalog,
  getOrderApi,
  storeApi,
} from "./utils/api"
import {
  TEST_PASSWORD,
  amountOf,
  koreanAddress,
  testEmail,
  trackConsoleErrors,
} from "./utils/helpers"
import { e2eEnv } from "./utils/env"

// 구매 → 주문 → 내역이 하나의 주문 상태를 공유하므로 직렬 실행한다.
test.describe.configure({ mode: "serial" })
test.describe("체크아웃 및 주문", () => {
  let orderId = ""
  let displayId = ""
  let buyerEmail = ""
  let orderTotal = NaN

  test("고객A 회원가입 후 모의 결제(pp_system_default)로 실제 주문 생성", async ({
    page,
  }) => {
    const errors = trackConsoleErrors(page)
    const cat = await discoverCatalog()
    const product = cat.simple
    buyerEmail = testEmail("buyer")
    const address = koreanAddress(cat.countryCode)

    // 1) 회원가입 (UI)
    await page.goto("/" + cat.countryCode + "/account")
    await expect(page.getByTestId("login-page")).toBeVisible()
    await page.getByTestId("register-button").click()
    await expect(page.getByTestId("register-page")).toBeVisible()
    await page.getByTestId("first-name-input").fill(address.first_name)
    await page.getByTestId("last-name-input").fill(address.last_name)
    await page.getByTestId("email-input").fill(buyerEmail)
    await page.getByTestId("phone-input").fill(address.phone)
    await page.getByTestId("password-input").fill(TEST_PASSWORD)
    await page.getByTestId("register-button").click()
    await expect(page.getByTestId("account-page")).toBeVisible()
    await expect(page.getByTestId("customer-email")).toContainText(buyerEmail)

    // 2) 상품 담기 — 서버 액션 완료(카트 쿠키+API 항목)까지 기다린 뒤 이동
    await page.goto("/" + cat.countryCode + "/products/" + product.handle)
    const optionGroups = page.getByTestId("product-options")
    const groupCount = await optionGroups.count()
    for (let i = 0; i < groupCount; i++) {
      const buttons = optionGroups.nth(i).getByTestId("option-button")
      if ((await buttons.count()) > 0) {
        await buttons.first().click()
      }
    }
    await page.getByTestId("add-product-button").click()
    await expect.poll(() => cartItemCount(page)).toBe(1)

    await page.goto("/" + cat.countryCode + "/cart")
    await expect(page.getByTestId("cart-container")).toBeVisible()
    await page.getByTestId("checkout-button").click()
    await page.waitForURL("**/checkout**")

    // 3) 배송지 입력
    await expect(page.getByTestId("shipping-first-name-input")).toBeVisible()
    await page.getByTestId("shipping-first-name-input").fill(address.first_name)
    await page.getByTestId("shipping-last-name-input").fill(address.last_name)
    await page.getByTestId("shipping-address-input").fill(address.address_1)
    await page
      .getByTestId("shipping-postal-code-input")
      .fill(address.postal_code)
    await page.getByTestId("shipping-city-input").fill(address.city)
    await page.getByTestId("shipping-phone-input").fill(address.phone)
    const emailInput = page.getByTestId("shipping-email-input")
    if (!(await emailInput.inputValue())) {
      await emailInput.fill(buyerEmail)
    }
    const countrySelect = page.getByTestId("shipping-country-select")
    const countryValues = await countrySelect
      .locator("option")
      .evaluateAll((els) => els.map((o) => o.getAttribute("value") ?? ""))
    // 리전 국가(kr)가 아닌 선택지로 억지 결제하지 않는다 — 없으면 실패시킨다
    const country = countryValues.find(
      (v) => v.toLowerCase() === cat.countryCode
    )
    if (!country) {
      throw new Error("[E2E] 배송 국가 선택지에 없는 리전 국가: " + cat.countryCode + " / 옵션: " + countryValues.join(","))
    }
    await countrySelect.selectOption(country)
    await page.getByTestId("submit-address-button").click()
    await page.waitForURL(/step=delivery/)

    // 4) 배송 방법
    const deliveryOption = page.getByTestId("delivery-option-radio").first()
    await expect(deliveryOption).toBeVisible()
    await deliveryOption.click()
    await page.getByTestId("submit-delivery-option-button").click()
    await page.waitForURL(/step=payment/)

    // 5) 결제 — 반드시 pp_system_default(모의/수동 결제)를 선택한다. fallback 금지.
    const manualOption = page
      .getByRole("radio", {
        name: /manual payment|모의 결제|테스트 결제|수동 결제/i,
      })
      .filter({ visible: true })
    if ((await manualOption.count()) === 0) {
      throw new Error(
        "[E2E] pp_system_default(수동/모의 결제) 라디오가 결제 단계에 없다."
      )
    }
    await manualOption.first().click()
    await page.getByTestId("submit-payment-button").click()
    await page.waitForURL(/step=review/)

    // 선택된 provider가 실제 pp_system_default인지 Store API로 확인한다
    const cookiesNow = await page.context().cookies()
    const cartIdNow = cookiesNow.find(
      (c) => c.name === "_medusa_cart_id"
    )?.value
    expect(cartIdNow).toBeTruthy()
    const cartState = await storeApi("/store/carts/" + cartIdNow, {
      query: { fields: "*payment_collection.payment_sessions" },
    })
    const providerId =
      cartState.json?.cart?.payment_collection?.payment_sessions?.[0]
        ?.provider_id ?? ""
    expect(providerId).toMatch(/^pp_system_default/)

    // 6) 주문 실행 → /order/{order.id}/confirmed
    await page.getByTestId("submit-order-button").click()
    await page.waitForURL(/\/order\/[^/]+\/confirmed/, {
      timeout: 60_000,
    })
    await expect(page.getByTestId("order-complete-container")).toBeVisible()

    const match = page.url().match(/\/order\/([^/]+)\/confirmed/)
    orderId = match?.[1] ?? ""
    expect(orderId).toMatch(/^order_/)

    // confirmed URL(UI 결과)의 order.id를 Store API로 재조회해 대조한다
    const cookies = await page.context().cookies()
    const token = cookies.find((c) => c.name === "_medusa_jwt")?.value
    expect(token).toBeTruthy()
    const res = await getOrderApi(orderId, token!, "id,display_id,total")
    expect(res.ok).toBe(true)
    expect(res.json?.order?.id).toBe(orderId)
    displayId = String(res.json?.order?.display_id ?? "")
    expect(displayId).not.toBe("")
    orderTotal = Number(res.json?.order?.total)
    expect(orderTotal).toBeGreaterThan(0)
    expect(errors).toEqual([])
  })

  test("주문 목록과 상세에 동일 주문이 표시된다 (새 세션 재로그인)", async ({
    browser,
  }) => {
    const errors = trackConsoleErrors
    const cat = await discoverCatalog()
    // serial 모드: 선행 test가 실패하면 자동 skip — 도달했다면 주문·금액이 반드시 있다
    expect(orderId).toMatch(/^order_/)
    expect(orderTotal).toBeGreaterThan(0)

    // 직렬 상태의 로그인 세션에 의존하지 않고 새 컨텍스트에서 buyer로 재로그인한다
    const ctx = await browser.newContext({
      baseURL: e2eEnv.baseURL,
      locale: "ko-KR",
    })
    const page = await ctx.newPage()
    const pageErrors = errors(page)
    try {
      await page.goto("/" + cat.countryCode + "/account")
      await expect(page.getByTestId("login-page")).toBeVisible()
      await page.getByTestId("email-input").fill(buyerEmail)
      await page.getByTestId("password-input").fill(TEST_PASSWORD)
      await page.getByTestId("sign-in-button").click()
      await expect(page.getByTestId("account-page")).toBeVisible()
      await expect(page.getByTestId("customer-email")).toContainText(
        buyerEmail
      )

      await page.goto("/" + cat.countryCode + "/account/orders")
      await expect(page.getByTestId("orders-page-wrapper")).toBeVisible()
      const card = page
        .getByTestId("order-card")
        .filter({ hasText: "#" + displayId })
      await expect(card).toBeVisible()
      await card.getByTestId("order-details-link").click()

      await expect(
        page.getByTestId("order-details-container")
      ).toBeVisible()
      await expect(page.getByTestId("order-id")).toHaveText(displayId)
      await expect(page.getByTestId("order-email")).toContainText(buyerEmail)
      expect(await page.getByTestId("product-name").count()).toBeGreaterThan(
        0
      )
      // 가시성만으로는 PASS 불가 — API order.total과 UI 실금액을 대조한다
      const paidText = await page.getByTestId("payment-amount").textContent()
      expect(amountOf(paidText)).toBe(orderTotal)
      expect(pageErrors).toEqual([])
    } finally {
      await ctx.close()
    }
  })
})
