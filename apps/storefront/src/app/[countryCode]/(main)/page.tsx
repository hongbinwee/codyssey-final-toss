import { Metadata } from "next"

import FeaturedProducts from "@modules/home/components/featured-products"
import Hero from "@modules/home/components/hero"
import { listCollections } from "@lib/data/collections"
import { getProductReviewStats } from "@lib/data/reviews"
import { EMPTY_REVIEW_SUMMARY } from "@lib/commerce-contracts"
import { getRegion } from "@lib/data/regions"
import { listProducts } from "@lib/data/products"
import ProductPreview from "@modules/products/components/product-preview"
import InteractiveLink from "@modules/common/components/interactive-link"
import { hasRegionPrice } from "@lib/util/get-product-price"

export const metadata: Metadata = {
  title: "3days 쇼핑",
  description: "실제 주문까지 되는 데모 스토어",
}

export default async function Home(props: {
  params: Promise<{ countryCode: string }>
}) {
  const params = await props.params

  const { countryCode } = params

  const region = await getRegion(countryCode)

  const { collections } = await listCollections({
    fields: "id, handle, title",
  })

  const { response } = await listProducts({
    queryParams: {
      limit: 12,
      fields: "*variants.calculated_price",
    },
    countryCode,
  }).catch(() => ({ response: { products: [] } }))

  // 지역 통화로 가격이 계산되지 않는 상품(예: EUR 전용 시드 상품)은 구매할 수
  // 없으므로 홈 목록에서 제외한다.
  const products = response.products.filter(hasRegionPrice)

  if (!region) {
    return null
  }

  const reviewStats = await getProductReviewStats(products.map((p) => p.id))

  return (
    <>
      <Hero />
      <div className="py-12">
        <ul className="flex flex-col gap-x-6">
          {collections && collections.length > 0 && (
            <FeaturedProducts collections={collections} region={region} />
          )}
        </ul>
        <div className="content-container pb-16">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl-semi text-ui-fg-base">지금 판매 중인 상품</h2>
            <InteractiveLink href="/store">모두 보기</InteractiveLink>
          </div>
          {products.length > 0 ? (
            <ul
              className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-4 gap-x-4 gap-y-8"
              data-testid="home-products-list"
            >
              {products.map((product) => (
                <li key={product.id}>
                  <ProductPreview
                    product={product}
                    region={region}
                    reviewSummary={
                      reviewStats
                        ? reviewStats[product.id] ?? EMPTY_REVIEW_SUMMARY
                        : undefined
                    }
                    reviewSummaryStatus={
                      reviewStats === null ? "error" : "ready"
                    }
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-16 text-center text-ui-fg-subtle">
              아직 등록된 상품이 없어요
            </p>
          )}
        </div>
      </div>
    </>
  )
}
