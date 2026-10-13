import fs from "node:fs"
import path from "node:path"

// 지정 worktree 루트 (e2e/utils 기준 두 단계 위)
const REPO_ROOT = path.resolve(__dirname, "..", "..")
// .env는 gitignore 대상이라 worktree에 복사되지 않는다. 없으면 메인 checkout을 참조한다.
const MAIN_CHECKOUT = path.resolve(REPO_ROOT, "..", "..", "commerce")

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

// .env → .env.local 순으로 병합(뒤가 우선), 메인 checkout → worktree 순
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
  // 비우면 활성 리전에서 자동 해석한다.
  countryCode: process.env.E2E_COUNTRY_CODE ?? "",
  customerPassword: process.env.E2E_CUSTOMER_PASSWORD,
}