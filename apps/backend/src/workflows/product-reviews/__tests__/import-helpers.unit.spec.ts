/**
 * DB-free checks for the review import invariants. Workflow/step DB behavior
 * is verified separately against the isolated review-spike database.
 */
import { productReviewImportSchema } from "../../../api/admin/product-reviews/import/validators"
import {
  dedupeImportReviews,
  externalDedupKey,
  normalizeImportReview,
} from "../helpers"
import type { ProductReviewImportItem } from "../types"

const baseItem: ProductReviewImportItem = {
  title: "좋아요",
  body: "만족합니다",
  rating: 5,
  written_at: new Date("2026-01-15T00:00:00Z"),
  source: "amazon",
  external_review_id: "R123",
  product_id: "prod_1",
}

describe("externalDedupKey", () => {
  it("builds a source-scoped key only when external_review_id exists", () => {
    expect(externalDedupKey(baseItem)).toBe("amazon::R123")
    expect(
      externalDedupKey({ ...baseItem, external_review_id: null }),
    ).toBeNull()
  })
})

describe("normalizeImportReview", () => {
  it("defaults status to pending and keeps displayable off until opt-in", () => {
    const n = normalizeImportReview(baseItem)
    expect(n.status).toBe("pending")
    expect(n.displayable).toBe(false)
  })

  it("forces is_synthetic whenever source is synthetic", () => {
    const n = normalizeImportReview({
      ...baseItem,
      source: "synthetic",
      is_synthetic: false,
    })
    expect(n.is_synthetic).toBe(true)
  })
})

describe("dedupeImportReviews", () => {
  const fp = {
    product_id: "prod_1",
    variant_id: null,
    title: "좋아요",
    body: "만족합니다",
    rating: 5,
  }

  it("skips rows whose key exists in the database", () => {
    const { creates, skipped, conflicts } = dedupeImportReviews(
      [baseItem],
      new Map([["amazon::R123", fp]]),
    )
    expect(creates).toHaveLength(0)
    expect(skipped).toBe(1)
    expect(conflicts).toHaveLength(0)
  })

  it("keeps only the first occurrence of an in-batch duplicate", () => {
    const { creates, skipped, conflicts } = dedupeImportReviews(
      [baseItem, { ...baseItem, title: "dup" }],
      new Map(),
    )
    // Same key but different title inside one batch is a conflict, not a
    // silent skip.
    expect(creates).toHaveLength(1)
    expect(skipped).toBe(0)
    expect(conflicts).toHaveLength(1)
  })

  it("keeps rows without external_review_id and different keys", () => {
    const { creates, skipped } = dedupeImportReviews(
      [
        { ...baseItem, external_review_id: null },
        { ...baseItem, external_review_id: null },
        { ...baseItem, external_review_id: "R999" },
      ],
      new Map([["amazon::R123", fp]]),
    )
    expect(creates).toHaveLength(3)
    expect(skipped).toBe(0)
  })

  it("rejects reuse of an external id for a different product", () => {
    const { creates, skipped, conflicts } = dedupeImportReviews(
      [{ ...baseItem, product_id: "prod_other" }],
      new Map([["amazon::R123", fp]]),
    )
    expect(creates).toHaveLength(0)
    expect(skipped).toBe(0)
    expect(conflicts).toHaveLength(1)
  })

  it("rejects changed content for an existing external id", () => {
    const { conflicts } = dedupeImportReviews(
      [{ ...baseItem, rating: 1 }],
      new Map([["amazon::R123", fp]]),
    )
    expect(conflicts).toHaveLength(1)
  })

  it("rejects a variant move for an existing external id", () => {
    const { conflicts } = dedupeImportReviews(
      [{ ...baseItem, variant_id: "var_2" }],
      new Map([["amazon::R123", fp]]),
    )
    expect(conflicts).toHaveLength(1)
  })

  it("accepts an identical repeat including variant_id", () => {
    const { creates, skipped, conflicts } = dedupeImportReviews(
      [{ ...baseItem, variant_id: "var_1" }],
      new Map([["amazon::R123", { ...fp, variant_id: "var_1" }]]),
    )
    expect(creates).toHaveLength(0)
    expect(skipped).toBe(1)
    expect(conflicts).toHaveLength(0)
  })
})

