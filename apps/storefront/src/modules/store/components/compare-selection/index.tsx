"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { XMarkMini } from "@medusajs/icons"

/**
 * /store 목록·조건 검색 결과 카드에서 2~4개를 골라 /compare로 보내는 선택 상태.
 * variant를 아는 결과(조건 검색)는 variantId를, 모르는 카드(검색 히트)는 null을
 * 넣어 /compare 쿼리에서 products와 variants가 같은 순서로 대응하게 한다.
 */
export type CompareItem = {
  handle: string
  variantId: string | null
  title: string
}

const MAX_COMPARE_ITEMS = 4
const MIN_COMPARE_ITEMS = 2

type CompareSelectionContextValue = {
  items: CompareItem[]
  count: number
  /** 4개 상한 도달 — 새 항목 추가 불가 */
  full: boolean
  isSelected: (handle: string) => boolean
  toggle: (item: CompareItem) => void
  remove: (handle: string) => void
}

const CompareSelectionContext =
  createContext<CompareSelectionContextValue | null>(null)

export const CompareSelectionProvider = ({
  children,
}: {
  children: ReactNode
}) => {
  const [items, setItems] = useState<CompareItem[]>([])

  const toggle = useCallback((item: CompareItem) => {
    setItems((prev) => {
      if (prev.some((current) => current.handle === item.handle)) {
        return prev.filter((current) => current.handle !== item.handle)
      }
      if (prev.length >= MAX_COMPARE_ITEMS) {
        return prev
      }
      return [...prev, item]
    })
  }, [])

  const remove = useCallback((handle: string) => {
    setItems((prev) => prev.filter((entry) => entry.handle !== handle))
  }, [])

  const value = useMemo<CompareSelectionContextValue>(
    () => ({
      items,
      count: items.length,
      full: items.length >= MAX_COMPARE_ITEMS,
      isSelected: (handle) => items.some((entry) => entry.handle === handle),
      toggle,
      remove,
    }),
    [items, toggle, remove]
  )

  return (
    <CompareSelectionContext.Provider value={value}>
      {children}
    </CompareSelectionContext.Provider>
  )
}

/** provider 밖에서는 null을 반환 — 카드가 버튼을 숨기는 신호로 쓴다 */
export const useCompareSelection = () => useContext(CompareSelectionContext)

export const CompareToggle = ({ item }: { item: CompareItem }) => {
  const context = useCompareSelection()
  if (!context) {
    return null
  }

  const selected = context.isSelected(item.handle)
  const disabled = !selected && context.full

  return (
    <button
      type="button"
      data-testid="compare-toggle"
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => context.toggle(item)}
      className="mt-2 inline-flex items-center rounded-lg border border-ui-border-base px-3 py-1.5 text-xs font-medium text-ui-fg-base transition-colors hover:bg-ui-bg-subtle disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:border-ui-fg-interactive aria-pressed:text-ui-fg-interactive"
    >
      {selected ? "비교 해제" : "비교 담기"}
    </button>
  )
}

export const CompareTray = () => {
  const context = useCompareSelection()
  if (!context || context.count === 0) {
    return null
  }

  const href =
    "/compare?products=" +
    context.items.map((item) => item.handle).join(",") +
    "&variants=" +
    context.items.map((item) => item.variantId ?? "").join(",")

  return (
    <div
      data-testid="compare-tray"
      className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 border-t border-ui-border-base bg-ui-bg-base/95 backdrop-blur small:bottom-0"
    >
      <div className="content-container flex items-center gap-x-4 gap-y-2 py-3 flex-wrap">
        <span
          className="text-sm font-medium text-ui-fg-base"
          data-testid="compare-tray-count"
        >
          {context.count}개 선택됨
        </span>
        <ul className="flex items-center gap-x-2 gap-y-1 flex-wrap">
          {context.items.map((item) => (
            <li
              key={item.handle}
              className="flex items-center gap-x-1 rounded-full bg-ui-bg-subtle px-2.5 py-1 text-xs text-ui-fg-base"
            >
              <span className="max-w-32 truncate">{item.title}</span>
              <button
                type="button"
                aria-label={item.title + " 비교에서 제외"}
                onClick={() => context.remove(item.handle)}
                className="text-ui-fg-muted hover:text-ui-fg-base"
              >
                <XMarkMini />
              </button>
            </li>
          ))}
        </ul>
        {context.count >= MIN_COMPARE_ITEMS ? (
          <LocalizedClientLink
            href={href}
            data-testid="compare-open"
            className="ml-auto inline-flex items-center rounded-lg bg-ui-fg-base px-4 py-2 text-sm font-semibold text-ui-bg-base"
          >
            비교하기
          </LocalizedClientLink>
        ) : (
          <span
            data-testid="compare-open"
            aria-disabled="true"
            className="ml-auto inline-flex items-center rounded-lg bg-ui-bg-disabled px-4 py-2 text-sm font-semibold text-ui-fg-disabled"
          >
            2개 이상 선택해주세요
          </span>
        )}
      </div>
    </div>
  )
}
