import { expect, test } from "@playwright/test"
import {
  createOrderForCustomer,
  discoverCatalog,
  getCustomerApi,
  getOrderApi,
  listOrderIdsApi,
  registerCustomerApi,
} from "./utils/api"
import { TEST_PASSWORD, testEmail } from "./utils/helpers"

// 고객A의 주문을 고객B가 API·UI로 읽을 수 없어야 한다.
// main에 통합된 주문 소유권 middleware가 owner만 허용하는지 검증한다.
test.describe.configure({ mode: "serial" })
test.describe("주문 소유권 격리", () => {
  let orderA: { id: string; display_id: number | string } | null = null
  let customerB: { email: string; password: string; token: string } | null =
    null

  test.beforeAll(async () => {
    const cat = await discoverCatalog()
    const variantId = cat.simple.variants[0].id
    const emailA = testEmail("cust-a")
    const a = await registerCustomerApi(emailA, TEST_PASSWORD, {
      first_name: "Customer",
      last_name: "A",
    })
    orderA = await createOrderForCustomer({
      token: a.token,
      email: emailA,
      region: cat.region,
      countryCode: cat.countryCode,
      variantId,
    })
    // B 차단 검사의 전제 — A 토큰으로 주문이 실제 A에게 귀속됐는지 먼저 검증한다
    const meA = await getCustomerApi(a.token)
    expect(meA.ok, "A /store/customers/me 실패").toBe(true)
    const customerIdA = meA.json?.customer?.id
    expect(customerIdA).toBeTruthy()
    const ownOrder = await getOrderApi(
      orderA.id,
      a.token,
      "id,display_id,customer_id"
    )
    expect(ownOrder.ok, "A 본인 주문 조회 실패").toBe(true)
    expect(ownOrder.json?.order?.customer_id).toBe(customerIdA)
    const myIds = await listOrderIdsApi(a.token)
    expect(myIds).toContain(orderA.id)
    customerB = await registerCustomerApi(testEmail("cust-b"), TEST_PASSWORD, {
      first_name: "Customer",
      last_name: "B",
    })
  })

  test("API: 고객B는 고객A 주문 상세를 읽을 수 없고 목록에도 없다", async () => {
    const denied = await getOrderApi(orderA!.id, customerB!.token)
    expect(denied.ok).toBe(false)
    expect(denied.status).toBe(404)

    const ids = await listOrderIdsApi(customerB!.token)
    expect(ids).not.toContain(orderA!.id)
  })

  test("UI: 고객B 로그인 상태에서 타인 주문 상세는 404, 목록은 격리", async ({
    page,
  }) => {
    const browserErrors: { message: string; locationUrl: string }[] = []
    const response404Urls: string[] = []
    page.on("console", (message) => {
      if (message.type() === "error") {
        browserErrors.push({
          message: message.text(),
          locationUrl: message.location().url,
        })
      }
    })
    page.on("pageerror", (error) => {
      browserErrors.push({
        message: "pageerror: " + error.message,
        locationUrl: "",
      })
    })
    page.on("response", (response) => {
      if (response.status() === 404) {
        response404Urls.push(response.url())
      }
    })
    const cat = await discoverCatalog()

    await page.goto("/" + cat.countryCode + "/account")
    await expect(page.getByTestId("login-page")).toBeVisible()
    await page.getByTestId("email-input").fill(customerB!.email)
    await page.getByTestId("password-input").fill(customerB!.password)
    await page.getByTestId("sign-in-button").click()
    await expect(page.getByTestId("account-page")).toBeVisible()
    await expect(page.getByTestId("customer-email")).toContainText(
      customerB!.email
    )

    const detailPath =
      "/" + cat.countryCode + "/account/orders/details/" + orderA!.id
    await page.goto(detailPath)
    await expect(
      page.getByText(/page not found|찾을 수 없/i).first()
    ).toBeVisible()

    await page.goto("/" + cat.countryCode + "/account/orders")
    await expect(page.getByTestId("orders-page-wrapper")).toBeVisible()
    if ((await page.getByTestId("no-orders-container").count()) === 0) {
      await expect(
        page.getByTestId("order-card").filter({
          hasText: "#" + String(orderA!.display_id),
        })
      ).toHaveCount(0)
    } else {
      await expect(page.getByTestId("no-orders-container")).toBeVisible()
    }

    // Prefetch console events can arrive after the next navigation. Permit only
    // a 404 whose console location and HTTP response both name this exact order.
    const targetUrl = new URL(detailPath, page.url())
    const targetOrderUrl = targetUrl.origin + targetUrl.pathname
    const normalizedUrl = (value: string) => {
      if (!value) {
        return ""
      }
      try {
        const url = new URL(value, page.url())
        return url.origin + url.pathname
      } catch {
        return ""
      }
    }
    const response404Paths = new Set(response404Urls.map(normalizedUrl))
    const unexpectedErrors = browserErrors.filter((error) => {
      const isResource404 =
        /Failed to load resource.*404/i.test(error.message)
      return !(
        isResource404 &&
        normalizedUrl(error.locationUrl) === targetOrderUrl &&
        response404Paths.has(targetOrderUrl)
      )
    })
    expect(unexpectedErrors).toEqual([])
  })
})
