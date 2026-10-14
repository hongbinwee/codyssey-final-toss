import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  getVariantAvailability,
  MedusaError,
  QueryContext,
} from "@medusajs/framework/utils"

import { requireSalesChannelIds } from "../../../workflows/product-reviews/helpers"
import {
  hasTrackedStock,
  isWithinConditionSearchBudget,
  MAX_CATALOG_PRODUCTS,
  MAX_CATALOG_VARIANTS,
  matchesConditionSearchSpecs,
  normalizeConditionSearchSpecs,
  parseConditionSearchBody,
  type ConditionSearchSpecs,
} from "./helpers"

const PAGE_SIZE = 100

type OptionRow = { value?: string | null; option?: { title?: string | null } | null }
type VariantRow = {
  id: string
  title?: string | null
  sku?: string | null
  metadata?: Record<string, unknown> | null
  manage_inventory?: boolean | null
  allow_backorder?: boolean | null
  calculated_price?: {
    calculated_amount?: number | null
    original_amount?: number | null
    currency_code?: string | null
  } | null
  options?: OptionRow[] | null
}
type ProductRow = {
  id: string
  title?: string | null
  description?: string | null
  handle?: string | null
  thumbnail?: string | null
  metadata?: Record<string, unknown> | null
  categories?: { name?: string | null }[] | null
  variants?: VariantRow[] | null
}

const containsQuery = (product: ProductRow, variant: VariantRow, query: string) => {
  if (!query) return true
  const haystack = [
    product.title,
    product.description,
    product.handle,
    ...(product.categories ?? []).map((category) => category?.name),
    variant.title,
    variant.sku,
    ...(variant.options ?? []).flatMap((option) => [option?.option?.title, option?.value]),
  ]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toLocaleLowerCase()
  return haystack.includes(query.toLocaleLowerCase())
}

const amount = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null

const mapOptions = (options: OptionRow[] | null | undefined) => {
  const mapped = (options ?? [])
    .filter((option) => typeof option?.value === "string")
    .map((option) => ({
      title: option.option?.title?.trim() || "옵션",
      value: option.value as string,
    }))
  return mapped.length ? mapped : null
}

