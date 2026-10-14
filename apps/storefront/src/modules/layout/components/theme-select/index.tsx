"use client"

import {
  Popover,
  PopoverButton,
  PopoverPanel,
  Transition,
} from "@headlessui/react"
import { CheckMini, ComputerDesktop, Moon, Sun } from "@medusajs/icons"
import { clx } from "@modules/common/components/ui"
import { Fragment, useEffect, useState } from "react"

const STORAGE_KEY = "3days-theme"

type ThemeChoice = "light" | "dark" | "system"

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "라이트", icon: Sun },
  { value: "dark", label: "다크", icon: Moon },
  { value: "system", label: "시스템", icon: ComputerDesktop },
]

const isValid = (value: string | null): value is ThemeChoice =>
  value === "light" || value === "dark" || value === "system"

const applyTheme = (choice: ThemeChoice) => {
  const dark =
    choice === "dark" ||
    (choice === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("dark", dark)
}

const ThemeSelect = () => {
  const [theme, setTheme] = useState<ThemeChoice>("system")

  useEffect(() => {
    // Storage can throw (blocked cookies, privacy modes) — fall back to system.
    let stored: string | null = null
    try {
      stored = localStorage.getItem(STORAGE_KEY)
    } catch {}
    const initial = isValid(stored) ? stored : "system"
    setTheme(initial)
    applyTheme(initial)
  }, [])

  // 시스템 모드에서는 OS 테마 변경을 즉시 반영한다.
  useEffect(() => {
    if (theme !== "system") {
      return
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => applyTheme("system")
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [theme])

  const select = (choice: ThemeChoice) => {
    setTheme(choice)
    try {
      localStorage.setItem(STORAGE_KEY, choice)
    } catch {}
    applyTheme(choice)
  }

  const CurrentIcon =
    OPTIONS.find((o) => o.value === theme)?.icon ?? ComputerDesktop

  return (
    <Popover className="relative flex items-center h-full">
      <PopoverButton
        type="button"
        aria-label="테마 선택"
        className="flex items-center hover:text-ui-fg-base"
        data-testid="theme-select-button"
      >
        <CurrentIcon />
      </PopoverButton>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-150"
        enterFrom="opacity-0 translate-y-1"
        enterTo="opacity-100 translate-y-0"
        leave="transition ease-in duration-100"
        leaveFrom="opacity-100 translate-y-0"
        leaveTo="opacity-0 translate-y-1"
      >
        <PopoverPanel className="absolute right-0 top-full mt-2 w-40 rounded-xl border border-ui-border-base bg-ui-bg-base p-1 shadow-elevation-card-hover z-[60]">
          {OPTIONS.map((option) => {
            const Icon = option.icon
            const selected = option.value === theme
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => select(option.value)}
                aria-pressed={selected}
                className={clx(
                  "flex w-full items-center gap-x-2 rounded-lg px-3 py-2 text-left text-small-regular",
                  selected
                    ? "text-ui-fg-base bg-ui-bg-subtle"
                    : "text-ui-fg-subtle hover:bg-ui-bg-base-hover"
                )}
                data-testid={"theme-option-" + option.value}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{option.label}</span>
                {selected && <CheckMini className="text-ui-fg-interactive" />}
              </button>
            )
          })}
        </PopoverPanel>
      </Transition>
    </Popover>
  )
}

export default ThemeSelect
