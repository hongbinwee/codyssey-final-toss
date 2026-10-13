import { expect, test } from "@playwright/test"
import { discoverCatalog } from "./utils/api"
import { amountOf, trackConsoleErrors } from "./utils/helpers"

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

    // dark 선택 → html.dark 반영
    await trigger.click()
    await page.getByTestId("theme-option-dark").click()
    await expect
      .poll(htmlHasDark, "다크 선택 후 html.dark 미적용")
      .toBe(true)

    // reload 후에도 localStorage 기반 선택이 유지된다
    await page.reload()
    await expect
      .poll(htmlHasDark, "reload 후 다크 유지 실패(3days-theme 미지속)")
      .toBe(true)

    // system 선택 → OS prefers-color-scheme 에뮬레이션을 따른다
    const wantDark = test.info().project.use.colorScheme === "dark"
    await page.getByTestId("theme-select-button").click()
    await page.getByTestId("theme-option-system").click()
    await expect
      .poll(htmlHasDark, "system 모드가 OS 선호를 따르지 않는다")
      .toBe(wantDark)

    // light 선택 → dark 해제
    await page.getByTestId("theme-select-button").click()
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