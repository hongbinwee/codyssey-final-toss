import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"

import { assertReviewTargetsStep } from "./steps/assert-review-targets"
import { createImportedReviewsStep } from "./steps/create-imported-reviews"
import { dedupeImportedReviewsStep } from "./steps/dedupe-imported-reviews"
import type { ProductReviewImportItem } from "./types"

export const importProductReviewsWorkflowId = "import-product-reviews"

export const importProductReviewsWorkflow = createWorkflow(
  importProductReviewsWorkflowId,
  (input: { reviews: ProductReviewImportItem[] }) => {
    // The entire batch is validated before any write happens, and the
    // validated output is chained into the next step so dedupe/create cannot
    // run before validation completes (parallel step execution would defeat
    // the guard).
    const validated = assertReviewTargetsStep(input.reviews)

    const deduped = dedupeImportedReviewsStep(validated)
    const created = createImportedReviewsStep(deduped.creates)

    const summary = transform(
      { deduped, created },
      ({ deduped, created }) => ({
        created_count: (created ?? []).length,
        skipped_duplicates_count: deduped.skipped,
        product_review_ids: (created ?? []).map((r) => r.id as string),
      }),
    )

    return new WorkflowResponse(summary)
  },
)
