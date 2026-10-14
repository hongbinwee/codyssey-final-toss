import { expect, test } from "@playwright/test"
import {
  addLineItemApi,
  cartItemCount,
  createCartApi,
  discoverCatalog,
  updateLineItemApi,
} from "./utils/api"
import { amountOf, trackConsoleErrors } from "./utils/helpers"

test.describe("장바구니", () => {
  test("담기 → 수량 변경 → 합계 재계산 → 삭제", async ({ page }) => {
    const errors = trackConsoleErrors(page)
    const cat = await discoverCatalog()
    type ProductFixture = {
      handle: string
      options?: { id: string }[]
      variants: {
        calculated_price?: { calculated_amount?: number }
        options?: { option_id?: string; value?: string }[]
        manage_inventory?: boolean
        inventory_quantity?: number
      }[]
    }
    const products = [
      cat.simple as ProductFixture,
      ...(cat.products as ProductFixture[]),
    ]
    const target = products
      .filter((candidate) => candidate.handle.startsWith("toss3days-"))
      .flatMap((candidate) =>
        candidate.variants
          .filter(
            (variant) =>
              typeof variant.calculated_price?.calculated_amount ===
                "number" &&
              (!variant.manage_inventory ||
                (variant.inventory_quantity ?? 0) >= 2)
          )
          .map((variant) => ({ product: candidate, variant }))
      )[0]
    if (!target) {
      throw new Error(
        "[E2E] quantity=2 검증용으로 가격·재고가 충분한 variant fixture가 없다."
      )
    }
    const { product, variant } = target
    const productOptions = product.options ?? []
    if (product.variants.length > 1 && productOptions.length === 0) {
      throw new Error("[E2E] 다중 variant 상품의 옵션 메타데이터가 없다.")
    }
    await page.goto("/" + cat.countryCode + "/products/" + product.handle)

    const productContainer = page.getByTestId("product-container")
    const optionGroups = productContainer.getByTestId("product-options")
    const expectedGroups =
      product.variants.length > 1 ? productOptions.length : 0
    await expect(optionGroups).toHaveCount(expectedGroups)
    for (let i = 0; i < expectedGroups; i++) {
      const optionId = productOptions[i].id
      const value = variant.options?.find(
        (option) => option.option_id === optionId
      )?.value
      if (typeof value !== "string") {
        throw new Error("[E2E] quantity=2 variant 옵션 값이 없다: " + optionId)
      }
      await optionGroups
        .nth(i)
        .getByRole("button", { name: value, exact: true })
        .click()
    }
    const productPrice = productContainer.getByTestId("product-price").first()
    await expect
      .poll(async () => amountOf(await productPrice.textContent()))
      .toBe(variant.calculated_price!.calculated_amount)
    const addButton = productContainer.getByTestId("add-product-button")
    await expect(addButton).toBeEnabled()
    await addButton.click()
    // 서버 액션 완료를 카트 쿠키 + Store API로 확인한다
    await expect.poll(() => cartItemCount(page)).toBe(1)

    await page.goto("/" + cat.countryCode + "/cart")
    await expect(page.getByTestId("cart-container")).toBeVisible()
    const rows = page.getByTestId("product-row")
    await expect(rows).toHaveCount(1)

    const subtotal = page.getByTestId("cart-subtotal").first()
    const before = Number(await subtotal.getAttribute("data-value"))
    expect(before).toBeGreaterThan(0)

    // API에서 재고 2개 이상인 variant를 골랐으므로 quantity=2를 반드시 검증한다.
    const select = page.getByTestId("product-select-button").first()
    await expect(select.locator('option[value="2"]')).toHaveCount(1)
    await select.selectOption("2")
    await expect
      .poll(async () => Number(await subtotal.getAttribute("data-value")))
      .toBe(before * 2)

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
