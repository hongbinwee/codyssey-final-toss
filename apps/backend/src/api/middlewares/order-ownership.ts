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
 * Core "GET /store/orders/:id" is intentionally unauthenticated: the order ID
 * alone grants access. After "authenticate('customer')" runs, this middleware
 * requires the order to belong to the logged-in customer. Missing and foreign
 * orders both answer 404 so the endpoint does not reveal which IDs exist.
 */
export async function ensureOrderOwnership(
  req: AuthenticatedMedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // express 5 typings dropped req.params; the matcher guarantees :id.
  const { id } = (req as unknown as { params: Record<string, string> }).params

  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: ["id", "customer_id"],
    filters: { id },
  })

  if (!order || order.customer_id !== req.auth_context.actor_id) {
    return next(
      new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found"),
    )
  }

  next()
}
