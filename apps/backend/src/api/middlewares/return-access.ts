import type {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

/**
 * Core "POST /store/returns" is intentionally unauthenticated: the order ID
 * alone would grant a return request, and "receive_now" plus shipping price
 * and stock location fields are trusted inputs. After
 * "authenticate('customer')" runs, this middleware requires the referenced
 * order to belong to the logged-in customer, answers 404 for missing and
 * foreign orders alike so the endpoint does not reveal which IDs exist, and
 * rejects fields customers must not control.
 *
 * Custom middleware can run before the core body validator, so the raw body
 * is read here and a missing or malformed "order_id" is delegated to the
 * core validator's standard 400 instead of failing in this middleware.
 */
export async function ensureReturnAccess(
  req: AuthenticatedMedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) {
  const body = ((req.validatedBody ?? req.body) ?? {}) as Record<
    string,
    unknown
  >
  const orderId =
    typeof body.order_id === "string" ? body.order_id : undefined

  if (!orderId) {
    return next()
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: ["id", "customer_id"],
    filters: { id: orderId },
  })

  if (!order || order.customer_id !== req.auth_context.actor_id) {
    return next(
      new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found"),
    )
  }

  const shipping =
    body.return_shipping && typeof body.return_shipping === "object"
      ? (body.return_shipping as Record<string, unknown>)
      : undefined

  if (
    Boolean(body.receive_now) ||
    body.location_id != null ||
    shipping?.price != null
  ) {
    return next(
      new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Return requests cannot set receive_now, location_id, or return_shipping.price",
      ),
    )
  }

  next()
}
