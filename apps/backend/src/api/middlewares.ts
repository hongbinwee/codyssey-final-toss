import {
  authenticate,
  configureStoreSearch,
  defineMiddlewares,
} from '@medusajs/framework/http'

import { ensureOrderOwnership } from './middlewares/order-ownership'

// The product index declares filterable `status` and `sales_channel_ids`, so
// the route narrows it to published products in the key's sales channels.
export default defineMiddlewares({
  routes: [
    {
      method: ['POST'],
      matcher: '/store/search',
      middlewares: [
        configureStoreSearch({
          allowed_indexes: {
            product: true,
          },
        }),
      ],
    },
    {
      // The core GET /store/orders/:id route treats the order ID itself as the
      // secret. Require a logged-in customer plus ownership instead; the core
      // route handler stays untouched and keeps its query validation.
      method: ['GET'],
      matcher: '/store/orders/:id',
      middlewares: [
        authenticate('customer', ['session', 'bearer']),
        ensureOrderOwnership,
      ],
    },
  ],
})
