/**
 * Seeds synthetic product reviews for QA against the isolated review-spike
 * database only. Refuses to run against the shared toss3days database or any
 * database whose name does not look like an isolated/test target.
 *
 *   npx medusa exec ./src/scripts/seed-review-test-fixtures.ts
 *
 * Requires products to exist (core migrate + catalog seed first). Idempotent:
 * rows are keyed by (source = synthetic, external_review_id = syn-<product>-<i>)
 * and existing keys are skipped.
 */
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import type { ExecArgs } from "@medusajs/framework/types"

import { PRODUCT_REVIEW_MODULE } from "../modules/product-review"
import type { ProductReviewImportItem } from "../workflows/product-reviews/types"

const ISOLATED_DB_PATTERN = /(review_spike|_isolated|_test)/i
const REVIEWS_PER_PRODUCT = 4
const BULK_REVIEWS_FOR_FIRST_PRODUCT = 18

function assertIsolatedDatabase() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "DATABASE_URL is not set",
    )
  }
  const dbName = new URL(url).pathname.replace(/^\//, "")
  if (dbName === "toss3days" || !ISOLATED_DB_PATTERN.test(dbName)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Refusing to seed review fixtures on non-isolated database",
    )
  }
}

const FIXTURES = [
  { title: "기대 이상이에요", body: "배송도 빠르고 품질도 좋습니다.", rating: 5, status: "approved" },
  { title: "보통입니다", body: "가격 대비 무난합니다.", rating: 3, status: "approved" },
  { title: "아쉬운 점이 있어요", body: "설명과 실물이 조금 다릅니다.", rating: 2, status: "approved" },
  { title: "검토 대기 리뷰", body: "승인 전이라 공개되면 안 됩니다.", rating: 4, status: "pending" },
] as const

const seedReviewTestFixtures = async ({ container }: ExecArgs) => {
  assertIsolatedDatabase()

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const reviewService = container.resolve(PRODUCT_REVIEW_MODULE)

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title"],
    pagination: { skip: 0, take: 6 },
  })
  if (!products.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "No products found; run core migrate and the catalog seed first",
    )
  }

  const existing = await reviewService.listProductReviews(
    { source: "synthetic" },
    {
      select: ["external_review_id"],
      // Explicit take: the service list default page size would silently
      // truncate the existing-key set and a re-run would collide instead
      // of skipping.
      take: 5000,
    },
  )
  const existingKeys = new Set(
    existing.map((r) => r.external_review_id).filter(Boolean),
  )

  const creates: ProductReviewImportItem[] = []
  for (const product of products) {
    for (let i = 0; i < REVIEWS_PER_PRODUCT; i += 1) {
      const fixture = FIXTURES[i % FIXTURES.length]
      const externalId = "syn-" + product.id + "-" + (i + 1)
      if (existingKeys.has(externalId)) {
        continue
      }
      creates.push({
        title: fixture.title,
        body: fixture.body,
        rating: fixture.rating,
        written_at: new Date(Date.now() - (i + 1) * 86400000),
        source: "synthetic" as const,
        source_ref: "https://fixtures.local/seed-review-test-fixtures",
        external_review_id: externalId,
        is_synthetic: true,
        verified_purchase: null,
        status: fixture.status,
        displayable: true,
        product_id: product.id as string,
      })
    }
  }

  // More than one service-list page worth of approved reviews on the first
  // product, so summary paging beyond 15+ rows is exercised.
  const bulkTarget = products[0]
  for (let i = 0; i < BULK_REVIEWS_FOR_FIRST_PRODUCT; i += 1) {
    const externalId = "syn-" + bulkTarget.id + "-bulk-" + (i + 1)
    if (existingKeys.has(externalId)) {
      continue
    }
    creates.push({
      title: "벌크 리뷰 " + (i + 1),
      body: "집계 페이징 검증용 합성 리뷰입니다.",
      rating: (i % 5) + 1,
      written_at: new Date(Date.now() - (i + 2) * 86400000),
      source: "synthetic",
      source_ref: "https://fixtures.local/seed-review-test-fixtures",
      external_review_id: externalId,
      is_synthetic: true,
      verified_purchase: null,
      status: "approved",
      displayable: true,
      product_id: bulkTarget.id as string,
    })
  }

  if (creates.length) {
    await reviewService.createProductReviews(creates)
  }

  logger.info(
    "seed-review-test-fixtures: created " +
      creates.length +
      " synthetic reviews across " +
      products.length +
      " products",
  )
}

export default seedReviewTestFixtures
