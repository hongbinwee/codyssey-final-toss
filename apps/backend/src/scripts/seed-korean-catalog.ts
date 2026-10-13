/**
 * Seeds the 토스 3days Korean demo catalog: 14 products across
 * 모니터/키보드/마우스/생활용품 with KRW prices, options, stock levels,
 * and a real sale price list.
 *
 *   npx medusa exec ./src/scripts/seed-korean-catalog.ts
 *
 * Run order: `medusa db:migrate` + initial data seed, then the Korea infra
 * seed (seed-korea, worker 01: KRW region / sales channel / shipping /
 * stock location), then this script. Missing prerequisites fail fast with
 * the required run order instead of creating broken data.
 *
 * Idempotent: `toss3days-*` handles, `T3D-*` SKUs, and the sale price list
 * title are checked first; existing rows are skipped, missing inventory
 * levels are filled in. Products outside this seed are never touched.
 */
import {
  createInventoryLevelsWorkflow,
  createPriceListsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
} from "@medusajs/medusa/core-flows"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import type { ExecArgs } from "@medusajs/framework/types"
import {
  buildProductInputs,
  KOREAN_CATEGORIES,
  KOREAN_DEMO_PRODUCTS,
  SALE_PRICE_LIST,
  salePriceBySku,
  stockBySku,
  type CategoryKey,
} from "./seed-korean-catalog-data"

