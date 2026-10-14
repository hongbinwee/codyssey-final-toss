import fs from "node:fs"
import path from "node:path"
import { defineConfig, devices } from "@playwright/test"

// SOL이 프로젝트 공용 브라우저 캐시에 Playwright 1.61.1용 Chromium을 설치한다.
// worktree와 통합 checkout 어느 위치에서 실행되든 상위 디렉터리를 올라가며
// .local/browser-cache를 실제로 찾는다. 없으면 기본 글로벌 캐시.
const findBrowserCache = (): string | null => {
  let dir = __dirname
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, ".local", "browser-cache")
    if (fs.existsSync(candidate)) {
      return candidate
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      break
    }
    dir = parent
  }
  return null
}
const sharedBrowserCache = findBrowserCache()
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && sharedBrowserCache) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = sharedBrowserCache
}

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:8000"

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  outputDir: "test-results",
  use: {
    baseURL,
    locale: "ko-KR",
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        colorScheme: "light",
      },
    },
    {
      name: "desktop-dark",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        colorScheme: "dark",
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
        colorScheme: "light",
      },
    },
  ],
})