import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { updateProductsWorkflow, updateProductVariantsWorkflow } from "@medusajs/medusa/core-flows"
import type { ExecArgs } from "@medusajs/framework/types"
import { isDeepStrictEqual } from "node:util"
import { buildSpecPatchInputs } from "./catalog-spec-contract"
import { KOREAN_DEMO_PRODUCTS } from "./seed-korean-catalog-data"

/** Local demo enrichment only; preserves external metadata and never touches the shared DB. */
export default async function seedStructuredSpecs({ container }: ExecArgs) {
  const url = new URL(process.env.DATABASE_URL ?? "http://invalid")
  if (url.pathname !== "/toss3days_review_spike_20261014" || url.port !== "55432" || !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Structured demo specs require the isolated review DB")
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const patches = buildSpecPatchInputs()
  const { data: products } = await query.graph({
    entity: "product", fields: ["id", "handle", "title", "description", "metadata", "variants.id", "variants.sku", "variants.metadata"],
    filters: { handle: patches.map(p => p.handle) },
  })
  const productUpdates: any[] = []
  const variantUpdates: any[] = []
  for (const patch of patches) {
    const product = products.find(p => p.handle === patch.handle)
    const source = KOREAN_DEMO_PRODUCTS.find(p => p.handle === patch.handle)!
    if (!product || product.title !== source.title || product.description !== source.description) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Demo source mismatch: " + patch.handle)
    }
    const existing = product.metadata?.specs as { schema_version?: string; spec_source?: string } | undefined
    if (!existing || (existing.schema_version === "catalog-spec-v1" && existing.spec_source === "seed_demo_text" && !isDeepStrictEqual(existing, patch.product_metadata_patch.specs))) productUpdates.push({ id: product.id, metadata: { ...product.metadata, ...patch.product_metadata_patch } })
    for (const variantPatch of patch.variant_metadata_patches) {
      const variant = product.variants?.find(v => v.sku === variantPatch.sku)
      if (!variant) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Variant source mismatch: " + variantPatch.sku)
      const variantSpecs = variant.metadata?.specs as { schema_version?: string; spec_source?: string } | undefined
      if (!variantSpecs || (variantSpecs.schema_version === "catalog-spec-v1" && variantSpecs.spec_source === "seed_demo_text" && !isDeepStrictEqual(variantSpecs, variantPatch.metadata_patch.specs))) variantUpdates.push({ id: variant.id, metadata: { ...variant.metadata, ...variantPatch.metadata_patch } })
    }
  }
  if (productUpdates.length) await updateProductsWorkflow(container).run({ input: { products: productUpdates } })
  if (variantUpdates.length) await updateProductVariantsWorkflow(container).run({ input: { product_variants: variantUpdates } })
  console.log(JSON.stringify({ productsUpdated: productUpdates.length, variantsUpdated: variantUpdates.length, database: url.pathname.slice(1), existingSpecsPreserved: true }))
}
