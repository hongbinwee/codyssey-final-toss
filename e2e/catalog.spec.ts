import { expect, test } from "@playwright/test"
import {
  addLineItemApi,
  createCartApi,
  discoverCatalog,
  variantAmounts,
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

    const knownAmounts = variantAmounts(product)
    const before = amountOf(await priceEl.textContent())
    expect(knownAmounts).toContain(before)

    // 첫 옵션 그룹의 다른 값을 선택해 가격이 실제 variant 가격으로 유지/갱신된다
    const optionGroups = page.getByTestId("product-options")
    const buttons = optionGroups.first().getByTestId("option-button")
    if ((await buttons.count()) > 1) {
      await buttons.nth(1).click()
      const after = amountOf(await priceEl.textContent())
      expect(knownAmounts).toContain(after)
      // variant 가격이 서로 다른 상품이라면 표시 가격도 실제로 바뀐다
      if (new Set(knownAmounts).size > 1) {
        await expect
          .poll(async () => amountOf(await priceEl.textContent()))
          .not.toBe(before)
      }
    }
    await expect(page.getByTestId("add-product-button")).toBeEnabled()
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
    const addButton = page.getByTestId("add-product-button")
    await expect(addButton).toBeVisible()
    await expect(addButton).toBeDisabled()
    await expect(addButton).toContainText(/out of stock|품절|sold out/i)

    const cartId = await createCartApi(cat.region.id)
    const res = await addLineItemApi(cartId, product.variants[0].id, 1)
    expect(res.ok).toBe(false)
  })
})
