import { StarSolid } from "@medusajs/icons"
import { clx } from "@modules/common/components/ui"

type RatingStarsProps = {
  /** 0~5. 소수점은 부분 채움으로 표시한다 */
  value: number
  sizeClassName?: string
  className?: string
}

const RatingStars = ({
  value,
  sizeClassName = "h-3.5 w-3.5",
  className,
}: RatingStarsProps) => {
  const clamped = Math.max(0, Math.min(5, value))
  const percent = (clamped / 5) * 100

  return (
    <span
      role="img"
      aria-label={`5점 만점에 ${clamped}점`}
      className={clx("relative inline-flex shrink-0 align-middle", className)}
    >
      <span className="flex gap-x-0.5 text-grey-30" aria-hidden={true}>
        {Array.from({ length: 5 }).map((_, i) => (
          <StarSolid key={i} className={sizeClassName} />
        ))}
      </span>
      <span
        className="absolute inset-y-0 left-0 overflow-hidden text-amber-400"
        style={{ width: `${percent}%` }}
        aria-hidden={true}
      >
        <span className="flex w-max gap-x-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <StarSolid key={i} className={sizeClassName} />
          ))}
        </span>
      </span>
    </span>
  )
}

export default RatingStars
