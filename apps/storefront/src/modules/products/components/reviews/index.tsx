"use client"

import { useEffect, useState } from "react"

import {
  ProductReviewSort,
  StoreProductReviewListResponse,
} from "@lib/commerce-contracts"
import { fetchProductReviews, REVIEW_PAGE_SIZE } from "@lib/data/reviews-client"
import { Checkbox, Heading } from "@modules/common/components/ui"

import RatingSummary from "./rating-summary"
import ReviewList, { ReviewListStatus } from "./review-list"

export type {
  ProductReviewSort,
  ProductReviewSummary,
  StoreProductReview,
  StoreProductReviewListResponse,
} from "@lib/commerce-contracts"

type ProductReviewsProps = {
  productId: string
  /** 현재 선택된 옵션(v_id). 있으면 옵션별 후기 필터를 제공한다 */
  variantId?: string | null
}

type FetchState = {
  status: ReviewListStatus
  data: StoreProductReviewListResponse | null
  errorMessage: string | null
}

const ProductReviews = ({ productId, variantId }: ProductReviewsProps) => {
  const [sort, setSort] = useState<ProductReviewSort>("newest")
  const [offset, setOffset] = useState(0)
  const [variantOnly, setVariantOnly] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<FetchState>({
    status: "loading",
    data: null,
    errorMessage: null,
  })

  const effectiveVariantId = variantOnly ? variantId : null

  useEffect(() => {
    let cancelled = false
    setState((prev) => ({ ...prev, status: "loading", errorMessage: null }))

    fetchProductReviews({
      productId,
      sort,
      offset,
      limit: REVIEW_PAGE_SIZE,
      variantId: effectiveVariantId,
    })
      .then((data) => {
        if (!cancelled) {
          setState({ status: "ready", data, errorMessage: null })
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            status: "error",
            data: null,
            errorMessage:
              error instanceof Error && error.message ? error.message : null,
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [productId, sort, offset, effectiveVariantId, reloadKey])

  const handleSortChange = (next: ProductReviewSort) => {
    setSort(next)
    setOffset(0)
  }

  const summary = state.data?.summary ?? null
  const reviewCount = summary?.review_count ?? state.data?.count ?? 0

  return (
    <section aria-labelledby="product-reviews-heading">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <Heading level="h2" id="product-reviews-heading" className="text-xl">
          상품 후기
        </Heading>
        {state.status === "ready" && reviewCount > 0 && (
          <span className="text-sm text-ui-fg-muted">
            {/* summary/count는 같은 필터 범위의 응답값이라 옵션 후기 수와
                전체 후기 수를 섞지 않는다 */}
            {variantOnly && variantId
              ? `선택한 옵션 후기 ${reviewCount}개`
              : `후기 ${reviewCount}개`}
          </span>
        )}
      </div>

      <div className="mt-3" data-testid="product-review-summary">
        <RatingSummary summary={summary} status={state.status} />
      </div>

      {variantId && (
        <div className="mt-3 flex flex-col gap-y-1">
          <Checkbox
            id="product-reviews-variant-only"
            label="선택한 옵션의 후기만 보기"
            checked={variantOnly}
            onChange={(e) => {
              setVariantOnly(e.target.checked)
              setOffset(0)
            }}
          />
          {variantOnly && (
            <p className="text-xs text-ui-fg-muted">
              선택한 옵션에 달린 후기만 표시해요.
            </p>
          )}
        </div>
      )}

      <div className="mt-2">
        <ReviewList
          reviews={state.data?.reviews ?? []}
          total={state.data?.count ?? 0}
          limit={REVIEW_PAGE_SIZE}
          offset={offset}
          sort={sort}
          status={state.status}
          errorMessage={state.errorMessage}
          emptyMessage={
            variantOnly ? "선택한 옵션에는 아직 후기가 없어요." : undefined
          }
          onSortChange={handleSortChange}
          onPageChange={setOffset}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      </div>
    </section>
  )
}

export default ProductReviews
