import {
  listStoreProductReviewsParams,
  publicReviewFields,
  reviewSortOrders,
} from "../../../api/store/products/[id]/reviews/validators"

describe("public review boundary", () => {
  it("rejects private status selectors instead of silently stripping them", () => {
    expect(listStoreProductReviewsParams.safeParse({ status: "pending" }).success).toBe(false)
    expect(listStoreProductReviewsParams.safeParse({ sort: "newest", offset: "0", limit: "50" }).success).toBe(true)
  })

  it("exposes provenance while keeping external identifiers private", () => {
    expect(publicReviewFields).toContain("source_ref")
    for (const field of ["asin", "parent_asin", "external_review_id", "rights_ref", "status", "displayable"]) {
      expect(publicReviewFields).not.toContain(field)
    }
  })

  it("uses a unique final tie breaker for every paginated sort", () => {
    for (const order of Object.values(reviewSortOrders)) {
      expect(Object.keys(order).at(-1)).toBe("id")
      expect(order.id).toBe("ASC")
    }
  })
})
