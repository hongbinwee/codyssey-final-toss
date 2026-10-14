import {
  hasTrackedStock,
  isWithinConditionSearchBudget,
  matchesConditionSearchSpecs,
  normalizeConditionSearchSpecs,
  parseConditionSearchBody,
} from "../helpers"

const monitorSpecs = (fields: Record<string, unknown>) => ({
  specs: {
    schema_version: "catalog-spec-v1",
    category: "monitor",
    spec_source: "seed_demo_text",
    fields,
  },
})

describe("product condition search contract", () => {
  it("defaults pagination and accepts typed nested spec conditions", () => {
    expect(
      parseConditionSearchBody({
        region_id: "reg_kr",
        category: "monitor",
        conditions: [
          { field: "resolution.width_px", operator: "gte", value: 2560 },
          { field: "usb_c", operator: "eq", value: true },
        ],
      })
    ).toEqual({
      region_id: "reg_kr",
      category: "monitor",
      conditions: [
        { field: "resolution.width_px", operator: "gte", value: 2560 },
        { field: "usb_c", operator: "eq", value: true },
      ],
      offset: 0,
      limit: 12,
    })
  })

  it.each([
    ["unknown category", { region_id: "reg_kr", category: "other" }],
    [
      "unknown field",
      {
        region_id: "reg_kr",
        category: "monitor",
        conditions: [{ field: "metadata.secret", operator: "eq", value: "x" }],
      },
    ],
    [
      "wrong value type",
      {
        region_id: "reg_kr",
        category: "monitor",
        conditions: [{ field: "refresh_hz", operator: "gte", value: "144" }],
      },
    ],
    [
      "unsupported operator",
      {
        region_id: "reg_kr",
        category: "monitor",
        conditions: [{ field: "usb_c", operator: "contains", value: true }],
      },
    ],
    ["excessive offset", { region_id: "reg_kr", offset: 10001 }],
  ])("rejects %s", (_label, body) => {
    expect(() => parseConditionSearchBody(body)).toThrow()
  })

  it("merges a valid variant override and drops invalid or unknown metadata", () => {
    const specs = normalizeConditionSearchSpecs(
      monitorSpecs({ inch: 27, panel: "ips", refresh_hz: 144, private_note: "x" }),
      {
        specs: {
          ...monitorSpecs({ panel: "va", usb_c: "yes" }).specs,
          fields: { panel: "va", usb_c: "yes", hidden: "value" },
        },
      },
      "monitor"
    )

    expect(specs).toEqual({
      schema_version: "catalog-spec-v1",
      category: "monitor",
      spec_source: "seed_demo_text",
      fields: {
        inch: 27,
        resolution: null,
        refresh_hz: 144,
        panel: "va",
        ports: null,
        usb_c: null,
      },
    })
  })

  it("does not combine predicates across variants and treats null as unknown", () => {
    const conditions = [
      { field: "panel", operator: "eq", value: "ips" },
      { field: "refresh_hz", operator: "gte", value: 144 },
    ] as const
    const ips60 = normalizeConditionSearchSpecs(
      monitorSpecs({ panel: "ips", refresh_hz: 60 }),
      null,
      "monitor"
    )!
    const va144 = normalizeConditionSearchSpecs(
      monitorSpecs({ panel: "va", refresh_hz: 144 }),
      null,
      "monitor"
    )!
    const unknown = normalizeConditionSearchSpecs(
      monitorSpecs({ panel: "ips", refresh_hz: null }),
      null,
      "monitor"
    )!

    expect(matchesConditionSearchSpecs(ips60, conditions)).toBe(false)
    expect(matchesConditionSearchSpecs(va144, conditions)).toBe(false)
    expect(matchesConditionSearchSpecs(unknown, conditions)).toBe(false)
  })

  it("fails closed when a variant has an incompatible spec envelope", () => {
    const specs = normalizeConditionSearchSpecs(
      monitorSpecs({ inch: 27, panel: "ips" }),
      {
        specs: {
          schema_version: "catalog-spec-v2",
          category: "monitor",
          spec_source: "seed_demo_text",
          fields: { panel: "va" },
        },
      },
      "monitor"
    )

    expect(specs).toBeNull()
  })

  it("matches array values by exact membership and nested numeric paths", () => {
    const specs = normalizeConditionSearchSpecs(
      monitorSpecs({
        resolution: { width_px: 2560, height_px: 1440 },
        ports: ["hdmi", "displayport"],
      }),
      null,
      "monitor"
    )!

    expect(
      matchesConditionSearchSpecs(specs, [
        { field: "resolution.width_px", operator: "gte", value: 2560 },
        { field: "ports", operator: "eq", value: "hdmi" },
      ])
    ).toBe(true)
    expect(
      matchesConditionSearchSpecs(specs, [
        { field: "ports", operator: "eq", value: "hdmi 2.1" },
      ])
    ).toBe(false)
  })

  it("distinguishes tracked stock from purchasable but untracked inventory", () => {
    expect(hasTrackedStock(false, null)).toBe(false)
    expect(hasTrackedStock(true, null)).toBe(false)
    expect(hasTrackedStock(true, 0)).toBe(false)
    expect(hasTrackedStock(true, 1)).toBe(true)
  })

  it("bounds catalog work instead of processing an unlimited public catalog", () => {
    expect(isWithinConditionSearchBudget(1000, 5000)).toBe(true)
    expect(isWithinConditionSearchBudget(1001, 5000)).toBe(false)
    expect(isWithinConditionSearchBudget(1000, 5001)).toBe(false)
  })
})
