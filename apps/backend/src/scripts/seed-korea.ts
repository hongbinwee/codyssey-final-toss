/**
 * Korea commerce setup — adds the Korean region (KRW), its stock location,
 * service zone and flat-rate shipping options, and wires the system payment
 * provider so the existing cart / checkout / order flow works for "kr" carts.
 *
 *   npx medusa exec ./src/scripts/seed-korea.ts
 *
 * Idempotent: every step queries its target first and creates only what is
 * missing, so the script is safe to re-run.
 *
 * Run order: "medusa db:migrate" (the official initial-data-seed creates
 * Europe, the default sales channel, the default shipping profile and the
 * publishable key) -> this script -> the Worker 03 catalog seed, which
 * queries the "Korea" region, the default sales channel, the default
 * shipping profile and the "Korea Warehouse" stock location by name.
 */
import {
  createRegionsWorkflow,
  createShippingOptionsWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"
import type { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  ModuleRegistrationName,
  Modules,
} from "@medusajs/framework/utils"

const REGION_NAME = "Korea"
const REGION_CURRENCY = "krw"
const COUNTRY_CODE = "kr"
const STOCK_LOCATION_NAME = "Korea Warehouse"
const FULFILLMENT_SET_NAME = "Korea Warehouse delivery"
const SERVICE_ZONE_NAME = "Korea"
const PAYMENT_PROVIDER = "pp_system_default"
const FULFILLMENT_PROVIDER = "manual_manual"

const SHIPPING_OPTIONS = [
  {
    name: "일반배송",
    // KRW is a zero-decimal currency: 3000 is 3,000 KRW, not minor units.
    amount: 3000,
    type: { label: "Standard", description: "일반 배송", code: "standard" },
  },
  {
    name: "무료배송",
    amount: 0,
    type: { label: "Free", description: "무료 배송", code: "free" },
  },
]

export default async function seedKorea({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const fulfillmentModuleService = container.resolve(
    ModuleRegistrationName.FULFILLMENT,
  )

  // ---- Store supported currencies ------------------------------------------
  // updateStores replaces supported_currencies wholesale, so the full list
  // (existing eur/usd + krw) is sent. Exactly one currency must stay default:
  // the Korean store's default is krw.
  const {
    data: [store],
  } = await query.graph({
    entity: "store",
    fields: [
      "id",
      "name",
      "supported_currencies.currency_code",
      "default_sales_channel_id",
    ],
  })

  if (!store) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "No store found. Run medusa db:migrate (initial-data-seed) first.",
    )
  }

  const currencies = (store.supported_currencies ?? [])
    .map((currency) => currency?.currency_code)
    .filter((code): code is string => Boolean(code))

  if (!currencies.includes(REGION_CURRENCY)) {
    await updateStoresWorkflow(container).run({
      input: {
        selector: { id: store.id },
        update: {
          supported_currencies: [
            ...currencies.map((currency_code) => ({
              currency_code,
              is_default: false,
            })),
            { currency_code: REGION_CURRENCY, is_default: true },
          ],
        },
      },
    })
    logger.info('Added "krw" to the supported currencies of ' + store.name)
  } else {
    logger.info("Store already supports krw. Skipping currency update.")
  }

  // ---- Region ----------------------------------------------------------------
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name", "currency_code"],
  })

  const koreaRegionExists = regions.some(
    (region) =>
      region.name === REGION_NAME && region.currency_code === REGION_CURRENCY,
  )

  if (!koreaRegionExists) {
    await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: REGION_NAME,
            currency_code: REGION_CURRENCY,
            countries: [COUNTRY_CODE],
            payment_providers: [PAYMENT_PROVIDER],
          },
        ],
      },
    })
    logger.info("Created the Korea region (krw, pp_system_default).")
  } else {
    logger.info("Korea region already exists. Skipping region creation.")
  }

  // ---- Tax region ----------------------------------------------------------------
  const { data: taxRegions } = await query.graph({
    entity: "tax_region",
    fields: ["id", "country_code"],
  })

  if (!taxRegions.some((region) => region.country_code === COUNTRY_CODE)) {
    await createTaxRegionsWorkflow(container).run({
      input: [{ country_code: COUNTRY_CODE, provider_id: "tp_system" }],
    })
    logger.info("Created the kr tax region (system provider, no rates).")
  } else {
    logger.info("kr tax region already exists. Skipping.")
  }

  // ---- Sales channel ----------------------------------------------------------
  // Reuse the store's default sales channel: it is already linked to the
  // publishable key and is the channel the catalog seed attaches products to.
  const defaultSalesChannelId = store.default_sales_channel_id as
    | string
    | undefined

  const { data: salesChannels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
    filters: { id: defaultSalesChannelId },
  })
  const salesChannel = salesChannels.find(
    (channel) => channel.id === defaultSalesChannelId,
  )

  if (!salesChannel) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "The store has no default sales channel. Run medusa db:migrate first.",
    )
  }

  // ---- Stock location ---------------------------------------------------------
  const { data: locations } = await query.graph({
    entity: "stock_location",
    fields: [
      "id",
      "name",
      "sales_channels.id",
      "fulfillment_providers.id",
      "fulfillment_sets.id",
    ],
  })

  // The graph row carries link arrays (sales_channels, fulfillment_*), the
  // workflow result carries fulfillment_sets as full DTOs. Keep a shared
  // partial shape so both fit without casts, then guard after creation.
  type KoreaLocation = {
    id: string
    name?: string | null
    sales_channels?: ({ id?: string | null } | null | undefined)[] | null
    fulfillment_providers?:
      | ({ id?: string | null } | null | undefined)[]
      | null
    fulfillment_sets?: ({ id?: string | null } | null | undefined)[] | null
  }

  let koreaLocation: KoreaLocation | undefined = locations.find(
    (location) => location.name === STOCK_LOCATION_NAME,
  )

  if (!koreaLocation) {
    const {
      result: [created],
    } = await createStockLocationsWorkflow(container).run({
      input: {
        locations: [
          {
            name: STOCK_LOCATION_NAME,
            address: {
              city: "Seoul",
              country_code: COUNTRY_CODE.toUpperCase(),
              address_1: "",
            },
          },
        ],
      },
    })
    koreaLocation = created
    logger.info("Created the Korea Warehouse stock location.")
  } else {
    logger.info("Korea Warehouse already exists. Skipping location creation.")
  }

  if (!koreaLocation) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "Korea Warehouse stock location was not created.",
    )
  }

  const linkedProviders = (koreaLocation.fulfillment_providers ?? [])
    .map((provider) => provider?.id)
    .filter(Boolean)

  if (!linkedProviders.includes(FULFILLMENT_PROVIDER)) {
    await link.create({
      [Modules.STOCK_LOCATION]: {
        stock_location_id: koreaLocation.id,
      },
      [Modules.FULFILLMENT]: {
        fulfillment_provider_id: FULFILLMENT_PROVIDER,
      },
    })
    logger.info("Linked manual_manual to Korea Warehouse.")
  }

  const linkedChannels = (koreaLocation.sales_channels ?? [])
    .map((channel) => channel?.id)
    .filter(Boolean)

  if (!linkedChannels.includes(salesChannel.id)) {
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: {
        id: koreaLocation.id,
        add: [salesChannel.id],
      },
    })
    logger.info("Linked " + salesChannel.name + " to Korea Warehouse.")
  }

  // ---- Fulfillment set and service zone ----------------------------------------
  const [fulfillmentSet] = await fulfillmentModuleService.listFulfillmentSets(
    { name: FULFILLMENT_SET_NAME },
    { relations: ["service_zones"] },
  )

  let serviceZone = fulfillmentSet?.service_zones?.find(
    (zone) => zone.name === SERVICE_ZONE_NAME,
  )
  let fulfillmentSetId = fulfillmentSet?.id

  if (!serviceZone) {
    const createdSet = await fulfillmentModuleService.createFulfillmentSets({
      name: FULFILLMENT_SET_NAME,
      type: "shipping",
      service_zones: [
        {
          name: SERVICE_ZONE_NAME,
          geo_zones: [{ country_code: COUNTRY_CODE, type: "country" }],
        },
      ],
    })
    serviceZone = createdSet.service_zones[0]
    fulfillmentSetId = createdSet.id
    logger.info("Created the Korea delivery fulfillment set and service zone.")
  }

  const linkedSets = (koreaLocation.fulfillment_sets ?? [])
    .map((set) => set?.id)
    .filter(Boolean)

  if (fulfillmentSetId && !linkedSets.includes(fulfillmentSetId)) {
    await link.create({
      [Modules.STOCK_LOCATION]: {
        stock_location_id: koreaLocation.id,
      },
      [Modules.FULFILLMENT]: {
        fulfillment_set_id: fulfillmentSetId,
      },
    })
    logger.info("Linked the Korea fulfillment set to Korea Warehouse.")
  }

  // ---- Shipping options ---------------------------------------------------------
  const { data: shippingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id", "type"],
  })
  const shippingProfile = shippingProfiles.find(
    (profile) => profile.type === "default",
  )

  if (!shippingProfile) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "No default shipping profile found. Run medusa db:migrate first.",
    )
  }

  const { data: existingOptions } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "service_zone_id"],
    filters: { service_zone_id: serviceZone.id },
  })
  const existingNames = new Set(existingOptions.map((option) => option.name))

  const missingOptions = SHIPPING_OPTIONS.filter(
    (option) => !existingNames.has(option.name),
  )

  // shipping_option_type.code has no unique constraint, so passing a type
  // object would create a second "standard" row next to the Europe seed's.
  // The workflow DTO accepts both type (object) and type_id; the upsert step
  // maps type_id onto type when set, so an existing row is reused by code.
  const { data: existingTypes } = await query.graph({
    entity: "shipping_option_type",
    fields: ["id", "code"],
  })
  const typeIdByCode = new Map(
    existingTypes.map((type) => [type.code, type.id]),
  )

  if (missingOptions.length) {
    await createShippingOptionsWorkflow(container).run({
      input: missingOptions.map((option) => ({
        name: option.name,
        price_type: "flat",
        provider_id: FULFILLMENT_PROVIDER,
        service_zone_id: serviceZone.id,
        shipping_profile_id: shippingProfile.id,
        type_id: typeIdByCode.get(option.type.code),
        type: option.type,
        prices: [{ currency_code: REGION_CURRENCY, amount: option.amount }],
        rules: [
          {
            attribute: "enabled_in_store",
            value: "true",
            operator: "eq",
          },
          {
            attribute: "is_return",
            value: "false",
            operator: "eq",
          },
        ],
      })),
    })
    logger.info(
      "Created Korea shipping options: " +
        missingOptions.map((option) => option.name).join(", "),
    )
  } else {
    logger.info("Korea shipping options already exist. Skipping.")
  }

  logger.info("Korea commerce setup finished.")
}
