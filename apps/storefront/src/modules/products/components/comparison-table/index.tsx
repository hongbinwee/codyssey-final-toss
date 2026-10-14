import type { HttpTypes } from "@medusajs/types"
import { specRows } from "@lib/catalog-specs"
import { convertToLocale } from "@lib/util/money"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import RatingSummary from "../reviews/rating-summary"
import type { ProductReviewStat } from "@lib/commerce-contracts"

export type ComparisonItem = { product: HttpTypes.StoreProduct; variant: HttpTypes.StoreProductVariant | null; reviewStat?: ProductReviewStat }
export default function ComparisonTable({ items }: { items: ComparisonItem[] }) {
  const rows = items.map(item => specRows(item.product.metadata, item.variant?.metadata))
  const labels = new Map(rows.flat().map(row => [row.key, row.label]))
  return <div className="max-w-full overflow-x-auto" data-testid="comparison-table">
    <table className="w-full min-w-[540px] border-collapse text-left text-sm"><caption className="mb-3 text-left text-ui-fg-muted">선택한 옵션의 가격과 확인된 스펙을 비교해요. 구매 전 가격·재고를 다시 확인해주세요.</caption>
      <thead><tr><th className="p-3">비교 항목</th>{items.map(item => <th key={item.product.id} className="min-w-48 p-3"><LocalizedClientLink className="text-ui-fg-interactive" href={`/products/${item.product.handle}${item.variant ? "?v_id=" + item.variant.id : ""}`}>{item.product.title}</LocalizedClientLink></th>)}</tr></thead>
      <tbody>
        <tr className="border-t border-ui-border-base"><th className="p-3">옵션</th>{items.map(item => <td key={item.product.id} className="p-3" data-testid="comparison-variant">{item.variant?.title ?? "옵션 미선택"}</td>)}</tr>
        <tr className="border-t border-ui-border-base"><th className="p-3">가격</th>{items.map(item => <td key={item.product.id} className="p-3" data-testid="comparison-price">{item.variant?.calculated_price?.calculated_amount != null ? convertToLocale({ amount: item.variant.calculated_price.calculated_amount, currency_code: item.variant.calculated_price.currency_code ?? "krw" }) : "미확인"}</td>)}</tr>
        <tr className="border-t border-ui-border-base"><th className="p-3">평점 · 후기</th>{items.map(item => <td key={item.product.id} className="p-3"><RatingSummary summary={item.reviewStat} status={item.reviewStat ? "ready" : "error"} size="small" /></td>)}</tr>
        <tr className="border-t border-ui-border-base"><th className="p-3">구매 가능 여부</th>{items.map(item => <td key={item.product.id} className="p-3">{!item.variant ? "미확인" : !item.variant.manage_inventory || item.variant.allow_backorder || (item.variant.inventory_quantity ?? 0) > 0 ? "구매 가능" : "품절"}</td>)}</tr>
        {Array.from(labels).map(([key, label]) => <tr key={key} className="border-t border-ui-border-base" data-spec-key={key}><th className="p-3 text-ui-fg-muted">{label}</th>{items.map((item, index) => <td key={item.product.id} className="p-3">{rows[index].find(row => row.key === key)?.value ?? "미확인"}</td>)}</tr>)}
      </tbody>
    </table>
  </div>
}
