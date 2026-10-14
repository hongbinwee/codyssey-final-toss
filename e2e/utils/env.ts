import fs from "node:fs"
import path from "node:path"

// 지정 worktree 루트 (e2e/utils 기준 두 단계 위)
const REPO_ROOT = path.resolve(__dirname, "..", "..")
// worktree(.worktrees 하위)면 메인 checkout은 프로젝트 루트의 commerce이다.
// 통합 후에는 REPO_ROOT 자체가 main checkout이므로 같은 경로를 읽는다.
const isWorktree = REPO_ROOT.split(path.sep).includes(".worktrees")
const MAIN_CHECKOUT = isWorktree
  ? path.resolve(REPO_ROOT, "..", "..", "commerce")
  : REPO_ROOT

const parseEnvFile = (file: string): Record<string, string> => {
  if (!fs.existsSync(file)) {
    return {}
  }
  const out: Record<string, string> = {}
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) {
      continue
    }
    const eq = trimmed.indexOf("=")
    if (eq < 0) {
      continue
    }
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

// worktree → 메인 checkout 순으로 .env / .env.local 병합(뒤가 우선)
const loadAppEnv = (appDir: string): Record<string, string> => {
  const candidates = [
    path.join(MAIN_CHECKOUT, appDir, ".env"),
    path.join(MAIN_CHECKOUT, appDir, ".env.local"),
    path.join(REPO_ROOT, appDir, ".env"),
    path.join(REPO_ROOT, appDir, ".env.local"),
  ]
  return candidates.reduce(
    (acc, file) => ({ ...acc, ...parseEnvFile(file) }),
    {} as Record<string, string>
  )
}

const storefrontEnv = loadAppEnv(path.join("apps", "storefront"))

const firstDefined = (...values: (string | undefined)[]) =>
  values.find((v) => typeof v === "string" && v.length > 0)

// 실제 값은 절대 출력·커밋하지 않는다.
export const e2eEnv = {
  baseURL: firstDefined(process.env.E2E_BASE_URL, "http://localhost:8000")!,
  backendURL: firstDefined(
    process.env.E2E_BACKEND_URL,
    storefrontEnv.NEXT_PUBLIC_MEDUSA_BACKEND_URL,
    "http://localhost:9000"
  )!,
  publishableKey: firstDefined(
    process.env.E2E_PUBLISHABLE_KEY,
    storefrontEnv.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
    ""
  )!,
  // 비우면 kr
  countryCode: process.env.E2E_COUNTRY_CODE ?? "kr",
  customerPassword: process.env.E2E_CUSTOMER_PASSWORD,
}

// E2E는 로컬 전용 — 원격 서버를 가리키면 실행 전 즉시 실패한다.
const assertLocalhost = (url: string, label: string) => {
  const host = new URL(url).hostname
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(
      "[E2E] " + label + "은 localhost/127.0.0.1만 허용한다: " + host
    )
  }
}
assertLocalhost(e2eEnv.baseURL, "E2E_BASE_URL")
assertLocalhost(e2eEnv.backendURL, "E2E_BACKEND_URL")