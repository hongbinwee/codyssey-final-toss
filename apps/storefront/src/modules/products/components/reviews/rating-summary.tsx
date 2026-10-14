import { clx } from "@modules/common/components/ui"
import { ProductReviewSummary } from "@lib/commerce-contracts"

import RatingStars from "./rating-stars"

export type RatingSummaryStatus = "ready" | "loading" | "error"

type RatingSummaryProps = {
  summary?: ProductReviewSummary | null
  status?: RatingSummaryStatus
  size?: "small" | "medium"
  /** 리뷰 0건일 때 '후기 없음' 텍스트를 보여줄지 여부(기본 true) */
  showEmptyText?: boolean
  className?: string
}

const RatingSummary = ({
  summary,
  status = "ready",
  size = "medium",
  showEmptyText = true,
  className,
}: RatingSummaryProps) => {
  const textSize = size === "small" ? "text-xs" : "text-sm"

  if (status === "loading") {
    return (
      <span
        className={clx(
          "inline-block h-3.5 w-20 animate-pulse rounded bg-ui-bg-subtle",
          className
        )}
        aria-hidden={true}
      />
    )
  }

  if (status === "error") {
    return (
      <span className={clx("text-ui-fg-muted", textSize, className)}>
        {size === "small" ? "후기 미조회" : "후기 정보를 불러오지 못했어요."}
      </span>
    )
  }

  const hasRating =
    summary != null &&
    summary.review_count > 0 &&
    typeof summary.average_rating === "number"

  if (!hasRating) {
    return showEmptyText ? (
      <span className={clx("text-ui-fg-muted", textSize, className)}>
        후기 없음
      </span>
    ) : null
  }

  const average = summary!.average_rating!
  const count = summary!.review_count

  return (
    <span
      className={clx("inline-flex items-center gap-x-1.5", className)}
      data-testid="review-summary"
    >
      <RatingStars value={average} />
      <span
        className={clx("font-semibold text-ui-fg-base", textSize)}
        data-testid="review-average"
      >
        {average.toFixed(1)}
      </span>
      <span
        className={clx("text-ui-fg-muted", textSize)}
        data-testid="review-count"
      >
        {size === "small" ? `(${count})` : `후기 ${count}개`}
      </span>
    </span>
  )
}

export default RatingSummary
