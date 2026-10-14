"use client"

import {
  House,
  ShoppingBag,
  ShoppingCart,
  User,
} from "@medusajs/icons"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { clx } from "@modules/common/components/ui"
import { useParams, usePathname } from "next/navigation"

type NavItem = {
  href: string
  label: string
  icon: typeof House
  testId: string
  isActive: (path: string) => boolean
}

const ITEMS: NavItem[] = [
  {
    href: "/",
    label: "홈",
    icon: House,
    testId: "bottom-nav-home",
    isActive: (path) => path === "/" || path === "",
  },
  {
    href: "/store",
    label: "상품",
    icon: ShoppingBag,
    testId: "bottom-nav-store",
    isActive: (path) =>
      path.startsWith("/store") ||
      path.startsWith("/products") ||
      path.startsWith("/categories") ||
      path.startsWith("/collections"),
  },
  {
    href: "/cart",
    label: "장바구니",
    icon: ShoppingCart,
    testId: "bottom-nav-cart",
    isActive: (path) => path.startsWith("/cart"),
  },
  {
    href: "/account",
    label: "내 쇼핑",
    icon: User,
    testId: "bottom-nav-account",
    isActive: (path) => path.startsWith("/account"),
  },
]

const BottomNavBar = ({ cartCount }: { cartCount: number }) => {
  const pathname = usePathname()
  const { countryCode } = useParams() as { countryCode?: string }

  const path = countryCode
    ? pathname.replace(new RegExp("^/" + countryCode), "") || "/"
    : pathname

  return (
    <nav
      aria-label="하단 내비게이션"
      className="small:hidden fixed inset-x-0 bottom-0 z-40 border-t border-ui-border-base bg-ui-bg-base pb-[env(safe-area-inset-bottom)]"
      data-testid="mobile-bottom-nav"
    >
      <ul className="grid grid-cols-4">
        {ITEMS.map((item) => {
          const Icon = item.icon
          const active = item.isActive(path)
          return (
            <li key={item.href}>
              <LocalizedClientLink
                href={item.href}
                className={clx(
                  "relative flex h-14 flex-col items-center justify-center gap-y-0.5 text-[11px] leading-4",
                  active
                    ? "font-semibold text-ui-fg-base"
                    : "text-ui-fg-muted hover:text-ui-fg-subtle"
                )}
                data-testid={item.testId}
              >
                <span className="relative">
                  <Icon className="h-[22px] w-[22px]" />
                  {item.href === "/cart" && cartCount > 0 && (
                    <span
                      className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ui-tag-red-text px-1 text-[10px] font-bold text-white"
                      data-testid="bottom-nav-cart-badge"
                    >
                      {cartCount > 99 ? "99+" : cartCount}
                    </span>
                  )}
                </span>
                <span>{item.label}</span>
              </LocalizedClientLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export default BottomNavBar
