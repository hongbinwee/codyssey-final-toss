"use client"
import { useSearchParams } from "next/navigation"
import type { HttpTypes } from "@medusajs/types"
import ImageGallery from "../image-gallery"

export default function VariantImageGallery({ product, images }: { product: HttpTypes.StoreProduct; images: HttpTypes.StoreProductImage[] }) {
  const params = useSearchParams()
  const variant = product.variants?.find(v => v.id === params.get("v_id")) ?? (product.variants?.length === 1 ? product.variants[0] : undefined)
  const ids = new Set(variant?.images?.map(image => image.id))
  const selected = ids.size ? (product.images ?? []).filter(image => ids.has(image.id)) : product.images ?? images
  return <ImageGallery images={selected} />
}
