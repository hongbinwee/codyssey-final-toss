import type { Page } from "@playwright/test"
import { e2eEnv } from "./env"

// Medusa Store API 최소 클라이언트. 실제 구매 흐름은 UI로 검증하고,
// 데이터 탐색·픽스처 준비·소유권 격리 단언에만 API를 직접 사용한다.

type ApiInit = {
  method?: string
  token?: string | null
  body?: unknown
  query?: Record<string, string | number | undefined>
}

export type ApiResult = {
  status: number
  ok: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any
}

export const storeApi = async (
  path: string,
  init: ApiInit = {}
): Promise<ApiResult> => {
  if (!e2eEnv.publishableKey) {
    throw new Error(
      "[E2E] publishable key가 없다. apps/storefront/.env(.local) 또는 E2E_PUBLISHABLE_KEY를 확인한다."
    )
  }
  const url = new URL(e2eEnv.backendURL + path)
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (v !== undefined) {
      url.searchParams.set(k, String(v))
    }
  }
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-publishable-api-key": e2eEnv.publishableKey,
  }
  if (init.token) {
    headers["authorization"] = "Bearer " + init.token
  }
  const res = await fetch(url.toString(), {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, ok: res.ok, json }
}

// 브라우저 세션의 장바구니 항목 수 — 서버 액션(addToCart) 완료를 폴링으로 기다린다.
export const cartItemCount = async (page: Page): Promise<number> => {
  const cookies = await page.context().cookies()
  const cartId = cookies.find((c) => c.name === "_medusa_cart_id")?.value
  if (!cartId) {
    return 0
  }
  const res = await storeApi("/store/carts/" + cartId)
  return res.json?.cart?.items?.length ?? 0
}

// ---- 리전 / 카탈로그 탐색 ----------------------------------------------------
// P0 필수 데이터가 없으면 skip 없이 즉시 실패한다 (Europe 리전 fallback 금지).

