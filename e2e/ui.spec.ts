import { expect, test } from "@playwright/test"
import { cartItemCount, discoverCatalog } from "./utils/api"
import {
  amountOf,
  TEST_PASSWORD,
  testEmail,
  trackConsoleErrors,
} from "./utils/helpers"

test.describe("UI 공통", () => {
  test("뷰포트 렌더링: 가로 스크롤 없이 핵심 화면이 표시된다", async ({
    page,
  }) => {
    const errors = trackConsoleErrors(page)
    const cat = await discoverCatalog()
    const product = cat.simple
    const paths = [
      "/" + cat.countryCode,
      "/" + cat.countryCode + "/store",
      "/" + cat.countryCode + "/products/" + product.handle,
    ]
    for (const p of paths) {
      await page.goto(p)
      await expect(page.locator("body")).toBeVisible()
      // 화면 밖 가로 넘침이 없어야 한다
      const overflowX = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1
      )
      expect(overflowX, "가로 overflow: " + p).toBe(false)
    }
    expect(errors).toEqual([])
  })

  test("한국어 문서: html lang이 ko 계열이다", async ({ page }) => {
    const cat = await discoverCatalog()
    await page.goto("/" + cat.countryCode)
    await expect(page.locator("html")).toHaveAttribute("lang", /ko/i)
  })

  test("게스트 카트에서 체크아웃 로그인 후 안전하게 복귀한다", async ({
    page,
  }) => {
    const errors = trackConsoleErrors(page)
    const cat = await discoverCatalog()
    const product = cat.simple
    const productOptions = (product.options ?? []) as { id: string }[]
    const variants = (product.variants ?? []) as {
      calculated_price?: { calculated_amount?: number }
      options?: { option_id?: string; value?: string }[]
      manage_inventory?: boolean
      allow_backorder?: boolean
      inventory_quantity?: number
    }[]
    const variant = variants.find(
      (candidate) =>
        typeof candidate.calculated_price?.calculated_amount === "number" &&
        (!candidate.manage_inventory ||
          candidate.allow_backorder ||
          (candidate.inventory_quantity ?? 0) > 0)
    )
    if (!variant) {
      throw new Error("[E2E] 게스트 checkout 상품에 판매 가능한 variant가 없다.")
    }

    await page.goto(
      "/" + cat.countryCode + "/products/" + product.handle
    )
    const productContainer = page.getByTestId("product-container")
    const optionGroups = productContainer.getByTestId("product-options")
    const expectedGroups = variants.length > 1 ? productOptions.length : 0
    await expect(optionGroups).toHaveCount(expectedGroups)
    for (let i = 0; i < expectedGroups; i++) {
      const optionId = productOptions[i].id
      const value = variant.options?.find(
        (option) => option.option_id === optionId
      )?.value
      if (typeof value !== "string") {
        throw new Error("[E2E] 게스트 checkout variant 옵션 값이 없다: " + optionId)
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
    await expect.poll(() => cartItemCount(page)).toBe(1)

    await page.goto("/" + cat.countryCode + "/cart")
    await expect(page.getByTestId("cart-container")).toBeVisible()
    await page.getByTestId("checkout-button").click()

    const checkoutPath = "/" + cat.countryCode + "/checkout"
    await page.waitForURL(
      (url) =>
        url.pathname === "/" + cat.countryCode + "/account" &&
        url.searchParams.get("next") === checkoutPath
    )
    await expect(page.getByTestId("login-page")).toBeVisible()
    await page.getByTestId("register-button").click()
    await expect(page.getByTestId("register-page")).toBeVisible()
    await expect(page.locator('input[name="returnTo"]')).toHaveValue(
      checkoutPath
    )
    await page.getByTestId("first-name-input").fill("QA")
    await page.getByTestId("last-name-input").fill("Guest")
    await page.getByTestId("email-input").fill(testEmail("guest-checkout"))
    await page.getByTestId("phone-input").fill("010-1234-5678")
    await page.getByTestId("password-input").fill(TEST_PASSWORD)
    await page.getByTestId("register-button").click()

    await page.waitForURL((url) => url.pathname === checkoutPath)
    await expect(page.getByTestId("shipping-first-name-input")).toBeVisible()
    await expect.poll(() => cartItemCount(page)).toBe(1)
    expect(errors).toEqual([])
  })

  // 02 theme-select 컴포넌트 실제 계약:
  // theme-select-button → theme-option-light / theme-option-dark / theme-option-system
  // localStorage 키 3days-theme, system은 prefers-color-scheme를 따른다.
  // DOM class/localStorage를 테스트가 직접 세팅하지 않고 실제 컨트롤만 조작한다.
  test("테마: 실제 선택 컨트롤로 dark 적용·reload 유지·system 추종", async ({
    page,
  }) => {
    const errors = trackConsoleErrors(page)
    const cat = await discoverCatalog()
    await page.goto("/" + cat.countryCode)

    const trigger = page.getByTestId("theme-select-button")
    await expect(
      trigger,
      "테마 선택 컨트롤(theme-select-button)이 없다 — 02 UI 통합 상태 확인"
    ).toBeVisible()
    await expect(trigger).toHaveAttribute("aria-label", /테마/)

    const htmlHasDark = () =>
      page.evaluate(() =>
        document.documentElement.classList.contains("dark")
      )
    const bodyBg = () =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    // Headless UI Popover는 옵션 선택 후 자동으로 닫히지 않는다 —
    // 열기 전 option 가시성을 확인하고 필요할 때만 trigger를 누른다.
    const openTheme = async () => {
      const opt = page.getByTestId("theme-option-light")
      if (!(await opt.isVisible().catch(() => false))) {
        await trigger.click()
      }
      await expect(opt).toBeVisible()
    }

    // 시작 OS 선호를 light로 고정해 프로젝트(desktop-dark) 간 차이를 없앤다
    await page.emulateMedia({ colorScheme: "light" })

    // dark 선택 → html.dark 반영 + 실제 배경이 어두워진다
    await openTheme()
    await page.getByTestId("theme-option-dark").click()
    await expect
      .poll(htmlHasDark, { message: "다크 선택 후 html.dark 미적용" })
      .toBe(true)
    const darkBg = await bodyBg()

    // reload 후에도 localStorage(3days-theme) 선택이 유지된다
    await page.reload()
    await expect
      .poll(htmlHasDark, {
        message: "reload 후 다크 유지 실패(3days-theme 미지속)",
      })
      .toBe(true)
    expect(
      await page.evaluate(() => localStorage.getItem("3days-theme")),
      "3days-theme이 dark로 저장되지 않았다"
    ).toBe("dark")

    // system 선택 → emulateMedia 양방향으로 OS 추종을 검증한다
    await openTheme()
    await page.getByTestId("theme-option-system").click()
    await page.emulateMedia({ colorScheme: "dark" })
    await expect
      .poll(htmlHasDark, {
        message: "system 모드가 OS dark를 따르지 않는다",
      })
      .toBe(true)
    await page.emulateMedia({ colorScheme: "light" })
    await expect
      .poll(htmlHasDark, {
        message: "system 모드가 OS light를 따르지 않는다",
      })
      .toBe(false)
    const lightBg = await bodyBg()
    // computed 배경이 실제로 다르다 — class 토글만으로 PASS 금지
    expect(lightBg).not.toBe(darkBg)

    // light 선택 → dark 해제
    await openTheme()
    await page.getByTestId("theme-option-light").click()
    await expect.poll(htmlHasDark).toBe(false)
    expect(errors).toEqual([])
  })

  test("통화 표시: KRW 소수점 없는 형식으로 가격이 보인다", async ({
    page,
  }) => {
    const errors = trackConsoleErrors(page)
    const cat = await discoverCatalog()
    await page.goto("/" + cat.countryCode + "/store")

    const price = page.getByTestId("price").first()
    await expect(price).toBeVisible()
    const text = await price.textContent()
    expect(text).toMatch(/₩|원|KRW/)
    // KRW는 0자리 통화 — 소수점이 보이면 환산/포맷 결함이다
    expect(text).not.toMatch(/\.\d/)
    expect(amountOf(text)).toBeGreaterThan(0)
    expect(errors).toEqual([])
  })
})
