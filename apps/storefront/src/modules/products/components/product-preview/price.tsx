import { Text, clx } from "@modules/common/components/ui"
import { VariantPrice } from "types/global"

export default async function PreviewPrice({ price }: { price: VariantPrice }) {
  if (!price) {
    return null
  }

  return (
    <>
      {price.price_type === "sale" && (
        <Text
          className="text-ui-tag-red-text font-bold"
          data-testid="price-percentage"
        >
          {price.percentage_diff}%
        </Text>
      )}
      <Text
        className={clx("text-ui-fg-base font-semibold")}
        data-testid="price"
      >
        {price.calculated_price}
      </Text>
      {price.price_type === "sale" && (
        <Text
          className="line-through text-ui-fg-muted text-small-regular"
          data-testid="original-price"
        >
          {price.original_price}
        </Text>
      )}
    </>
  )
}
