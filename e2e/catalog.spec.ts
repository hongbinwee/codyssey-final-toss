import { expect, test } from "@playwright/test"
import {
  addLineItemApi,
  createCartApi,
  discoverCatalog,
} from "./utils/api"
import { amountOf, currencyText, trackConsoleErrors } from "./utils/helpers"

// 필수 픽스처가 없으면 discoverCatalog가 실패한다 — skip으로 통과를 위장하지 않는다.
test.describe("상품 탐색", () => {
  test("홈 진입 후 내비게이션과 콘솔 오류 확인", async ({ page }) => {
    const errors = trackConsoleErrors(page)
    const cat = await discoverCatalog()
    await page.goto("/")
    await expect(page).toHaveURL(new RegExp("/" + cat.countryCode))

    const mobile = (page.viewportSize()?.width ?? 1440) < 1024
    if (mobile) {
      const menuButton = page.getByTestId("nav-menu-button").first()
      await expect(menuButton).toBeVisible()
      await menuButton.click()
      await expect(page.getByTestId("nav-menu-popup")).toBeVisible()
      await expect(
        page.getByTestId("nav-menu-popup").getByTestId("cart-link")
      ).toBeVisible()
      await page.getByTestId("close-menu-button").click()
    } else {
      await expect(page.getByTestId("nav-store-link")).toBeVisible()
      await expect(page.getByTestId("nav-cart-link").first()).toBeVisible()
    }
    expect(errors).toEqual([])
  })

  test("스토어 목록: products-list 렌더, products-error 없음", async ({
    page,
  }) => {
    const errors = trackConsoleErrors(page)
    const cat = await discoverCatalog()
    await page.goto("/" + cat.countryCode + "/store")

    await expect(page.getByTestId("category-container")).toBeVisible()
    await expect(
      page
        .getByTestId("products-list")
        .or(page.getByTestId("no-products"))
        .or(page.getByTestId("products-error"))
        .first()
    ).toBeVisible()
    await expect(page.getByTestId("products-error")).toHaveCount(0)
    expect(
      await page
        .getByTestId("products-list")
        .getByTestId("product-wrapper")
        .count()
    ).toBeGreaterThan(0)
    expect(errors).toEqual([])
  })

  test("스토어 검색: 실제 상품명으로 결과, 없는 검색어는 빈 결과", async ({
    page,
  }) => {
    const errors = trackConsoleErrors(page)
    const cat = await discoverCatalog()
    await page.goto("/" + cat.countryCode + "/store")
    const box = page.getByTestId("store-search-input")
    await expect(box).toBeVisible()

    const title: string = cat.simple.title ?? ""
    const token =
      title.split(/\s+/).find((w) => w.length >= 2) ?? title.slice(0, 2)
    await box.fill(token)
    // 검색 인덱스가 채워져 있다면 기존 상품명의 결과가 있어야 한다
    await expect(page.getByTestId("products-error")).toHaveCount(0)
    await expect(
      page.getByTestId("products-list").getByTestId("product-wrapper").first()
    ).toBeVisible({ timeout: 20_000 })

    await box.fill("zxqv-notfound-9999")
    await expect(page.getByTestId("no-products")).toBeVisible({
      timeout: 20_000,
    })
    expect(errors).toEqual([])
  })

  test("상품 상세: 옵션 변경 시 실제 variant 가격으로 갱신", async ({
    page,
  }) => {
    const errors = trackConsoleErrors(page)
    const cat = await discoverCatalog()
    const product = cat.optioned
    await page.goto("/" + cat.countryCode + "/products/" + product.handle)

    const container = page.getByTestId("product-container")
    await expect(container).toBeVisible()
    await expect(container.getByTestId("product-title")).toContainText(
      product.title
    )
    // 관련 상품 카드도 같은 testid를 쓰므로 product-container 안으로 scope한다
    const priceEl = container.getByTestId("product-price").first()
    await expect(priceEl).toContainText(currencyText())

    const productOptions = (product.options ?? []) as { id: string }[]
    const variants = (product.variants ?? []) as {
      calculated_price?: { calculated_amount?: number }
      options?: { option_id?: string; value?: string }[]
      manage_inventory?: boolean
      allow_backorder?: boolean
      inventory_quantity?: number
    }[]
    const optionGroups = container.getByTestId("product-options")
    expect(productOptions.length).toBeGreaterThan(1)
    await expect(optionGroups).toHaveCount(productOptions.length)

    // API variant의 전체 option 조합을 사용해 실제 선택 가능한 가격 쌍을 찾는다.
    const candidates = variants.flatMap((variant) => {
      const amount = variant.calculated_price?.calculated_amount
      const values: Record<string, string> = {}
      for (const option of variant.options ?? []) {
        if (option.option_id && typeof option.value === "string") {
          values[option.option_id] = option.value
        }
      }
      const isPurchasable =
        !variant.manage_inventory ||
        variant.allow_backorder ||
        (variant.inventory_quantity ?? 0) > 0
      if (
        typeof amount !== "number" ||
        !isPurchasable ||
        !productOptions.every(
          (option) => typeof values[option.id] === "string"
        )
      ) {
        return []
      }
      return [{ amount, values }]
    })
    let pricePair: (typeof candidates)[number][] | undefined
    for (let i = 0; i < candidates.length; i++) {
      const other = candidates
        .slice(i + 1)
        .find((candidate) => candidate.amount !== candidates[i].amount)
      if (other) {
        pricePair = [candidates[i], other]
        break
      }
    }
    if (!pricePair) {
      throw new Error(
        "[E2E] optioned 상품에 가격이 다른 판매 가능 variant 조합이 없다."
      )
    }

    const selectVariant = async (candidate: (typeof candidates)[number]) => {
      for (let i = 0; i < productOptions.length; i++) {
        const value = candidate.values[productOptions[i].id]
        if (value === undefined) {
          throw new Error(
            "[E2E] 선택한 variant에 옵션 값이 없다: " + productOptions[i].id
          )
        }
        await optionGroups
          .nth(i)
          .getByRole("button", { name: value, exact: true })
          .click()
      }
      await expect
        .poll(async () => amountOf(await priceEl.textContent()))
        .toBe(candidate.amount)
      await expect(container.getByTestId("add-product-button")).toBeEnabled()
    }

    const [firstVariant, secondVariant] = pricePair
    await selectVariant(firstVariant)
    const firstAmount = amountOf(await priceEl.textContent())
    await selectVariant(secondVariant)
    const secondAmount = amountOf(await priceEl.textContent())
    expect(secondAmount).not.toBe(firstAmount)

    await expect(container.getByTestId("add-product-button")).toBeEnabled()
    expect(errors).toEqual([])
  })

  test("할인 상품: 정가와 할인가가 함께 표시된다", async ({ page }) => {
    const errors = trackConsoleErrors(page)
    const cat = await discoverCatalog()
    const product = cat.discounted
    await page.goto("/" + cat.countryCode + "/products/" + product.handle)

    const container = page.getByTestId("product-container")
    await expect(container).toBeVisible()
    const priceEl = container.getByTestId("product-price").first()
    const originalEl = container
      .getByTestId("original-product-price")
      .or(container.getByTestId("original-price"))
      .first()
    await expect(priceEl).toBeVisible()
    await expect(originalEl).toBeVisible()

    const now = amountOf(await priceEl.textContent())
    const original = amountOf(await originalEl.textContent())
    expect(original).toBeGreaterThan(now)
    expect(errors).toEqual([])
  })

  test("품절 상품: 담기 버튼 비활성 + Store API가 생성을 거부", async ({
    page,
  }) => {
    const cat = await discoverCatalog()
    const product = cat.soldOut
    await page.goto("/" + cat.countryCode + "/products/" + product.handle)
    const productOptions = (product.options ?? []) as { id: string }[]
    const variants = (product.variants ?? []) as {
      id: string
      calculated_price?: { calculated_amount?: number }
      options?: { option_id?: string; value?: string }[]
    }[]
    const variant = variants[0]
    if (!variant) {
      throw new Error("[E2E] 품절 상품에 variant가 없다.")
    }
    const container = page.getByTestId("product-container")
    const optionGroups = container.getByTestId("product-options")
    const expectedGroups = variants.length > 1 ? productOptions.length : 0
    await expect(optionGroups).toHaveCount(expectedGroups)
    for (let i = 0; i < expectedGroups; i++) {
      const optionId = productOptions[i].id
      const value = variant.options?.find(
        (option) => option.option_id === optionId
      )?.value
      if (typeof value !== "string") {
        throw new Error("[E2E] 품절 variant의 옵션 값이 없다: " + optionId)
      }
      await optionGroups
        .nth(i)
        .getByRole("button", { name: value, exact: true })
        .click()
    }
    const productPrice = container.getByTestId("product-price").first()
    const expectedAmount = variant.calculated_price?.calculated_amount
    if (typeof expectedAmount !== "number") {
      throw new Error("[E2E] 품절 variant의 API 가격이 없다.")
    }
    await expect
      .poll(async () => amountOf(await productPrice.textContent()))
      .toBe(expectedAmount)

    const addButton = container.getByTestId("add-product-button")
    await expect(addButton).toBeVisible()
    await expect(addButton).toBeDisabled()
    await expect(addButton).toContainText(/품절|out of stock|sold out/i)

    const cartId = await createCartApi(cat.region.id)
    const res = await addLineItemApi(cartId, variant.id, 1)
    expect(res.ok).toBe(false)
    expect(res.status).toBe(400)
  })
})
