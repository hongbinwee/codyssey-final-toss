export const DEFAULT_LIMIT = 12
export const MAX_LIMIT = 50
export const MAX_OFFSET = 10_000
export const MAX_CATALOG_PRODUCTS = 1_000
export const MAX_CATALOG_VARIANTS = 5_000

export function hasTrackedStock(
  manageInventory: boolean,
  quantity: number | null
): boolean {
  return manageInventory && quantity !== null && quantity > 0
}

export function isWithinConditionSearchBudget(
  productCount: number,
  variantCount: number
): boolean {
  return (
    Number.isInteger(productCount) &&
    Number.isInteger(variantCount) &&
    productCount >= 0 &&
    variantCount >= 0 &&
    productCount <= MAX_CATALOG_PRODUCTS &&
    variantCount <= MAX_CATALOG_VARIANTS
  )
}

export type SpecCategory = "monitor" | "keyboard" | "mouse" | "living"
export type ConditionOperator = "eq" | "gte" | "lte" | "contains"
export type ProductCondition = {
  field: string
  operator: ConditionOperator
  value: string | number | boolean
}

export type ConditionSearchBody = {
  region_id: string
  query?: string
  category?: SpecCategory
  conditions: ProductCondition[]
  max_price?: number
  in_stock_only?: boolean
  offset: number
  limit: number
}

export type ConditionSearchSpecs = {
  schema_version: "catalog-spec-v1"
  category: SpecCategory
  spec_source: string
  fields: Record<string, unknown>
}

type FieldType = "number" | "boolean" | "string" | "enum" | "string[]" | "enum[]"
type FieldRule = { type: FieldType; values?: readonly string[] }

const categories: SpecCategory[] = ["monitor", "keyboard", "mouse", "living"]
const enumValues = {
  panel: ["ips", "va", "tn", "oled"],
  connection: ["bluetooth", "wireless_2_4ghz", "usb_c", "wired", "wireless"],
  noise: ["quiet", "clicky", "standard"],
  keyboardSwitch: ["red", "brown", "blue", "red_quiet", "blue_clicky"],
} as const

const fields: Record<SpecCategory, Record<string, FieldRule>> = {
  monitor: {
    inch: { type: "number" },
    "resolution.width_px": { type: "number" },
    "resolution.height_px": { type: "number" },
    refresh_hz: { type: "number" },
    panel: { type: "enum", values: enumValues.panel },
    ports: { type: "string[]" },
    usb_c: { type: "boolean" },
  },
  keyboard: {
    layout: { type: "string" },
    switch: { type: "enum", values: enumValues.keyboardSwitch },
    connection: { type: "enum[]", values: enumValues.connection },
    noise: { type: "enum", values: enumValues.noise },
  },
  mouse: {
    dpi: { type: "number" },
    product_weight_g: { type: "number" },
    connection: { type: "enum[]", values: enumValues.connection },
    ergonomics: { type: "string" },
  },
  living: {
    capacity_ml: { type: "number" },
    material: { type: "string" },
    "dimensions.width_mm": { type: "number" },
    "dimensions.depth_mm": { type: "number" },
    "dimensions.height_mm": { type: "number" },
  },
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const isCategory = (value: unknown): value is SpecCategory =>
  typeof value === "string" && categories.includes(value as SpecCategory)

const getPath = (record: Record<string, unknown>, path: string): unknown =>
  path.split(".").reduce<unknown>((value, key) => {
    if (!isRecord(value)) return undefined
    return value[key]
  }, record)

const isValidConditionValue = (rule: FieldRule, value: unknown): boolean => {
  switch (rule.type) {
    case "number":
      return typeof value === "number" && Number.isFinite(value) && value >= 0
    case "boolean":
      return typeof value === "boolean"
    case "enum":
    case "enum[]":
      return typeof value === "string" && rule.values?.includes(value) === true
    case "string":
    case "string[]":
      return typeof value === "string" && value.trim().length > 0 && value.length <= 120
  }
}

const supportsOperator = (rule: FieldRule, operator: string): boolean => {
  if (rule.type === "number") return ["eq", "gte", "lte"].includes(operator)
  if (rule.type === "boolean" || rule.type === "enum") return operator === "eq"
  return operator === "eq" || operator === "contains"
}

export class ConditionSearchValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ConditionSearchValidationError"
  }
}

