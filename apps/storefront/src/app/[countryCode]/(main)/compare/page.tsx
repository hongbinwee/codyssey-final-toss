import { listProducts } from "@lib/data/products"
import { getProductReviewStats } from "@lib/data/reviews"
import ComparisonTable from "@modules/products/components/comparison-table"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { notFound } from "next/navigation"

export const metadata = { title: "상품 비교 | 3days 쇼핑" }
export default async function ComparePage({ params, searchParams }: { params: Promise<{ countryCode: string }>; searchParams: Promise<{ products?: string; variants?: string }> }) {
  const { countryCode } = await params
  const query = await searchParams
  const handles = Array.from(new Set((query.products ?? "").split(",").filter(Boolean))).slice(0, 4)
  const selectedVariants = (query.variants ?? "").split(",")
  if (handles.length < 2) return <main className="content-container py-10"><h1 className="text-2xl font-semibold">상품 비교</h1><p className="mt-4">비교할 상품을 2개 이상 선택해주세요.</p><LocalizedClientLink href="/store" className="mt-4 inline-block text-ui-fg-interactive">상품 보기</LocalizedClientLink></main>
  const { response: { products } } = await listProducts({ countryCode, queryParams: { handle: handles, limit: 4, fields: "id,title,handle,metadata,*variants,*variants.calculated_price,*variants.options,+variants.inventory_quantity" } })
  if (products.length !== handles.length) notFound()
  const stats = await getProductReviewStats(products.map(p => p.id))
  const items = handles.map((handle, index) => {
    const product = products.find(p => p.handle === handle)!
    const requested = selectedVariants[index]
    const variant = requested ? product.variants?.find(v => v.id === requested) : product.variants?.[0]
    if (requested && !variant) notFound()
    return { product, variant: variant ?? null, reviewStat: stats?.[product.id] }
  })
  return <main className="content-container py-10 text-ui-fg-base"><h1 className="mb-6 text-2xl font-semibold">상품 비교</h1><ComparisonTable items={items} /></main>
}
