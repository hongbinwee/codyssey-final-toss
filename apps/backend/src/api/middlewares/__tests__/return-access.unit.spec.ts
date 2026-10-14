/**
 * DB-free checks for the POST /store/returns guard middleware.
 * HTTP-level behavior (401 anonymous, 404 foreign/missing order, 400 invalid
 * body) is verified separately against a live server.
 */
import { MedusaError } from "@medusajs/framework/utils"

import { ensureReturnAccess } from "../return-access"

function makeReq({
  body,
  validatedBody,
  actorId = "cust_1",
  order,
}: {
  body?: Record<string, unknown>
  validatedBody?: Record<string, unknown>
  actorId?: string
  order?: { id: string; customer_id: string }
}) {
  const graph = jest.fn(async () => ({ data: order ? [order] : [] }))
  const req = {
    scope: { resolve: jest.fn(() => ({ graph })) },
    auth_context: { actor_id: actorId },
    body,
    validatedBody,
  }
  return { req: req as never, graph }
}

const ownOrder = { id: "order_1", customer_id: "cust_1" }

describe("ensureReturnAccess", () => {
  it("passes when the customer owns the order and sends a minimal body", async () => {
    const { req, graph } = makeReq({
      body: { order_id: "order_1", items: [] },
      order: ownOrder,
    })
    const next = jest.fn()

    await ensureReturnAccess(req, {} as never, next)

    expect(graph).toHaveBeenCalledWith(
      expect.objectContaining({ filters: { id: "order_1" } }),
    )
    expect(next).toHaveBeenCalledWith()
  })

  it("answers NOT_FOUND for a foreign order", async () => {
    const { req } = makeReq({
      body: { order_id: "order_2" },
      order: { id: "order_2", customer_id: "cust_other" },
    })
    const next = jest.fn()

    await ensureReturnAccess(req, {} as never, next)

    const err = next.mock.calls[0][0] as MedusaError
    expect(err).toBeInstanceOf(MedusaError)
    expect(err.type).toBe(MedusaError.Types.NOT_FOUND)
  })

  it("answers NOT_FOUND for a missing order instead of revealing it", async () => {
    const { req } = makeReq({ body: { order_id: "order_gone" } })
    const next = jest.fn()

    await ensureReturnAccess(req, {} as never, next)

    const err = next.mock.calls[0][0] as MedusaError
    expect(err.type).toBe(MedusaError.Types.NOT_FOUND)
  })

  it("delegates a missing order_id to the core validator", async () => {
    const { req, graph } = makeReq({ body: { items: [] } })
    const next = jest.fn()

    await ensureReturnAccess(req, {} as never, next)

    expect(graph).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith()
  })

  it("prefers validatedBody over the raw body", async () => {
    const { req, graph } = makeReq({
      body: { order_id: "order_raw" },
      validatedBody: { order_id: "order_1" },
      order: ownOrder,
    })
    const next = jest.fn()

    await ensureReturnAccess(req, {} as never, next)

    expect(graph).toHaveBeenCalledWith(
      expect.objectContaining({ filters: { id: "order_1" } }),
    )
    expect(next).toHaveBeenCalledWith()
  })

  it.each([
    ["receive_now", { order_id: "order_1", receive_now: true }],
    ["location_id", { order_id: "order_1", location_id: "sloc_1" }],
    [
      "return_shipping.price",
      {
        order_id: "order_1",
        return_shipping: { option_id: "so_1", price: 0 },
      },
    ],
  ])("rejects customer-controlled field %s", async (_name, body) => {
    const { req } = makeReq({ body, order: ownOrder })
    const next = jest.fn()

    await ensureReturnAccess(req, {} as never, next)

    const err = next.mock.calls[0][0] as MedusaError
    expect(err).toBeInstanceOf(MedusaError)
    expect(err.type).toBe(MedusaError.Types.INVALID_DATA)
  })

  it("allows return_shipping without a customer-set price", async () => {
    const { req } = makeReq({
      body: {
        order_id: "order_1",
        return_shipping: { option_id: "so_1" },
      },
      order: ownOrder,
    })
    const next = jest.fn()

    await ensureReturnAccess(req, {} as never, next)

    expect(next).toHaveBeenCalledWith()
  })
})