const matchingCategories = (condition: ProductCondition): SpecCategory[] =>
  categories.filter((category) => {
    const rule = fields[category][condition.field]
    return Boolean(
      rule &&
        supportsOperator(rule, condition.operator) &&
        isValidConditionValue(rule, condition.value)
    )
  })

/** Validate untrusted Store API input and apply bounded, predictable paging. */
export function parseConditionSearchBody(value: unknown): ConditionSearchBody {
  if (!isRecord(value)) throw new ConditionSearchValidationError("Request body must be an object")
  if (
    typeof value.region_id !== "string" ||
    !value.region_id.trim() ||
    value.region_id.length > 256
  ) {
    throw new ConditionSearchValidationError("region_id is required")
  }
  if (value.query !== undefined && (typeof value.query !== "string" || value.query.length > 200)) {
    throw new ConditionSearchValidationError("query must be a string up to 200 characters")
  }
  if (value.category !== undefined && !isCategory(value.category)) {
    throw new ConditionSearchValidationError("category is not supported")
  }
  const requestedCategory = isCategory(value.category) ? value.category : undefined
  if (value.max_price !== undefined && (typeof value.max_price !== "number" || !Number.isFinite(value.max_price) || value.max_price < 0)) {
    throw new ConditionSearchValidationError("max_price must be a non-negative number")
  }
  if (value.in_stock_only !== undefined && typeof value.in_stock_only !== "boolean") {
    throw new ConditionSearchValidationError("in_stock_only must be a boolean")
  }
  const offset = value.offset === undefined ? 0 : value.offset
  const limit = value.limit === undefined ? DEFAULT_LIMIT : value.limit
  if (!Number.isInteger(offset) || (offset as number) < 0 || (offset as number) > MAX_OFFSET) {
    throw new ConditionSearchValidationError(`offset must be an integer between 0 and ${MAX_OFFSET}`)
  }
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > MAX_LIMIT) {
    throw new ConditionSearchValidationError(`limit must be an integer between 1 and ${MAX_LIMIT}`)
  }

  const rawConditions = value.conditions === undefined ? [] : value.conditions
  if (!Array.isArray(rawConditions) || rawConditions.length > 20) {
    throw new ConditionSearchValidationError("conditions must contain at most 20 items")
  }
  const conditions: ProductCondition[] = rawConditions.map((condition) => {
    if (
      !isRecord(condition) ||
      typeof condition.field !== "string" ||
      condition.field.length > 100 ||
      !["eq", "gte", "lte", "contains"].includes(String(condition.operator)) ||
      !(typeof condition.value === "string" || typeof condition.value === "number" || typeof condition.value === "boolean")
    ) {
      throw new ConditionSearchValidationError("condition has an invalid shape")
    }
    const item = {
      field: condition.field,
      operator: condition.operator as ConditionOperator,
      value: condition.value,
    }
    if (matchingCategories(item).length === 0) {
      throw new ConditionSearchValidationError(`condition is not allowed: ${item.field}`)
    }
    if (requestedCategory && !fields[requestedCategory][item.field]) {
      throw new ConditionSearchValidationError(`condition field does not belong to category: ${item.field}`)
    }
    return item
  })

  if (conditions.length && !value.category) {
    let possible = new Set(matchingCategories(conditions[0]))
    for (const condition of conditions.slice(1)) {
      const accepted = new Set(matchingCategories(condition))
      possible = new Set([...possible].filter((category) => accepted.has(category)))
    }
    if (!possible.size) throw new ConditionSearchValidationError("conditions must use fields from one category")
  }

  return {
    region_id: value.region_id.trim(),
    ...(typeof value.query === "string" && value.query.trim()
      ? { query: value.query.trim() }
      : {}),
    ...(requestedCategory ? { category: requestedCategory } : {}),
    conditions,
    ...(typeof value.max_price === "number" ? { max_price: value.max_price } : {}),
    ...(typeof value.in_stock_only === "boolean" ? { in_stock_only: value.in_stock_only } : {}),
    offset: offset as number,
    limit: limit as number,
  }
}

const readSpecEnvelope = (value: unknown, category?: SpecCategory) => {
  if (!isRecord(value) || value.schema_version !== "catalog-spec-v1") return null
  if (!isCategory(value.category) || (category && category !== value.category)) return null
  if (
    typeof value.spec_source !== "string" ||
    !/^[A-Za-z0-9._-]{1,80}$/.test(value.spec_source) ||
    !isRecord(value.fields)
  ) return null
  return {
    category: value.category,
    spec_source: value.spec_source.slice(0, 80),
    fields: value.fields,
  }
}

