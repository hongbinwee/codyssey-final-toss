import { Badge } from "@modules/common/components/ui"
import { StoreProductReview } from "@lib/commerce-contracts"

import RatingStars from "./rating-stars"

type ReviewItemProps = {
  review: StoreProductReview
}

const formatDate = (iso: string) => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date)
}

const SOURCE_LABELS: Record<string, string> = {
  amazon: "Amazon 수집",
}

// source_ref는 외부에서 온 URL일 수 있으므로 http(s)만 링크로 연다
const toSafeHttpUrl = (value?: string | null): string | null => {
  if (!value) {
    return null
  }
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null
  } catch {
    return null
  }
}

const ReviewItem = ({ review }: ReviewItemProps) => {
  const isSynthetic = review.is_synthetic || review.source === "synthetic"
  const sourceBadge =
    review.source && review.source !== "native" && !isSynthetic
      ? (SOURCE_LABELS[review.source] ?? `${review.source} 수집`)
      : null
  const sourceUrl = toSafeHttpUrl(review.source_ref)

  return (
    <article
      className="flex flex-col gap-y-2 border-b border-ui-border-base py-5 last:border-0"
      data-testid="review-item"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <RatingStars value={review.rating} />
        <span className="text-sm font-semibold text-ui-fg-base">
          {review.rating}점
        </span>
        {review.title && (
          <span className="text-sm font-semibold text-ui-fg-base">
            {review.title}
          </span>
        )}
      </div>
      <p className="text-sm leading-6 text-ui-fg-base whitespace-pre-line">
        {review.body}
      </p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ui-fg-muted">
        <time dateTime={review.written_at}>{formatDate(review.written_at)}</time>
        {/* 구매 인증은 우리 스토어의 구매 확인일 때만 표시한다.
            외부 수집 리뷰의 verified 표시와 혼동하지 않기 위함 */}
        {review.verified_purchase === true && review.source === "native" && (
          <Badge color="green">구매 인증</Badge>
        )}
        {sourceBadge &&
          (sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex"
              data-testid="review-source-link"
            >
              <Badge color="grey">{sourceBadge}</Badge>
            </a>
          ) : (
            <Badge color="grey">{sourceBadge}</Badge>
          ))}
        {isSynthetic && <Badge color="orange">테스트 데이터</Badge>}
      </div>
    </article>
  )
}

export default ReviewItem
