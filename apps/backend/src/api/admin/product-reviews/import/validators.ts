import { z } from "zod"

// Epoch lower bound: known external corpora (e.g. Amazon reviews) reach back
// to the mid-1990s, so anything before 1970 is the true invalid range.
const WRITTEN_AT_MIN = new Date(0)

export const productReviewImportItemSchema = z
  .object({
    title: z
      .string()
      .max(200)
      .nullish()
      .transform((v) => v ?? ""),
    body: z.string().min(1).max(5000),
    rating: z.number().int().min(1).max(5),
    written_at: z.coerce
      .date()
      .min(WRITTEN_AT_MIN, "written_at must be after 1970-01-01")
      .refine((d) => d.getTime() <= Date.now(), {
        message: "written_at cannot be in the future",
      }),
    source: z.enum(["native", "amazon", "synthetic"]),
    // Provenance URL only: real http(s) URL without credentials; anything
    // else (javascript:, ftp:, user:pw@, malformed) is rejected.
    source_ref: z
      .string()
      .max(500)
      .refine(
        (v) => {
          if (!v) {
            return true
          }
          try {
            const url = new URL(v)
            return (
              (url.protocol === "http:" || url.protocol === "https:") &&
              !url.username &&
              !url.password
            )
          } catch {
            return false
          }
        },
        {
          message:
            "source_ref must be a valid http(s) URL without credentials",
        },
      )
      .nullish(),
    // Required per the review contract: (source, external_review_id) is the
    // idempotency key and only works as a guarantee when always present.
    external_review_id: z.string().min(1).max(255),
    asin: z.string().min(1).max(20).nullish(),
    parent_asin: z.string().min(1).max(20).nullish(),
    is_synthetic: z.boolean().optional(),
    verified_purchase: z.boolean().nullish(),
    status: z.enum(["pending", "approved", "flagged"]).optional(),
    displayable: z.boolean().optional(),
    rights_ref: z.string().max(500).nullish(),
    product_id: z.string().min(1),
    variant_id: z.string().min(1).nullish(),
  })
  .superRefine((review, ctx) => {
    // Public exposure needs redistribution rights for external sources.
    if (
      review.displayable === true &&
      review.source === "amazon" &&
      !review.rights_ref
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "displayable requires rights_ref for external-source reviews",
      })
    }
  })

export const productReviewImportSchema = z.object({
  reviews: z.array(productReviewImportItemSchema).min(1).max(100),
})
