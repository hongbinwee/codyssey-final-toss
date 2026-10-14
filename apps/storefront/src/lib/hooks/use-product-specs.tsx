"use client"
import { useEffect, useState } from "react"
import { sdk } from "@lib/config"
import { specRows, type SpecRow } from "@lib/catalog-specs"

/** Existing Store API batch; search hits remain IDs, never an inventory or spec authority. */
export default function useProductSpecs(productIds: string[]) {
  const key = JSON.stringify(Array.from(new Set(productIds.filter(Boolean))).sort())
  const [state, setState] = useState<{ key: string; map: Record<string, SpecRow[]>; error: boolean }>({ key: "", map: {}, error: false })
  useEffect(() => {
    let cancelled = false
    const ids: string[] = JSON.parse(key)
    if (!ids.length) return
    sdk.client.fetch<{ products: { id: string; metadata?: Record<string, unknown> | null }[] }>("/store/products", {
      query: { id: ids, limit: ids.length, fields: "id,metadata" }, cache: "no-store",
    }).then(({ products }) => {
      if (!cancelled) setState({ key, map: Object.fromEntries(products.map(product => [product.id, specRows(product.metadata)])), error: false })
    }).catch(() => { if (!cancelled) setState({ key, map: {}, error: true }) })
    return () => { cancelled = true }
  }, [key])
  return { map: state.key === key ? state.map : {}, status: state.key !== key ? "loading" : state.error ? "error" : "ready" }
}
