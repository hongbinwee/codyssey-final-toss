import type { Page } from "@playwright/test"
import { randomBytes } from "node:crypto"
import { e2eEnv } from "./env"

// 콘솔/런타임 오류 수집 — 리소스 404·dev 전용 안내는 노이즈로 제외한다.
const IGNORE_PATTERNS = [
  /favicon\.ico/i,
  /React DevTools/i,
  /Failed to load resource.*\.(png|jpe?g|webp|gif|svg|ico|map)/i,
]

export const trackConsoleErrors = (page: Page): string[] => {
  const errors: string[] = []
  page.on("pageerror", (err) => errors.push("pageerror: " + err.message))
  page.on("console", (msg) => {
    if (msg.type() !== "error") {
      return
    }
    const text = msg.text()
    if (IGNORE_PATTERNS.some((re) => re.test(text))) {
      return
    }
    errors.push("console: " + text)
  })
  return errors
}

export const testEmail = (label: string): string =>
  "qa-" +
  label +
  "-" +
  Date.now().toString(36) +
  "-" +
  Math.random().toString(36).slice(2, 6) +
  "@example.test"

// 비밀번호는 env 또는 실행 시 생성 — 소스에 고정값을 두지 않는다.
export const TEST_PASSWORD =
  e2eEnv.customerPassword ?? "Qa9!" + randomBytes(8).toString("base64url")

export const koreanAddress = (countryCode: string) => ({
  first_name: "QA",
  last_name: "토스",
  address_1: "테헤란로 123",
  city: "서울특별시",
  postal_code: "06234",
  province: "",
  phone: "010-1234-5678",
  country_code: countryCode,
})

// KRW는 소수점 없는 통화 — ₩12,000 / 12,000원 형태 모두 허용
export const currencyText = (): RegExp => /₩|원|KRW/

// 가격 텍스트에서 숫자 금액만 추출 (예: "₩12,000" → 12000)
export const amountOf = (text: string | null | undefined): number => {
  const digits = (text ?? "").replace(/[^0-9]/g, "")
  return digits ? Number(digits) : NaN
}