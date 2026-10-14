import { listProducts } from "@lib/data/products"
import { getProductReviewStats } from "@lib/data/reviews"
import { EMPTY_REVIEW_SUMMARY } from "@lib/commerce-contracts"
import { hasRegionPrice } from "@lib/util/get-product-price"
import { HttpTypes } from "@medusajs/types"
import { Text } from "@modules/common/components/ui"

import InteractiveLink from "@modules/common/components/interactive-link"
import ProductPreview from "@modules/products/components/product-preview"

export default async function ProductRail({
  collection,
  region,
}: {
  collection: HttpTypes.StoreCollection
  region: HttpTypes.StoreRegion
}) {
  const {
    response: { products: pricedProducts },
  } = await listProducts({
    regionId: region.id,
    queryParams: {
      collection_id: collection.id,
      fields: "*variants.calculated_price",
    },
  })

  const products = (pricedProducts ?? []).filter(hasRegionPrice)

  if (!products.length) {
    return null
  }

  const reviewStats = await getProductReviewStats(products.map((p) => p.id))

  return (
    <div className="content-container py-12 small:py-24">
      <div className="flex justify-between mb-8">
        <Text className="txt-xlarge">{collection.title}</Text>
        <InteractiveLink href={`/collections/${collection.handle}`}>
          모두 보기
        </InteractiveLink>
      </div>
      <ul className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-4 gap-x-4 gap-y-8">
        {products.map((product) => (
          <li key={product.id}>
            <ProductPreview
              product={product}
              region={region}
              isFeatured
              reviewSummary={
                reviewStats
                  ? reviewStats[product.id] ?? EMPTY_REVIEW_SUMMARY
                  : undefined
              }
              reviewSummaryStatus={reviewStats === null ? "error" : "ready"}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