/**
 * POST /store/product-condition-search
 *
 * Uses Medusa's Product graph, region pricing context, and channel-scoped
 * inventory availability. Conditions are evaluated per variant, never across
 * sibling variants. The response is an observed catalog snapshot; cart and
 * checkout remain authoritative for the final price and stock.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  let input
  try {
    input = parseConditionSearchBody(
      (req as unknown as { body: unknown }).body,
    )
  } catch (error) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      error instanceof Error ? error.message : "Invalid condition search request",
    )
  }

  const salesChannelIds = requireSalesChannelIds(
    req as unknown as {
      publishable_key_context?: { sales_channel_ids?: string[] }
    },
  )
  // Medusa 2.21.2's public availability helper calculates against one channel.
  if (salesChannelIds.length !== 1) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Condition search requires a publishable key with exactly one sales channel",
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [region],
  } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code"],
    filters: { id: input.region_id },
  })
  if (!region) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Region not found")
  }
  const actorId = (req as unknown as { auth_context?: { actor_id?: string } })
    .auth_context?.actor_id
  const pricingContext: {
    region_id: string
    currency_code: string
    customer?: { groups: { id: string }[] }
  } = {
    region_id: region.id,
    currency_code: region.currency_code,
  }
  if (actorId) {
    const { data: customerGroups = [] } = await query.graph({
      entity: "customer_group",
      fields: ["id"],
      filters: { customers: { id: actorId } },
    })
    pricingContext.customer = {
      groups: customerGroups.map((group) => ({ id: (group as { id: string }).id })),
    }
  }

  const {
    data: channelLinks = [],
    metadata: channelMetadata,
  } = await query.graph({
    entity: "product_sales_channel",
    fields: ["product_id"],
    filters: { sales_channel_id: salesChannelIds },
    pagination: { skip: 0, take: MAX_CATALOG_PRODUCTS + 1 },
  })
  if (
    channelLinks.length > MAX_CATALOG_PRODUCTS ||
    (typeof channelMetadata?.count === "number" &&
      channelMetadata.count > MAX_CATALOG_PRODUCTS)
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Condition search supports at most ${MAX_CATALOG_PRODUCTS} channel products`,
    )
  }
  const channelProductIds = [
    ...new Set(
      channelLinks.map((link) => (link as { product_id: string }).product_id),
    ),
  ]

  const {
    data: channelVariants = [],
    metadata: variantMetadata,
  } = channelProductIds.length
    ? await query.graph({
        entity: "product_variant",
        fields: ["id"],
        filters: { product_id: channelProductIds },
        pagination: { skip: 0, take: MAX_CATALOG_VARIANTS + 1 },
      })
    : { data: [], metadata: undefined }
  const channelVariantCount = Math.max(
    channelVariants.length,
    typeof variantMetadata?.count === "number" ? variantMetadata.count : 0,
  )
  if (!isWithinConditionSearchBudget(channelProductIds.length, channelVariantCount)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Condition search supports at most ${MAX_CATALOG_VARIANTS} channel variants`,
    )
  }

  const matches: {
    product: ProductRow
    variant: VariantRow
    specs: ConditionSearchSpecs | null
    price: number | null
    originalPrice: number | null
    quantity: number | null
    purchasable: boolean
  }[] = []
  let scannedVariants = 0

  for (let productOffset = 0; productOffset < channelProductIds.length; productOffset += PAGE_SIZE) {
    const { data = [] } = await query.graph(
      {
        entity: "product",
        fields: [
          "id",
          "title",
          "description",
          "handle",
          "thumbnail",
          "metadata",
          "status",
          "categories.name",
          "variants.id",
          "variants.title",
          "variants.sku",
          "variants.metadata",
          "variants.manage_inventory",
          "variants.allow_backorder",
          "variants.options.value",
          "variants.options.option.title",
          "variants.calculated_price.calculated_amount",
          "variants.calculated_price.original_amount",
        ],
        filters: {
          id: channelProductIds.slice(productOffset, productOffset + PAGE_SIZE),
          status: "published",
        },
        pagination: { skip: 0, take: PAGE_SIZE },
        context: {
          variants: {
            calculated_price: QueryContext(pricingContext),
          },
        },
      },
      { cache: { enable: true } },
    )

    const products = data as ProductRow[]
    scannedVariants += products.reduce(
      (count, product) => count + (product.variants?.length ?? 0),
      0,
    )
    if (!isWithinConditionSearchBudget(channelProductIds.length, scannedVariants)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Condition search supports at most ${MAX_CATALOG_VARIANTS} channel variants`,
      )
    }
    const candidates: {
      product: ProductRow
      variant: VariantRow
      specs: ConditionSearchSpecs | null
      price: number | null
      originalPrice: number | null
    }[] = []

    for (const product of products) {
      if (!product.handle) continue
      const productMetadata = product.metadata ?? null
      for (const variant of product.variants ?? []) {
        const specs = normalizeConditionSearchSpecs(
          productMetadata,
          variant.metadata,
          input.category,
        )
        if (input.category && specs?.category !== input.category) continue
        if (!matchesConditionSearchSpecs(specs, input.conditions)) continue
        if (!containsQuery(product, variant, input.query ?? "")) continue

        const calculatedPrice = amount(variant.calculated_price?.calculated_amount)
        if (input.max_price !== undefined && (calculatedPrice === null || calculatedPrice > input.max_price)) {
          continue
        }
        candidates.push({
          product,
          variant,
          specs,
          price: calculatedPrice,
          originalPrice: amount(variant.calculated_price?.original_amount),
        })
      }
    }

    const variantIds = candidates.map(({ variant }) => variant.id)
    const availability = variantIds.length
      ? await getVariantAvailability(query, {
          variant_ids: variantIds,
          sales_channel_id: salesChannelIds[0],
        })
      : {}

    for (const candidate of candidates) {
      const managesInventory = Boolean(candidate.variant.manage_inventory)
      const allowBackorder = Boolean(candidate.variant.allow_backorder)
      const available = availability[candidate.variant.id]?.availability ?? null
      const quantity = managesInventory ? available : null
      const purchasable = !managesInventory || allowBackorder || (quantity !== null && quantity > 0)
      const inStock = hasTrackedStock(managesInventory, quantity)
      if (input.in_stock_only && !inStock) continue
      matches.push({
        ...candidate,
        quantity,
        purchasable,
      })
    }

  }

  matches.sort((a, b) => {
    const titleOrder = (a.product.title ?? "").localeCompare(b.product.title ?? "")
    if (titleOrder) return titleOrder
    const variantOrder = (a.variant.title ?? "").localeCompare(b.variant.title ?? "")
    return variantOrder || a.variant.id.localeCompare(b.variant.id)
  })

  const results = matches.slice(input.offset, input.offset + input.limit).map((item) => ({
    product_id: item.product.id,
    variant_id: item.variant.id,
    handle: item.product.handle as string,
    title: item.product.title ?? "",
    thumbnail: item.product.thumbnail ?? null,
    variant_title: item.variant.title ||
      (item.variant.options ?? []).map((option) => option?.value).filter(Boolean).join(" / ") ||
      "기본 옵션",
    sku: item.variant.sku ?? null,
    options: mapOptions(item.variant.options),
    specs: item.specs,
    price: {
      calculated_amount: item.price,
      original_amount: item.originalPrice,
      currency_code: String(region.currency_code).toLowerCase(),
    },
    inventory: {
      quantity: item.quantity,
      manage_inventory: Boolean(item.variant.manage_inventory),
      allow_backorder: Boolean(item.variant.allow_backorder),
      purchasable: item.purchasable,
    },
  }))

  res.status(200).json({
    results,
    count: matches.length,
    offset: input.offset,
    limit: input.limit,
    observed_at: new Date().toISOString(),
  })
}
