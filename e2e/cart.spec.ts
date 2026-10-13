import { expect, test } from "@playwright/test"
import {
  addLineItemApi,
  cartItemCount,
  createCartApi,
  discoverCatalog,
  updateLineItemApi,
} from "./utils/api"
import { trackConsoleErrors } from "./utils/helpers"

test.describe("장바구니", () => {
  test("담기 → 수량 변경 → 합계 재계산 → 삭제", async ({ page }) => {
    const errors = trackConsoleErrors(page)
    const cat = await discoverCatalog()
    const product = cat.simple
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
    // 서버 액션 완료를 카트 쿠키 + Store API로 확인한다
    await expect.poll(() => cartItemCount(page)).toBe(1)

    await page.goto("/" + cat.countryCode + "/cart")
    await expect(page.getByTestId("cart-container")).toBeVisible()
    const rows = page.getByTestId("product-row")
    await expect(rows).toHaveCount(1)

    const subtotal = page.getByTestId("cart-subtotal").first()
    const before = Number(await subtotal.getAttribute("data-value"))
    expect(before).toBeGreaterThan(0)

    // 수량 select는 maxQuantity(재고·10)까지만 허용한다 — 옵션 2가 있을 때만 변경 검증
    const select = page.getByTestId("product-select-button").first()
    const optionValues = await select
      .locator("option")
      .evaluateAll((els) => els.map((o) => o.getAttribute("value") ?? ""))
    if (optionValues.includes("2")) {
      await select.selectOption("2")
      await expect
        .poll(async () =>
          Number(await subtotal.getAttribute("data-value"))
        )
        .toBe(before * 2)
    }

    await page.getByTestId("product-delete-button").click()
    await expect(page.getByTestId("empty-cart-message")).toBeVisible()
    expect(errors).toEqual([])
  })

  test("재고 초과 수량은 Store API가 거부한다", async () => {
    const cat = await discoverCatalog()
    const variant = cat.stockLimited.variants.find(
      (v) =>
        v.manage_inventory === true &&
        !v.allow_backorder &&
        (v.inventory_quantity ?? 0) >= 1 &&
        (v.inventory_quantity ?? 0) <= 5
    )
    if (!variant) {
      throw new Error("[E2E] 재고 1~5 시나리오 variant가 없다")
    }
    const stock = variant.inventory_quantity

    // 카트 조작은 주문 완료 전까지 재고를 소모하지 않으므로 반복 실행해도 안전하다
    const cartA = await createCartApi(cat.region.id)
    const over = await addLineItemApi(cartA, variant.id, stock + 1)
    expect(over.ok).toBe(false)

    const cartB = await createCartApi(cat.region.id)
    const added = await addLineItemApi(cartB, variant.id, 1)
    expect(added.ok).toBe(true)
    const lineItemId = added.json?.cart?.items?.[0]?.id
    expect(lineItemId).toBeTruthy()
    const updated = await updateLineItemApi(cartB, lineItemId, stock + 1)
    expect(updated.ok).toBe(false)
  })
})
