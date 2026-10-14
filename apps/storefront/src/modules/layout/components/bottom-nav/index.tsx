import { retrieveCart } from "@lib/data/cart"

import BottomNavBar from "./nav-bar"

const BottomNav = async () => {
  const cart = await retrieveCart().catch(() => null)
  const cartCount =
    cart?.items?.reduce((acc, item) => acc + item.quantity, 0) ?? 0

  return <BottomNavBar cartCount={cartCount} />
}

export default BottomNav
