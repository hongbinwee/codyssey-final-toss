import { Text } from "@modules/common/components/ui"
import { ProductReviewSummary } from "@lib/commerce-contracts"
import { getProductPrice } from "@lib/util/get-product-price"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import RatingSummary from "../reviews/rating-summary"
import Thumbnail from "../thumbnail"
import PreviewPrice from "./price"

export default async function ProductPreview({
  product,
  isFeatured,
  region: _region,
  reviewSummary,
  reviewSummaryStatus = "ready",
}: {
  product: HttpTypes.StoreProduct
  isFeatured?: boolean
  region: HttpTypes.StoreRegion
  /**
   * 상위 목록이 배치 조회해 전달하는 후기 요약.
   * undefined면 후기 영역을 렌더하지 않는다. 0건이면 '후기 없음'을 표시한다.
   */
  reviewSummary?: ProductReviewSummary | null
  reviewSummaryStatus?: "ready" | "error"
}) {
  // const pricedProduct = await listProducts({
  //   regionId: region.id,
  //   queryParams: { id: [product.id!] },
  // }).then(({ response }) => response.products[0])

  // if (!pricedProduct) {
  //   return null
  // }

  const { cheapestPrice } = getProductPrice({
    product,
  })

  return (
    <LocalizedClientLink href={`/products/${product.handle}`} className="group">
      <div data-testid="product-wrapper">
        <Thumbnail
          thumbnail={product.thumbnail}
          images={product.images}
          size="square"
          isFeatured={isFeatured}
        />
        <div className="mt-3 flex flex-col gap-y-1">
          <Text
            className="text-ui-fg-base line-clamp-2 text-sm leading-5"
            data-testid="product-title"
          >
            {product.title}
          </Text>
          {(reviewSummary !== undefined || reviewSummaryStatus === "error") && (
            <RatingSummary
              summary={reviewSummary ?? null}
              status={reviewSummaryStatus}
              size="small"
            />
          )}
          <div className="flex items-baseline gap-x-1.5 flex-wrap">
            {cheapestPrice && <PreviewPrice price={cheapestPrice} />}
          </div>
        </div>
      </div>
    </LocalizedClientLink>
  )
}
