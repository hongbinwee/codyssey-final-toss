import { expect, test } from "@playwright/test"
import {
  createOrderForCustomer,
  discoverCatalog,
  getCustomerApi,
  getOrderApi,
  listOrderIdsApi,
  registerCustomerApi,
} from "./utils/api"
import { TEST_PASSWORD, testEmail, trackConsoleErrors } from "./utils/helpers"

// 고객A의 주문을 고객B가 API·UI로 읽을 수 없어야 한다.
// 현재 /store/orders/:id는 소유권 middleware(01 작업) 미적용 상태라
// owner/anonymous/B 모두 200이 가능하다 — 이 스펙이 실패하는 것이 정상이며,
// middleware 통합 후 PASS로 전환돼야 한다.
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
    expect([401, 403, 404]).toContain(denied.status)

    const ids = await listOrderIdsApi(customerB!.token)
    expect(ids).not.toContain(orderA!.id)
  })

  test("UI: 고객B 로그인 상태에서 타인 주문 상세는 404, 목록은 격리", async ({
    page,
  }) => {
    const errors = trackConsoleErrors(page)
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

    await page.goto(
      "/" + cat.countryCode + "/account/orders/details/" + orderA!.id
    )
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
    expect(errors).toEqual([])
  })
})
