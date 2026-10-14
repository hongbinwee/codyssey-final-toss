import { test, expect } from "@playwright/test"
import { discoverCatalog } from "./utils/api"

test("리뷰 실패와 재시도, 원본 구매·출처 표시는 실구매 인증과 구분한다", async ({ page }) => {
  const catalog = await discoverCatalog()
  let fail = true
  await page.route("**/store/products/*/reviews?**", async route => {
    if (fail) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "QA isolated temporary outage" }) })
    // Browser-only response fixture; nothing is imported into a database.
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({
      reviews: [{ id: "review_ui_fixture", product_id: catalog.simple.id, variant_id: null, title: "UI 테스트 응답", body: "브라우저 검증 전용 원본 표시 샘플", rating: 4, written_at: "2026-01-01T00:00:00.000Z", source: "amazon", source_ref: "https://example.invalid/review/fixture", is_synthetic: false, verified_purchase: true }],
      count: 1, offset: 0, limit: 10, summary: { average_rating: 4, review_count: 1 },
    }) })
  })
  await page.goto(`/kr/products/${catalog.simple.handle}`)
  const reviews = page.locator('section[aria-labelledby="product-reviews-heading"]')
  await expect(reviews.getByTestId("reviews-error")).toBeVisible()
  await expect(reviews.getByTestId("review-item")).toHaveCount(0)
  fail = false
  await reviews.getByRole("button", { name: "다시 시도", exact: true }).click()
  await expect(reviews.getByTestId("review-average")).toHaveText("4.0")
  const item = reviews.getByTestId("review-item")
  await expect(item).toContainText("원본 구매 표시")
  await expect(item).not.toContainText("구매 인증")
  await expect(item.getByTestId("review-source-link")).toHaveAttribute("href", "https://example.invalid/review/fixture")
})
