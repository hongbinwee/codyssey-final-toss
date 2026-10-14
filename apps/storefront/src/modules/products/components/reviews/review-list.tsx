"use client"

import { useMemo, useState } from "react"

import NativeSelect from "@modules/common/components/native-select"
import { Button, clx } from "@modules/common/components/ui"
import {
  ProductReviewSort,
  StoreProductReview,
} from "@lib/commerce-contracts"

import ReviewItem from "./review-item"

const SORT_OPTIONS: { value: ProductReviewSort; label: string }[] = [
  { value: "newest", label: "최신순" },
  { value: "rating_desc", label: "평점 높은 순" },
  { value: "rating_asc", label: "평점 낮은 순" },
]

export type ReviewListStatus = "loading" | "error" | "ready"

type ReviewListProps = {
  reviews: StoreProductReview[]
  /** 전체 후기 수. 생략하면 reviews.length */
  total?: number
  /** 페이지 크기(기본 10, 서버 최대 50) */
  limit?: number
  /** 서버 페이징 사용 시 현재 offset. onPageChange와 함께 사용 */
  offset?: number
  /** 서버 정렬 사용 시 현재 정렬. onSortChange와 함께 사용 */
  sort?: ProductReviewSort
  status?: ReviewListStatus
  errorMessage?: string | null
  /** 0건일 때 문구를 바꾸고 싶으면 전달(예: 옵션 필터) */
  emptyMessage?: string
  onSortChange?: (sort: ProductReviewSort) => void
  onPageChange?: (offset: number) => void
  onRetry?: () => void
}

const timestamp = (iso: string) => {
  const time = new Date(iso).getTime()
  return Number.isNaN(time) ? 0 : time
}

const sortReviews = (
  reviews: StoreProductReview[],
  sort: ProductReviewSort
): StoreProductReview[] => {
  const sorted = [...reviews]
  if (sort === "rating_desc") {
    sorted.sort(
      (a, b) =>
        b.rating - a.rating ||
        timestamp(b.written_at) - timestamp(a.written_at)
    )
  } else if (sort === "rating_asc") {
    sorted.sort(
      (a, b) =>
        a.rating - b.rating ||
        timestamp(b.written_at) - timestamp(a.written_at)
    )
  } else {
    sorted.sort(
      (a, b) => timestamp(b.written_at) - timestamp(a.written_at)
    )
  }
  return sorted
}

const ReviewList = ({
  reviews,
  total,
  limit = 10,
  offset,
  sort,
  status = "ready",
  errorMessage,
  emptyMessage,
  onSortChange,
  onPageChange,
  onRetry,
}: ReviewListProps) => {
  const [internalSort, setInternalSort] = useState<ProductReviewSort>(
    sort ?? "newest"
  )
  const [internalOffset, setInternalOffset] = useState(0)

  const resolvedSort = onSortChange ? (sort ?? "newest") : internalSort
  const resolvedOffset = onPageChange ? (offset ?? 0) : internalOffset
  const resolvedTotal = total ?? reviews.length

  const visibleReviews = useMemo(() => {
    if (onPageChange) {
      // 서버가 정렬·페이징한 결과를 그대로 표시한다
      return reviews
    }
    return sortReviews(reviews, resolvedSort).slice(
      resolvedOffset,
      resolvedOffset + limit
    )
  }, [reviews, resolvedSort, resolvedOffset, limit, onPageChange])

  const handleSortChange = (value: string) => {
    const next = value as ProductReviewSort
    if (onSortChange) {
      onSortChange(next)
    } else {
      setInternalSort(next)
      setInternalOffset(0)
    }
  }

  const handlePageChange = (nextOffset: number) => {
    if (onPageChange) {
      onPageChange(nextOffset)
    } else {
      setInternalOffset(nextOffset)
    }
  }

  if (status === "loading") {
    return (
      <div
        className="flex flex-col gap-y-4 py-4"
        data-testid="reviews-loading"
        aria-busy={true}
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-md bg-ui-bg-subtle"
          />
        ))}
      </div>
    )
  }

  if (status === "error") {
    return (
      <div
        className="flex flex-col items-start gap-y-3 py-6"
        data-testid="reviews-error"
      >
        <p className="text-sm text-ui-fg-error">
          후기를 불러오지 못했어요.
          {errorMessage ? ` ${errorMessage}` : " 다시 시도해주세요."}
        </p>
        {onRetry && (
          <Button variant="secondary" size="small" onClick={onRetry}>
            다시 시도
          </Button>
        )}
      </div>
    )
  }

  const totalPages = Math.max(1, Math.ceil(resolvedTotal / limit))
  const currentPage = Math.floor(resolvedOffset / limit) + 1
  const windowStart = Math.max(
    1,
    Math.min(currentPage - 2, Math.max(1, totalPages - 4))
  )
  const windowPages = Array.from(
    { length: Math.min(5, totalPages) },
    (_, i) => windowStart + i
  ).filter((p) => p <= totalPages)

  return (
    <div data-testid="review-list">
      <div className="flex items-center justify-between gap-x-4">
        <span className="text-sm text-ui-fg-muted">
          {resolvedTotal > 0 ? `후기 ${resolvedTotal}개` : "후기"}
        </span>
        <NativeSelect
          aria-label="후기 정렬"
          className="w-32"
          value={resolvedSort}
          onChange={(e) => handleSortChange(e.target.value)}
          data-testid="review-sort"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      {resolvedTotal === 0 ? (
        <p
          className="py-10 text-center text-sm text-ui-fg-subtle"
          data-testid="review-empty"
        >
          {emptyMessage ?? "아직 작성된 후기가 없어요."}
        </p>
      ) : (
        <div>
          {visibleReviews.map((review) => (
            <ReviewItem key={review.id} review={review} />
          ))}
          {visibleReviews.length === 0 && (
            <p className="py-10 text-center text-sm text-ui-fg-subtle">
              이 페이지에는 후기가 없어요.
            </p>
          )}
        </div>
      )}

      {totalPages > 1 && (
        <nav
          className="mt-6 flex items-center justify-center gap-x-4"
          aria-label="후기 페이지"
        >
          <button
            type="button"
            className="text-sm text-ui-fg-muted enabled:hover:text-ui-fg-base disabled:opacity-40"
            disabled={currentPage <= 1}
            onClick={() => handlePageChange((currentPage - 2) * limit)}
          >
            이전
          </button>
          {windowPages.map((page) => (
            <button
              key={page}
              type="button"
              aria-current={page === currentPage ? "page" : undefined}
              className={clx("text-sm text-ui-fg-muted", {
                "font-semibold text-ui-fg-base": page === currentPage,
              })}
              disabled={page === currentPage}
              onClick={() => handlePageChange((page - 1) * limit)}
            >
              {page}
            </button>
          ))}
          <button
            type="button"
            className="text-sm text-ui-fg-muted enabled:hover:text-ui-fg-base disabled:opacity-40"
            disabled={currentPage >= totalPages}
            onClick={() => handlePageChange(currentPage * limit)}
            data-testid="review-page-next"
          >
            다음
          </button>
        </nav>
      )}
    </div>
  )
}

export default ReviewList