/**
 * Normalize only catalog-spec-v1 fields. A present but malformed variant value
 * overrides the product value as unknown, so invalid metadata cannot create a
 * false match. Unknown keys and incompatible variant envelopes are ignored.
 */
export function normalizeConditionSearchSpecs(
  productMetadata: unknown,
  variantMetadata: unknown,
  category?: SpecCategory
): ConditionSearchSpecs | null {
  const productEnvelope = isRecord(productMetadata)
    ? readSpecEnvelope(productMetadata.specs, category)
    : null
  if (!productEnvelope) return null

  const variantMetadataRecord = isRecord(variantMetadata) ? variantMetadata : null
  const hasVariantSpec = Boolean(
    variantMetadataRecord &&
      Object.prototype.hasOwnProperty.call(variantMetadataRecord, "specs")
  )
  const variantEnvelope = hasVariantSpec && variantMetadataRecord
    ? readSpecEnvelope(variantMetadataRecord.specs, productEnvelope.category)
    : null
  if (hasVariantSpec && !variantEnvelope) return null
  const normalizedFields: Record<string, unknown> = {}
  const schema = fields[productEnvelope.category]
  const topLevelKeys = [...new Set(Object.keys(schema).map((path) => path.split(".")[0]))]

  for (const key of topLevelKeys) {
    const variantOverrides = variantEnvelope && Object.prototype.hasOwnProperty.call(variantEnvelope.fields, key)
    const source = variantOverrides ? variantEnvelope.fields : productEnvelope.fields
    const raw = source[key]
    const nestedRules = Object.entries(schema).filter(([path]) => path.startsWith(`${key}.`))

    if (nestedRules.length) {
      if (raw == null) {
        normalizedFields[key] = null
      } else if (!isRecord(raw)) {
        normalizedFields[key] = null
      } else {
        const nested: Record<string, unknown> = {}
        for (const [path, rule] of nestedRules) {
          const child = path.slice(key.length + 1)
          const childValue = raw[child]
          nested[child] = childValue == null
            ? null
            : isValidSpecValue(rule, childValue) ? childValue : null
        }
        normalizedFields[key] = nested
      }
      continue
    }

    const rule = schema[key]
    normalizedFields[key] = raw == null
      ? null
      : isValidSpecValue(rule, raw) ? raw : null
  }

  return {
    schema_version: "catalog-spec-v1",
    category: productEnvelope.category,
    spec_source: productEnvelope.spec_source,
    fields: normalizedFields,
  }
}

const isValidSpecValue = (rule: FieldRule, value: unknown): boolean => {
  switch (rule.type) {
    case "number":
      return typeof value === "number" && Number.isFinite(value) && value > 0
    case "boolean":
      return typeof value === "boolean"
    case "enum":
      return typeof value === "string" && rule.values?.includes(value) === true
    case "enum[]":
      return Array.isArray(value) && value.length <= 50 && value.every((item) => typeof item === "string" && rule.values?.includes(item) === true)
    case "string":
      return typeof value === "string" && value.trim().length > 0 && value.length <= 120
    case "string[]":
      return Array.isArray(value) && value.length <= 50 && value.every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= 120)
  }
}

export function matchesConditionSearchSpecs(
  specs: ConditionSearchSpecs | null,
  conditions: readonly ProductCondition[]
): boolean {
  if (!conditions.length) return true
  if (!specs) return false

  return conditions.every((condition) => {
    const rule = fields[specs.category][condition.field]
    if (!rule || !supportsOperator(rule, condition.operator) || !isValidConditionValue(rule, condition.value)) {
      return false
    }
    const actual = getPath(specs.fields, condition.field)
    if (actual == null) return false

    switch (condition.operator) {
      case "eq":
        return Array.isArray(actual)
          ? actual.includes(condition.value)
          : actual === condition.value
      case "gte":
        return typeof actual === "number" && actual >= (condition.value as number)
      case "lte":
        return typeof actual === "number" && actual <= (condition.value as number)
      case "contains":
        return typeof actual === "string"
          ? actual.toLocaleLowerCase().includes(String(condition.value).toLocaleLowerCase())
          : Array.isArray(actual) && actual.includes(condition.value)
    }
  })
}
