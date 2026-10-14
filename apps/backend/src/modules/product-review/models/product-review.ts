import { model } from "@medusajs/framework/utils"

/**
 * Product review entity. Customer-PII-free by design: no name/email columns,
 * reviewer identity is out of scope. External review provenance is carried by
 * source/source_ref/external_review_id/asin/parent_asin/rights_ref so imported
 * reviews stay distinguishable from native ones, and is_synthetic marks demo
 * data. verified_purchase is nullable: null means "no purchase claim made"
 * (typical for external reviews) rather than a false claim.
 *
 * title defaults to an empty string so imports that carry no title stay
 * consistent with the review DTO contract instead of storing NULL.
 * displayable defaults to false so a review is not publicly visible until it
 * is explicitly opted in - a safety default for external reviews whose
 * redistribution rights may be unknown.
 *
 * The composite unique index on (source, external_review_id) makes import
 * idempotent; rows without an external_review_id never collide because
 * PostgreSQL treats NULL keys as distinct.
 */
export const ProductReview = model
  .define("product_review", {
    id: model.id().primaryKey(),
    title: model.text().default(""),
    body: model.text(),
    rating: model.number(),
    written_at: model.dateTime(),
    source: model.enum(["native", "amazon", "synthetic"]),
    source_ref: model.text().nullable(),
    external_review_id: model.text().nullable(),
    asin: model.text().nullable(),
    parent_asin: model.text().nullable(),
    is_synthetic: model.boolean().default(false),
    verified_purchase: model.boolean().nullable(),
    status: model
      .enum(["pending", "approved", "flagged"])
      .default("pending"),
    displayable: model.boolean().default(false),
    rights_ref: model.text().nullable(),
    product_id: model.text(),
    variant_id: model.text().nullable(),
  })
  .indexes([
    {
      name: "uidx_product_review_source_external",
      on: ["source", "external_review_id"],
      unique: true,
    },
    {
      name: "idx_product_review_public_lookup",
      on: ["product_id", "status", "displayable"],
    },
  ])
