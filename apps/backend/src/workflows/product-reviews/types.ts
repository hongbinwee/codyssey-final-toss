export type ProductReviewSource = "native" | "amazon" | "synthetic"

export type ProductReviewStatus = "pending" | "approved" | "flagged"

export type ProductReviewImportItem = {
  title: string
  body: string
  rating: number
  written_at: Date
  source: ProductReviewSource
  source_ref?: string | null
  external_review_id?: string | null
  asin?: string | null
  parent_asin?: string | null
  is_synthetic?: boolean
  verified_purchase?: boolean | null
  status?: ProductReviewStatus
  displayable?: boolean
  rights_ref?: string | null
  product_id: string
  variant_id?: string | null
}
