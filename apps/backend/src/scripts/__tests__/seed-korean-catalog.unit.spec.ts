/**
 * DB-free invariant checks for the Korean demo catalog dataset.
 * Runtime seeding is verified separately against a live DB.
 */
import {
  buildProductInputs,
  imageUrl,
  KOREAN_CATEGORIES,
  KOREAN_DEMO_PRODUCTS,
  salePriceBySku,
  stockBySku,
  type DemoProductSpec,
} from "../seed-korean-catalog-data"

const ctx = {
  salesChannelId: "sc_test",
  shippingProfileId: "sp_test",
  categoryIds: {
    monitor: "pcat_monitor",
    keyboard: "pcat_keyboard",
    mouse: "pcat_mouse",
    living: "pcat_living",
  },
  imageBase: "http://localhost:8000/demo-products",
}

const allVariants = KOREAN_DEMO_PRODUCTS.flatMap((p) => p.variants)

describe("KOREAN_DEMO_PRODUCTS dataset", () => {
  it("has 12-16 products with deterministic handles and unique SKUs", () => {
    expect(KOREAN_DEMO_PRODUCTS.length).toBeGreaterThanOrEqual(12)
    expect(KOREAN_DEMO_PRODUCTS.length).toBeLessThanOrEqual(16)

    const handles = KOREAN_DEMO_PRODUCTS.map((p) => p.handle)
    expect(new Set(handles).size).toBe(handles.length)
    for (const handle of handles) {
      expect(handle).toMatch(/^toss3days-[a-z0-9-]+$/)
    }

    const skus = allVariants.map((v) => v.sku)
    expect(new Set(skus).size).toBe(skus.length)
    for (const sku of skus) {
      expect(sku).toMatch(/^T3D-[A-Z0-9-]+$/)
    }
  })

  it("gives every variant exactly one value per product option", () => {
    for (const product of KOREAN_DEMO_PRODUCTS) {
      const titles = product.options.map((o) => o.title)
      expect(new Set(titles).size).toBe(titles.length)
      for (const variant of product.variants) {
        expect(Object.keys(variant.options).sort()).toEqual([...titles].sort())
        for (const option of product.options) {
          expect(option.values).toContain(variant.options[option.title])
        }
      }
    }
  })

  it("uses positive integer KRW prices and non-negative stock", () => {
    for (const variant of allVariants) {
      expect(Number.isInteger(variant.price)).toBe(true)
      expect(variant.price).toBeGreaterThan(0)
      expect(Number.isInteger(variant.stock)).toBe(true)
      expect(variant.stock).toBeGreaterThanOrEqual(0)
    }
  })

  it("covers every required test scenario", () => {
    const byScenario = (s: DemoProductSpec["scenario"]) =>
      KOREAN_DEMO_PRODUCTS.filter((p) => p.scenario === s)

    // multi-option: at least one product with 2+ option dimensions
    expect(
      byScenario("multi-option").some((p) => p.options.length >= 2)
    ).toBe(true)

    // limited stock: exactly 2 products, each capped at <= 5 units
    const limited = byScenario("limited")
    expect(limited).toHaveLength(2)
    for (const product of limited) {
      for (const variant of product.variants) {
        expect(variant.stock).toBeGreaterThan(0)
        expect(variant.stock).toBeLessThanOrEqual(5)
      }
    }

    // sold out: every variant at 0 stock
    const soldout = byScenario("soldout")
    expect(soldout).toHaveLength(1)
    for (const variant of soldout[0].variants) {
      expect(variant.stock).toBe(0)
    }

    // sale: real price-list discount below list price
    const sale = byScenario("sale")
    expect(sale).toHaveLength(1)
    for (const product of sale) {
      expect(product.salePrice).toBeDefined()
      for (const variant of product.variants) {
        expect(product.salePrice!).toBeLessThan(variant.price)
      }
    }

    // cheap item where shipping option cost is visible
    expect(byScenario("shipping-test")).toHaveLength(1)
  })

  it("maps categories and images to known values", () => {
    const keys = KOREAN_CATEGORIES.map((c) => c.key)
    for (const product of KOREAN_DEMO_PRODUCTS) {
      expect(keys).toContain(product.category)
      expect(imageUrl(ctx.imageBase, product.handle)).toBe(
        `http://localhost:8000/demo-products/${product.handle}.svg`
      )
    }
  })
})

describe("buildProductInputs", () => {
  const inputs = buildProductInputs(KOREAN_DEMO_PRODUCTS, ctx)

  it("emits publishable products wired to channel, profile, category, KRW", () => {
    expect(inputs).toHaveLength(KOREAN_DEMO_PRODUCTS.length)
    for (const input of inputs as any[]) {
      expect(input.status).toBe("published")
      expect(input.sales_channels).toEqual([{ id: "sc_test" }])
      expect(input.shipping_profile_id).toBe("sp_test")
      expect(input.category_ids[0]).toMatch(/^pcat_/)
      expect(input.metadata.demo).toBe(true)
      expect(input.thumbnail).toContain("/demo-products/")
      for (const variant of input.variants) {
        expect(variant.manage_inventory).toBe(true)
        expect(variant.allow_backorder).toBe(false)
        expect(variant.prices).toEqual([
          { amount: expect.any(Number), currency_code: "krw" },
        ])
      }
    }
  })

  it("builds stock and sale maps covering every variant", () => {
    const stock = stockBySku()
    const sale = salePriceBySku()
    for (const variant of allVariants) {
      expect(stock.get(variant.sku)).toBe(variant.stock)
    }
    const saleSkus = KOREAN_DEMO_PRODUCTS.filter((p) => p.salePrice).flatMap(
      (p) => p.variants.map((v) => v.sku)
    )
    expect([...sale.keys()].sort()).toEqual(saleSkus.sort())
  })
})