const seedKoreanCatalog = async ({ container }: ExecArgs) => {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const imageBase = `${
    process.env.STOREFRONT_URL ?? "http://localhost:8000"
  }/demo-products`

  // ---- Prerequisites (created by earlier seeds, never created here) -------

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name", "currency_code"],
  })
  const koreaRegion = regions.find(
    (region) => region.currency_code === "krw"
  )

  const { data: salesChannels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
  })
  const { data: stores } = await query.graph({
    entity: "store",
    fields: ["id", "default_sales_channel_id", "supported_currencies.currency_code"],
  })
  const { data: shippingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id", "name", "type"],
  })
  const { data: stockLocations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
  })

  const store = stores[0]
  const defaultSalesChannelId = store?.default_sales_channel_id as
    | string
    | undefined
  // No silent fallbacks for store default channel or Korea stock location:
  // if seed-korea (worker 01) has not run, fail fast instead of seeding the
  // catalog into the wrong channel or an unrelated warehouse.
  const salesChannel = salesChannels.find(
    (channel) => channel.id === defaultSalesChannelId
  )
  const supportsKrw = Boolean(
    (store?.supported_currencies ?? []).some(
      (currency) => currency?.currency_code === "krw"
    )
  )
  const shippingProfile =
    shippingProfiles.find((profile) => profile.type === "default") ??
    shippingProfiles[0]
  const stockLocation = stockLocations.find((location) =>
    /korea|한국/i.test(location.name ?? "")
  )

  const missing: string[] = []
  if (!koreaRegion) missing.push("KRW region")
  if (!supportsKrw) missing.push("store currency krw")
  if (!salesChannel) missing.push("store default sales channel")
  if (!shippingProfile) missing.push("shipping profile")
  if (!stockLocation) missing.push("Korea stock location")

  if (missing.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Missing prerequisites: ${missing.join(", ")}. Run medusa db:migrate, the ` +
        `initial data seed, and the Korea infra seed (seed-korea, worker 01) first.`
    )
  }

  logger.info(
    `Seeding Korean catalog into "${salesChannel!.name}" (region ${koreaRegion!.name}, ` +
      `location "${stockLocation!.name}")`
  )

  // ---- Categories ----------------------------------------------------------

  const { data: existingCategories } = await query.graph({
    entity: "product_category",
    fields: ["id", "name"],
  })
  const missingCategories = KOREAN_CATEGORIES.filter(
    (category) =>
      !existingCategories.some((existing) => existing.name === category.name)
  )

  if (missingCategories.length) {
    await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: missingCategories.map((category) => ({
          name: category.name,
          handle: category.handle,
          is_active: true,
        })),
      },
    })
    logger.info(`Created ${missingCategories.length} categor(y/ies)`)
  }

  const { data: allCategories } = await query.graph({
    entity: "product_category",
    fields: ["id", "name"],
  })
  const categoryIds = Object.fromEntries(
    KOREAN_CATEGORIES.map((category) => [
      category.key,
      allCategories.find((row) => row.name === category.name)?.id,
    ])
  ) as Record<CategoryKey, string>

  // ---- Products -------------------------------------------------------------

  const handles = KOREAN_DEMO_PRODUCTS.map((product) => product.handle)
  const { data: existingProducts } = await query.graph({
    entity: "product",
    fields: ["handle"],
    filters: { handle: handles },
  })
  const takenHandles = new Set(existingProducts.map((product) => product.handle))
  const toCreate = KOREAN_DEMO_PRODUCTS.filter(
    (product) => !takenHandles.has(product.handle)
  )

  if (toCreate.length) {
    const inputs = buildProductInputs(toCreate, {
      salesChannelId: salesChannel!.id,
      shippingProfileId: shippingProfile!.id,
      categoryIds,
      imageBase,
    })

    await createProductsWorkflow(container).run({
      input: { products: inputs as never },
    })
    logger.info(`Created ${toCreate.length} Korean demo product(s)`)
  } else {
    logger.info("All Korean demo products already exist. Skipping creation.")
  }

  // ---- Inventory levels ------------------------------------------------------
  // createProductsWorkflow already made an inventory item per variant (sku is
  // copied over). Fill in levels only where this location has none, so a
  // re-run after a partial failure converges instead of erroring.

  const allSkus = [...stockBySku().keys()]
  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id", "sku"],
    filters: { sku: allSkus },
  })
  const { data: existingLevels } = await query.graph({
    entity: "inventory_level",
    fields: ["inventory_item_id", "location_id"],
    filters: { location_id: stockLocation!.id },
  })
  const hasLevel = new Set(
    existingLevels.map((level) => level.inventory_item_id)
  )
  const stock = stockBySku()
  const levelsToCreate = inventoryItems
    .filter((item) => item.id && !hasLevel.has(item.id))
    .map((item) => ({
      inventory_item_id: item.id as string,
      location_id: stockLocation!.id,
      stocked_quantity: stock.get(item.sku ?? "") ?? 0,
    }))

  if (levelsToCreate.length) {
    await createInventoryLevelsWorkflow(container).run({
      input: { inventory_levels: levelsToCreate },
    })
  }
  logger.info(
    `Inventory: ${inventoryItems.length} item(s), ${levelsToCreate.length} level(s) created.`
  )

  // ---- Sale price list ---------------------------------------------------------

  const saleSkus = [...salePriceBySku().keys()]
  const { data: existingPriceLists } = await query.graph({
    entity: "price_list",
    fields: ["id", "title"],
  })
  const saleExists = existingPriceLists.some(
    (list) => list.title === SALE_PRICE_LIST.title
  )

  if (saleSkus.length && !saleExists) {
    const { data: saleVariants } = await query.graph({
      entity: "product_variant",
      fields: ["id", "sku"],
      filters: { sku: saleSkus },
    })
    const salePrices = salePriceBySku()

    if (saleVariants.length !== saleSkus.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Sale variants missing: expected ${saleSkus.length}, found ${saleVariants.length}.`
      )
    }

    await createPriceListsWorkflow(container).run({
      input: {
        price_lists_data: [
          {
            title: SALE_PRICE_LIST.title,
            description: SALE_PRICE_LIST.description,
            status: "active",
            starts_at: "2026-01-01T00:00:00.000Z",
            prices: saleVariants.map((variant) => ({
              variant_id: variant.id,
              currency_code: "krw",
              amount: salePrices.get(variant.sku ?? "")!,
            })),
          },
        ],
      },
    })
    logger.info(`Created sale price list "${SALE_PRICE_LIST.title}".`)
  } else {
    logger.info("Sale price list already exists or has no variants. Skipping.")
  }

  // ---- Search index (optional module) -------------------------------------------

  const search = container.resolve(Modules.SEARCH, { allowUnregistered: true })
  if (search) {
    const { data: seeded } = await query.graph({
      entity: "product",
      fields: ["id"],
      filters: { handle: handles },
    })
    await search.ingest({
      name: "product.created",
      data: seeded.map((product) => ({ id: product.id })),
    } as never)
    logger.info(`Search index updated for ${seeded.length} product(s).`)
  }

  // ---- Summary ---------------------------------------------------------------------

  const edgeCases = KOREAN_DEMO_PRODUCTS.filter(
    (product) => product.scenario !== "normal"
  ).map(
    (product) =>
      `${product.handle} [${product.scenario}]` +
      (product.salePrice ? ` sale ${product.salePrice}` : "") +
      (product.variants.every((v) => v.stock <= 5)
        ? ` stock ${product.variants.map((v) => v.stock).join("/")}`
        : "")
  )
  logger.info(
    `Done. ${KOREAN_DEMO_PRODUCTS.length} products. Edge cases: ${edgeCases.join("; ")}`
  )
}

export default seedKoreanCatalog
