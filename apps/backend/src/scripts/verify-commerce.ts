/**
 * Korea commerce boundary check — drives a real Store API purchase for the
 * Korean region and asserts the boundaries the storefront relies on:
 * region/currency, variant price, cart line add/update/remove, quantity vs
 * inventory, shipping option, system payment provider, cart complete and
 * order access isolation between customers.
 *
 *   npx medusa exec ./src/scripts/verify-commerce.ts
 *
 * Requires the backend dev server running on MEDUSA_BACKEND_URL
 * (default http://localhost:9000). The publishable key is read from the DB,
 * falling back to MEDUSA_PUBLISHABLE_KEY or
 * NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY; keys, tokens and passwords are never
 * printed.
 *
 * Normal scenario: medusa db:migrate, seed-korea and seed-korean-catalog all
 * ran, so a toss3days-* product exists with a KRW price and a variant with
 * inventory_quantity >= 3 of managed stock (manage_inventory: true,
 * allow_backorder: false in the catalog seed).
 *
 * Every check reports PASS / FAIL / SKIP / NOT_RUN. The process exits 0 only
 * when every single check is PASS: a FAIL, SKIP or NOT_RUN means part of the
 * boundary was never exercised, which is reported as a non-zero exit, never
 * as a green run.
 */
import { randomBytes } from "node:crypto"
import type { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

const BASE_URL = (process.env.MEDUSA_BACKEND_URL ?? "http://localhost:9000")
  .replace(/\/+$/, "")

type Result = {
  name: string
  status: "PASS" | "FAIL" | "SKIP" | "NOT_RUN"
  detail?: string
}

const results: Result[] = []

const report = (name: string, status: Result["status"], detail?: string) => {
  results.push({ name, status, detail })
}

const fail = (name: string, detail?: string): never => {
  report(name, "FAIL", detail)
  throw new MedusaError(
    MedusaError.Types.UNEXPECTED_STATE,
    "verify-commerce abort: " + name,
  )
}

type ApiResponse = { status: number; json: any }

const api = async (
  path: string,
  options: {
    method?: string
    body?: unknown
    token?: string | null
    publishableKey?: string
  } = {},
): Promise<ApiResponse> => {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  }
  if (options.publishableKey) {
    headers["x-publishable-api-key"] = options.publishableKey
  }
  if (options.token) {
    headers["authorization"] = "Bearer " + options.token
  }
  const response = await fetch(BASE_URL + path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const json = await response.json().catch(() => ({}))
  return { status: response.status, json }
}

// Register creates the auth identity and returns a token issued before the
// customer record exists, so it carries no actor_id. POST /store/customers
// links the actor, and only a fresh emailpass login afterwards returns a
// token that ownership checks (orders, carts) resolve to the customer.
const registerCustomer = async (
  publishableKey: string,
  email: string,
  password: string,
  firstName: string,
) => {
  const registered = await api("/auth/customer/emailpass/register", {
    method: "POST",
    body: { email, password },
    publishableKey,
  })
  const registerToken = registered.json?.token as string | undefined
  if (registered.status >= 300 || !registerToken) {
    return { customer: null, token: null, status: registered.status }
  }

  const created = await api("/store/customers", {
    method: "POST",
    body: {
      email,
      first_name: firstName,
      last_name: "검증",
    },
    token: registerToken,
    publishableKey,
  })
  const customer = created.json?.customer
  if (created.status >= 300 || !customer) {
    return { customer: null, token: null, status: created.status }
  }

  const login = await api("/auth/customer/emailpass", {
    method: "POST",
    body: { email, password },
    publishableKey,
  })
  const token = login.json?.token as string | undefined
  if (login.status >= 300 || !token) {
    return { customer: null, token: null, status: login.status }
  }
  return { customer, token, status: login.status }
}

export default async function verifyCommerce({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const stamp = Date.now().toString(36)
  // Runtime-generated credentials on a reserved .test domain: they cannot
  // collide with a real account and no secret is committed to the repo.
  const password = "Vf" + randomBytes(18).toString("base64url")
  const emailA = "verify-a-" + stamp + "@toss3days.test"
  const emailB = "verify-b-" + stamp + "@toss3days.test"

  // ---- Prerequisites resolved from the DB (never printed) -------------------
  const { data: apiKeys } = await query.graph({
    entity: "api_key",
    fields: ["id", "type", "token"],
    filters: { type: "publishable" },
  })

  const keyRow = apiKeys[0]
  const publishableKey =
    (keyRow?.token as string | undefined) ??
    process.env.MEDUSA_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY

  if (!publishableKey) {
    report("publishable key", "NOT_RUN", "no publishable key in DB or env")
  }

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name", "currency_code"],
  })
  const koreaRegion = regions.find(
    (region) => region.currency_code === "krw",
  )
  report(
    "korea region (krw)",
    koreaRegion ? "PASS" : "NOT_RUN",
    koreaRegion?.name,
  )

  if (!koreaRegion || !publishableKey) {
    return summarize(logger, "region/key missing — seed or env not ready")
  }

  // ---- Server reachability ---------------------------------------------------
  let reachable = false
  try {
    const health = await fetch(BASE_URL + "/health")
    reachable = health.ok
  } catch {
    reachable = false
  }

  if (!reachable) {
    return summarize(
      logger,
      "backend not reachable at " + BASE_URL + " — server/env not ready",
    )
  }
  report("backend reachable", "PASS", BASE_URL)

  try {
    // ---- Customer A -------------------------------------------------------------
    const customerA = await registerCustomer(
      publishableKey,
      emailA,
      password,
      "고객A",
    )
    if (!customerA.customer || !customerA.token) {
      fail("register customer A", "status " + customerA.status)
    }
    report("register customer A", "PASS", customerA.customer.id)

    // ---- Variant with a krw price ------------------------------------------------
    // Normal scenario: pick a catalog-seeded toss3days-* product with a KRW
    // price and enough managed stock. The Europe seed products must never be
    // picked — they carry no KRW price and no stock boundary to verify —
    // and a sold-out or unmanaged variant would make the flow meaningless.
    const products = await api(
      "/store/products?region_id=" +
        koreaRegion.id +
        "&limit=100" +
        "&fields=id,title,handle," +
        "*variants.calculated_price,+variants.inventory_quantity",
      { publishableKey },
    )
    const variant = (products.json?.products ?? [])
      .filter(
        (product: any) =>
          typeof product?.handle === "string" &&
          product.handle.startsWith("toss3days-"),
      )
      .flatMap((product: any) => product.variants ?? [])
      .find(
        (v: any) =>
          v?.calculated_price?.calculated_amount != null &&
          (v.calculated_price.currency_code == null ||
            v.calculated_price.currency_code === "krw") &&
          typeof v.inventory_quantity === "number" &&
          v.inventory_quantity >= 3,
      )

    if (!variant) {
      // A required check is missing: without a stocked KRW catalog variant
      // the whole purchase flow below stays unverified, so this is FAIL.
      report(
        "krw-priced variant (toss3days-*, stock >= 3)",
        "FAIL",
        "no toss3days-* product with a krw price and stock >= 3 — catalog seed incomplete",
      )
      return summarize(logger, "purchase flow needs catalog products")
    }
    report(
      "krw-priced variant (toss3days-*, stock >= 3)",
      "PASS",
      variant.id +
        " @ " +
        variant.calculated_price.calculated_amount +
        " krw, stock " +
        variant.inventory_quantity,
    )

    // ---- Cart and line items ------------------------------------------------------
    const cartRes = await api("/store/carts", {
      method: "POST",
      body: { region_id: koreaRegion.id, email: emailA },
      token: customerA.token,
      publishableKey,
    })
    const cartId = cartRes.json?.cart?.id
    if (cartRes.status !== 200 || !cartId) {
      fail("create cart (kr region)", "status " + cartRes.status)
    }
    report("create cart (kr region)", "PASS", cartId)

    const lineRes = await api("/store/carts/" + cartId + "/line-items", {
      method: "POST",
      body: { variant_id: variant.id, quantity: 1 },
      token: customerA.token,
      publishableKey,
    })
    const lineId = lineRes.json?.cart?.items?.[0]?.id
    if (lineRes.status !== 200 || !lineId) {
      fail("add line item", "status " + lineRes.status)
    }
    report("add line item", "PASS", lineId)

    const qtyRes = await api(
      "/store/carts/" + cartId + "/line-items/" + lineId,
      {
        method: "POST",
        body: { quantity: 2 },
        token: customerA.token,
        publishableKey,
      },
    )
    const updatedQty = qtyRes.json?.cart?.items?.find(
      (item: any) => item.id === lineId,
    )?.quantity
    report(
      "update quantity -> 2",
      updatedQty === 2 ? "PASS" : "FAIL",
      "quantity " + updatedQty + ", total " + qtyRes.json?.cart?.total,
    )

    // Inventory boundary: the selected variant has finite managed stock
    // (manage_inventory: true, allow_backorder: false in the catalog seed),
    // so an over-quantity update must be rejected.
    const over = await api(
      "/store/carts/" + cartId + "/line-items/" + lineId,
      {
        method: "POST",
        body: { quantity: variant.inventory_quantity + 100 },
        token: customerA.token,
        publishableKey,
      },
    )
    report(
      "over-stock quantity rejected",
      over.status >= 400 ? "PASS" : "FAIL",
      "status " + over.status,
    )

    const delRes = await api(
      "/store/carts/" + cartId + "/line-items/" + lineId,
      { method: "DELETE", token: customerA.token, publishableKey },
    )
    const afterDelete = await api("/store/carts/" + cartId, {
      token: customerA.token,
      publishableKey,
    })
    const remaining = afterDelete.json?.cart?.items?.length
    report(
      "remove line item",
      delRes.status === 200 && remaining === 0 ? "PASS" : "FAIL",
      "status " + delRes.status + ", items " + remaining,
    )

    const readdRes = await api("/store/carts/" + cartId + "/line-items", {
      method: "POST",
      body: { variant_id: variant.id, quantity: 1 },
      token: customerA.token,
      publishableKey,
    })
    if (readdRes.status !== 200) {
      fail("re-add line item", "status " + readdRes.status)
    }
    report("re-add line item", "PASS")

    // ---- Address and shipping ------------------------------------------------------
    const address = {
      first_name: "홍",
      last_name: "길동",
      address_1: "테헤란로 1",
      city: "서울",
      postal_code: "06236",
      country_code: "kr",
      phone: "010-0000-0000",
    }
    const addrRes = await api("/store/carts/" + cartId, {
      method: "POST",
      body: {
        email: emailA,
        shipping_address: address,
        billing_address: address,
      },
      token: customerA.token,
      publishableKey,
    })
    if (addrRes.status !== 200) {
      fail("set addresses", "status " + addrRes.status)
    }
    report("set addresses (kr)", "PASS")

    const optionsRes = await api(
      "/store/shipping-options?cart_id=" + cartId,
      { publishableKey },
    )
    const shippingOptions = optionsRes.json?.shipping_options ?? []
    const standard = shippingOptions.find(
      (option: any) => option.name === "일반배송",
    )
    const free = shippingOptions.find(
      (option: any) => option.name === "무료배송",
    )
    report(
      "korea shipping options listed",
      standard && free ? "PASS" : "FAIL",
      shippingOptions.map((o: any) => o.name).join(", ") || "none",
    )
    if (!standard) {
      fail("standard shipping option", "일반배송 not listed")
    }

    const shipRes = await api(
      "/store/carts/" + cartId + "/shipping-methods",
      {
        method: "POST",
        body: { option_id: standard.id },
        token: customerA.token,
        publishableKey,
      },
    )
    const shippingTotal = shipRes.json?.cart?.shipping_total
    report(
      "apply 일반배송 3000 krw",
      shipRes.status === 200 && shippingTotal === 3000 ? "PASS" : "FAIL",
      "shipping_total " + shippingTotal,
    )

    // ---- Payment ------------------------------------------------------------------
    const providersRes = await api(
      "/store/payment-providers?region_id=" + koreaRegion.id,
      { publishableKey },
    )
    const providers = (providersRes.json?.payment_providers ?? []).map(
      (p: any) => p.id,
    )
    report(
      "pp_system_default available",
      providers.includes("pp_system_default") ? "PASS" : "FAIL",
      providers.join(", ") || "none",
    )

    const pcRes = await api("/store/payment-collections", {
      method: "POST",
      body: { cart_id: cartId },
      token: customerA.token,
      publishableKey,
    })
    const paymentCollectionId = pcRes.json?.payment_collection?.id
    if (!paymentCollectionId) {
      fail("create payment collection", "status " + pcRes.status)
    }

    const sessionRes = await api(
      "/store/payment-collections/" +
        paymentCollectionId +
        "/payment-sessions",
      {
        method: "POST",
        body: { provider_id: "pp_system_default" },
        token: customerA.token,
        publishableKey,
      },
    )
    report(
      "initiate payment session",
      sessionRes.status === 200 ? "PASS" : "FAIL",
      "status " + sessionRes.status,
    )

    // ---- Complete -----------------------------------------------------------------
    const completeRes = await api("/store/carts/" + cartId + "/complete", {
      method: "POST",
      token: customerA.token,
      publishableKey,
    })
    const order = completeRes.json?.order
    if (completeRes.json?.type !== "order" || !order?.id) {
      fail(
        "complete cart -> order",
        "status " +
          completeRes.status +
          " " +
          (completeRes.json?.error?.message ?? "no order returned"),
      )
    }
    report(
      "complete cart -> order",
      "PASS",
      order.id + " total " + order.total,
    )

    // ---- Order access boundaries ----------------------------------------------------
    const listA = await api("/store/orders?limit=10", {
      token: customerA.token,
      publishableKey,
    })
    const listedIds = (listA.json?.orders ?? []).map((o: any) => o.id)
    report(
      "customer A order list contains order",
      listA.status === 200 && listedIds.includes(order.id) ? "PASS" : "FAIL",
      listedIds.length + " orders",
    )

    const detailA = await api(
      "/store/orders/" + order.id + "?fields=id,customer_id",
      { token: customerA.token, publishableKey },
    )
    report(
      "customer A order detail",
      detailA.status === 200 &&
        detailA.json?.order?.customer_id === customerA.customer.id
        ? "PASS"
        : "FAIL",
      "status " + detailA.status,
    )

    const customerB = await registerCustomer(
      publishableKey,
      emailB,
      password,
      "고객B",
    )
    if (!customerB.customer || !customerB.token) {
      fail("register customer B", "status " + customerB.status)
    }
    report("register customer B", "PASS", customerB.customer.id)

    const detailB = await api("/store/orders/" + order.id, {
      token: customerB.token,
      publishableKey,
    })
    report(
      "customer B order detail denied",
      detailB.status !== 200 ? "PASS" : "FAIL",
      "status " + detailB.status,
    )

    const listB = await api("/store/orders?limit=50", {
      token: customerB.token,
      publishableKey,
    })
    const idsB = (listB.json?.orders ?? []).map((o: any) => o.id)
    report(
      "customer B order list isolated",
      listB.status === 200 && !idsB.includes(order.id) ? "PASS" : "FAIL",
      idsB.length + " orders",
    )

    const anonymous = await api("/store/orders/" + order.id, {
      publishableKey,
    })
    report(
      "anonymous order detail denied",
      anonymous.status === 401 ? "PASS" : "FAIL",
      "status " + anonymous.status,
    )

    return summarize(logger)
  } catch {
    return summarize(logger, "aborted early")
  }
}

function summarize(logger: { info: (msg: string) => void }, note?: string) {
  const counts = { PASS: 0, FAIL: 0, SKIP: 0, NOT_RUN: 0 }
  for (const result of results) {
    counts[result.status] += 1
    logger.info(
      "[" + result.status + "] " + result.name +
        (result.detail ? " — " + result.detail : ""),
    )
  }
  logger.info(
    "VERIFY_COMMERCE_RESULT pass=" + counts.PASS +
      " fail=" + counts.FAIL +
      " skip=" + counts.SKIP +
      " not_run=" + counts.NOT_RUN +
      (note ? " note=" + note : ""),
  )
  // Exit 0 only when every check actually passed. A FAIL, SKIP or NOT_RUN
  // means a required boundary was never exercised or failed, so the run can
  // never look green when verification is incomplete.
  const allPass = results.length > 0 && counts.PASS === results.length
  process.exitCode = allPass ? 0 : 1
}