export type Region = {
  id: string
  name?: string
  currency_code: string
  countries?: { iso_2?: string }[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type StoreProduct = any

export const getRegions = async (): Promise<Region[]> => {
  const res = await storeApi("/store/regions")
  if (!res.ok) {
    throw new Error("[E2E] /store/regions 실패: " + res.status)
  }
  return res.json?.regions ?? []
}

const isKoreanRegion = (r: Region) =>
  r.currency_code?.toLowerCase() === "krw" &&
  (r.countries ?? []).some((c) => c.iso_2?.toLowerCase() === "kr")

// 한국(kr/KRW) 리전만 허용한다. 없으면 명시적으로 실패한다.
export const resolveRegion = async (): Promise<{
  region: Region
  countryCode: string
}> => {
  const regions = await getRegions()
  const preferred = e2eEnv.countryCode.toLowerCase()
  const region =
    regions.find(isKoreanRegion) ??
    regions.find((r) =>
      (r.countries ?? []).some((c) => c.iso_2?.toLowerCase() === preferred)
    )
  if (!region) {
    throw new Error(
      "[E2E] 한국 리전(kr/KRW)이 없다 — seed-korea 미적용. 발견된 리전: " +
        regions
          .map((r) => r.currency_code + "/" + (r.countries ?? []).length + "국")
          .join(", ")
    )
  }
  const countryCode =
    (region.countries ?? []).find((c) => c.iso_2?.toLowerCase() === preferred)
      ?.iso_2 ??
    (region.countries ?? []).find((c) => c.iso_2?.toLowerCase() === "kr")
      ?.iso_2 ??
    region.countries?.[0]?.iso_2 ??
    "kr"
  return { region, countryCode }
}

export const getProducts = async (regionId: string): Promise<StoreProduct[]> => {
  const res = await storeApi("/store/products", {
    query: {
      limit: 200,
      region_id: regionId,
      // storefront src/lib/data/products.ts와 동일한 필드 계약
      fields:
        "*variants.calculated_price,+variants.inventory_quantity,*variants.images,*variants.options,+metadata,+tags,",
    },
  })
  if (!res.ok) {
    throw new Error("[E2E] /store/products 실패: " + res.status)
  }
  return res.json?.products ?? []
}

// storefront product-actions의 inStock 판정과 동일 규칙
const variantPurchasable = (v: StoreProduct) =>
  Boolean(v) &&
  v.calculated_price?.calculated_amount != null &&
  (!v.manage_inventory ||
    v.allow_backorder ||
    (v.inventory_quantity ?? 0) > 0)

// 재고 소모 방지 — 시나리오용 저재고(1~5)만 재고 검증 대상으로 한다.
const variantStockLimited = (v: StoreProduct) =>
  Boolean(v) &&
  v.manage_inventory === true &&
  !v.allow_backorder &&
  (v.inventory_quantity ?? 0) >= 1 &&
  (v.inventory_quantity ?? 0) <= 5

const variantDiscounted = (v: StoreProduct) => {
  const p = v?.calculated_price
  return (
    p &&
    p.original_amount != null &&
    p.calculated_amount != null &&
    p.original_amount > p.calculated_amount
  )
}

export type CatalogPicks = {
  region: Region
  countryCode: string
  currencyCode: string
  products: StoreProduct[]
  simple: StoreProduct // 옵션 선택 없이 담기 가능한 상품
  optioned: StoreProduct // 옵션 선택 필요한 다중 variant 상품
  soldOut: StoreProduct // 전 variant 구매 불가 상품
  stockLimited: StoreProduct // metadata.scenario==='limited' + 재고 1~5
  discounted: StoreProduct // 정가>할인가 상품
}

const REQUIRED = [
  "simple",
  "optioned",
  "soldOut",
  "stockLimited",
  "discounted",
] as const

let catalogCache: Promise<CatalogPicks> | null = null

export const discoverCatalog = (): Promise<CatalogPicks> => {
  catalogCache ??= (async () => {
    const { region, countryCode } = await resolveRegion()
    const products = await getProducts(region.id)

    const variantsOf = (p: StoreProduct): StoreProduct[] => p?.variants ?? []
    const purchasableVariants = (p: StoreProduct) =>
      variantsOf(p).filter(variantPurchasable)

    const korean = products.filter((p) =>
      (p?.handle ?? "").startsWith("toss3days-")
    )
    if (products.length === 0 || korean.length === 0) {
      throw new Error(
        "[E2E] toss3days-* 카탈로그가 없다 — 한국 catalog seed 미적용. " +
          "조회된 상품 수: " + products.length
      )
    }

    const simple =
      korean.find(
        (p) => purchasableVariants(p).length === 1 && variantsOf(p).length === 1
      ) ??
      korean.find((p) => purchasableVariants(p).length > 0) ??
      null
    const optioned =
      korean.find(
        (p) =>
          (p?.options?.length ?? 0) > 1 &&
          variantsOf(p).length > 1 &&
          new Set(purchasableVariants(p).map((v) => v.calculated_price?.calculated_amount)).size > 1
      ) ?? null
    const soldOut =
      korean.find(
        (p) => variantsOf(p).length > 0 && purchasableVariants(p).length === 0
      ) ?? null
    const stockLimited =
      korean.find(
        (p) =>
          p?.metadata?.scenario === "limited" &&
          variantsOf(p).some(variantStockLimited)
      ) ?? null
    const discounted =
      korean.find((p) => variantsOf(p).some(variantDiscounted)) ?? null

    const found: Record<string, StoreProduct | null> = {
      simple,
      optioned,
      soldOut,
      stockLimited,
      discounted,
    }
    const missing = REQUIRED.filter((k) => !found[k])
    if (missing.length > 0) {
      throw new Error(
        "[E2E] 시나리오 상품이 부족하다: " +
          missing.join(", ") +
          " — catalog seed의 scenario metadata(재고제한/품절/할인)를 확인"
      )
    }

    return {
      region,
      countryCode,
      currencyCode: region.currency_code?.toLowerCase() ?? "",
      products,
      simple: simple!,
      optioned: optioned!,
      soldOut: soldOut!,
      stockLimited: stockLimited!,
      discounted: discounted!,
    }
  })()
  return catalogCache
}

// variant 선택 조합에 해당하는 실제 가격(amount) 집합
export const variantAmounts = (product: StoreProduct): number[] =>
  (product?.variants ?? [])
    .map((v: StoreProduct) => v?.calculated_price?.calculated_amount)
    .filter((a: unknown) => typeof a === "number")

// ---- 고객 / 주문 픽스처 -------------------------------------------------------

export type CustomerFixture = {
  email: string
  password: string
  token: string
}

export const registerCustomerApi = async (
  email: string,
  password: string,
  names: { first_name: string; last_name: string; phone?: string }
): Promise<CustomerFixture> => {
  const reg = await storeApi("/auth/customer/emailpass/register", {
    method: "POST",
    body: { email, password },
  })
  let token: string | undefined = reg.json?.token
  if (!reg.ok || !token) {
    throw new Error("[E2E] register 실패: " + reg.status)
  }

  const me = await storeApi("/store/customers/me", { token })
  if (!me.ok) {
    const create = await storeApi("/store/customers", {
      method: "POST",
      token,
      body: { email, ...names },
    })
    if (!create.ok) {
      throw new Error("[E2E] customer 생성 실패: " + create.status)
    }
  }
  // 모든 분기에서 재로그인해 customer actor 토큰을 확보한다 — res.ok/token 필수.
  const login = await storeApi("/auth/customer/emailpass", {
    method: "POST",
    body: { email, password },
  })
  token = login.json?.token
  if (!login.ok || !token) {
    throw new Error("[E2E] 재로그인 실패: " + login.status)
  }
  return { email, password, token }
}

export const createCartApi = async (
  regionId: string,
  token?: string
): Promise<string> => {
  const res = await storeApi("/store/carts", {
    method: "POST",
    token,
    body: { region_id: regionId },
  })
  if (!res.ok || !res.json?.cart?.id) {
    throw new Error("[E2E] cart 생성 실패: " + res.status)
  }
  return res.json.cart.id
}

export const addLineItemApi = async (
  cartId: string,
  variantId: string,
  quantity: number,
  token?: string
): Promise<ApiResult> =>
  storeApi("/store/carts/" + cartId + "/line-items", {
    method: "POST",
    token,
    body: { variant_id: variantId, quantity },
  })

export const updateLineItemApi = async (
  cartId: string,
  lineItemId: string,
  quantity: number,
  token?: string
): Promise<ApiResult> =>
  storeApi("/store/carts/" + cartId + "/line-items/" + lineItemId, {
    method: "POST",
    token,
    body: { quantity },
  })

// 고객 계정으로 실제 주문을 생성한다 (isolation 픽스처용).
// 반드시 pp_system_default 결제만 사용 — 다른 provider로 우회하지 않는다.
export const createOrderForCustomer = async (opts: {
  token: string
  email: string
  region: Region
  countryCode: string
  variantId: string
}): Promise<{ id: string; display_id: number | string }> => {
  const { token, email, region, countryCode, variantId } = opts
  const cartId = await createCartApi(region.id, token)

  const added = await addLineItemApi(cartId, variantId, 1, token)
  if (!added.ok) {
    throw new Error("[E2E] line item 추가 실패: " + added.status)
  }

  const address = {
    first_name: "QA",
    last_name: "토스",
    address_1: "테헤란로 123",
    city: "서울특별시",
    postal_code: "06234",
    country_code: countryCode,
    phone: "010-1234-5678",
  }
  const setAddr = await storeApi("/store/carts/" + cartId, {
    method: "POST",
    token,
    body: {
      email,
      shipping_address: address,
      billing_address: address,
    },
  })
  if (!setAddr.ok) {
    throw new Error("[E2E] 주소 설정 실패: " + setAddr.status)
  }

  const shippingOptions = await storeApi("/store/shipping-options", {
    token,
    query: { cart_id: cartId },
  })
  const optionId = shippingOptions.json?.shipping_options?.[0]?.id
  if (!optionId) {
    throw new Error("[E2E] 배송 옵션이 없다.")
  }
  const setShip = await storeApi("/store/carts/" + cartId + "/shipping-methods", {
    method: "POST",
    token,
    body: { option_id: optionId },
  })
  if (!setShip.ok) {
    throw new Error("[E2E] 배송 방법 설정 실패: " + setShip.status)
  }

  const providers = await storeApi("/store/payment-providers", {
    token,
    query: { region_id: region.id },
  })
  const providerIds: string[] = (
    providers.json?.payment_providers ?? []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ).map((p: any) => p.id)
  const providerId = providerIds.find((id) =>
    id.startsWith("pp_system_default")
  )
  if (!providerId) {
    throw new Error(
      "[E2E] pp_system_default 결제 provider가 없다 — 모의 결제 설정 확인. 발견: " +
        providerIds.join(",")
    )
  }

  const pc = await storeApi("/store/payment-collections", {
    method: "POST",
    token,
    body: { cart_id: cartId },
  })
  const pcId = pc.json?.payment_collection?.id
  if (!pcId) {
    throw new Error("[E2E] payment collection 생성 실패")
  }
  const session = await storeApi(
    "/store/payment-collections/" + pcId + "/payment-sessions",
    {
      method: "POST",
      token,
      body: { provider_id: providerId, data: {} },
    }
  )
  if (!session.ok) {
    throw new Error("[E2E] payment session 실패: " + session.status)
  }

  const complete = await storeApi("/store/carts/" + cartId + "/complete", {
    method: "POST",
    token,
    body: {},
  })
  const order = complete.json?.order
  if (!complete.ok || complete.json?.type !== "order" || !order?.id) {
    throw new Error(
      "[E2E] cart complete 실패: " +
        complete.status +
        " " +
        JSON.stringify(complete.json)?.slice(0, 300)
    )
  }
  return { id: order.id, display_id: order.display_id }
}

export const getOrderApi = (id: string, token: string, fields?: string) =>
  storeApi("/store/orders/" + id, {
    token,
    query: fields ? { fields } : undefined,
  })

export const getCustomerApi = (token: string) =>
  storeApi("/store/customers/me", { token })

export const listOrderIdsApi = async (token: string): Promise<string[]> => {
  const res = await storeApi("/store/orders", {
    token,
    query: { limit: 100 },
  })
  if (!res.ok) {
    throw new Error("[E2E] 주문 목록 조회 실패: " + res.status)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (res.json?.orders ?? []).map((o: any) => o.id)
}
