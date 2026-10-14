"use client"
import { specRows } from "@lib/catalog-specs"
import type { HttpTypes } from "@medusajs/types"
import { useSearchParams } from "next/navigation"

export default function ProductSpecs({ product, variantId }: { product: HttpTypes.StoreProduct; variantId?: string | null }) {
  const params = useSearchParams()
  const selectedId = params.get("v_id")
  const variant = product.variants?.find(v => v.id === selectedId) ?? (product.variants?.length === 1 ? product.variants[0] : undefined)
  const rows = specRows(product.metadata, variant?.metadata)
  return <section data-testid="product-specs" aria-label="상품 스펙" className="mt-6">
    <h2 className="text-base font-semibold text-ui-fg-base">상품 스펙</h2>
    {variant && <p className="mt-2 text-sm text-ui-fg-muted">선택 옵션: {variant.title}</p>}
    {!rows.length ? <p className="mt-3 text-sm text-ui-fg-muted">확인된 스펙이 없어요.</p> : <dl className="mt-3 divide-y divide-ui-border-base">
      {rows.map(row => <div key={row.key} className="flex justify-between gap-3 py-2 text-sm"><dt className="text-ui-fg-muted">{row.label}</dt><dd className="text-right text-ui-fg-base" data-spec-key={row.key}>{row.value}</dd></div>)}
    </dl>}
  </section>
}