describe("productReviewImportSchema", () => {
  const valid = {
    title: "t",
    body: "b",
    rating: 4,
    written_at: "2026-01-10T00:00:00Z",
    source: "amazon",
    external_review_id: "R1",
    product_id: "prod_1",
  }

  it("accepts a valid batch and rejects oversized or invalid input", () => {
    expect(
      productReviewImportSchema.safeParse({ reviews: [valid] }).success,
    ).toBe(true)
    expect(
      productReviewImportSchema.safeParse({ reviews: [] }).success,
    ).toBe(false)
    expect(
      productReviewImportSchema.safeParse({
        reviews: Array(101).fill(valid),
      }).success,
    ).toBe(false)
    expect(
      productReviewImportSchema.safeParse({
        reviews: [{ ...valid, rating: 6 }],
      }).success,
    ).toBe(false)
    expect(
      productReviewImportSchema.safeParse({
        reviews: [{ ...valid, rating: 4.5 }],
      }).success,
    ).toBe(false)
    expect(
      productReviewImportSchema.safeParse({
        reviews: [{ ...valid, source: "google" }],
      }).success,
    ).toBe(false)
    expect(
      productReviewImportSchema.safeParse({
        reviews: [{ ...valid, written_at: "2999-01-01T00:00:00Z" }],
      }).success,
    ).toBe(false)
    expect(
      productReviewImportSchema.safeParse({
        reviews: [{ ...valid, written_at: "1999-12-31T23:59:59Z" }],
      }).success,
    ).toBe(true)
    expect(
      productReviewImportSchema.safeParse({
        reviews: [{ ...valid, written_at: "not-a-date" }],
      }).success,
    ).toBe(false)
  })

  it("accepts ISO written_at and rating bounds 1 and 5", () => {
    for (const rating of [1, 5]) {
      expect(
        productReviewImportSchema.safeParse({
          reviews: [{ ...valid, rating }],
        }).success,
      ).toBe(true)
    }
    expect(
      productReviewImportSchema.safeParse({
        reviews: [{ ...valid, rating: 0 }],
      }).success,
    ).toBe(false)
  })

  it("defaults missing title to empty string", () => {
    const result = productReviewImportSchema.parse({
      reviews: [{ ...valid }],
    })
    expect(result.reviews[0].title).toBe("t")
    const noTitle = { ...valid } as Record<string, unknown>
    delete noTitle.title
    const parsed = productReviewImportSchema.parse({ reviews: [noTitle] })
    expect(parsed.reviews[0].title).toBe("")
    const nullTitle = productReviewImportSchema.parse({
      reviews: [{ ...valid, title: null }],
    })
    expect(nullTitle.reviews[0].title).toBe("")
  })

  it("rejects non-http or credentialed source_ref and accepts https URLs", () => {
    expect(
      productReviewImportSchema.safeParse({
        reviews: [{ ...valid, source_ref: "javascript:alert(1)" }],
      }).success,
    ).toBe(false)
    expect(
      productReviewImportSchema.safeParse({
        reviews: [
          { ...valid, source_ref: "https://user:pw@example.com/r/1" },
        ],
      }).success,
    ).toBe(false)
    expect(
      productReviewImportSchema.safeParse({
        reviews: [{ ...valid, source_ref: "ftp://example.com/x" }],
      }).success,
    ).toBe(false)
    expect(
      productReviewImportSchema.safeParse({
        reviews: [
          { ...valid, source_ref: "https://example.com/review/R123" },
        ],
      }).success,
    ).toBe(true)
  })

  it("requires external_review_id", () => {
    const noId = { ...valid } as Record<string, unknown>
    delete noId.external_review_id
    expect(
      productReviewImportSchema.safeParse({ reviews: [noId] }).success,
    ).toBe(false)
  })

  it("rejects displayable external reviews without rights_ref", () => {
    expect(
      productReviewImportSchema.safeParse({
        reviews: [{ ...valid, displayable: true }],
      }).success,
    ).toBe(false)
    expect(
      productReviewImportSchema.safeParse({
        reviews: [
          { ...valid, displayable: true, rights_ref: "lic-1" },
        ],
      }).success,
    ).toBe(true)
    expect(
      productReviewImportSchema.safeParse({
        reviews: [{ ...valid, source: "native", displayable: true }],
      }).success,
    ).toBe(true)
  })

  it("accepts mid-1990s written_at (epoch lower bound)", () => {
    expect(
      productReviewImportSchema.safeParse({
        reviews: [{ ...valid, written_at: "1996-06-15T00:00:00Z" }],
      }).success,
    ).toBe(true)
    expect(
      productReviewImportSchema.safeParse({
        reviews: [{ ...valid, written_at: "1969-12-31T23:59:59Z" }],
      }).success,
    ).toBe(false)
  })
})
