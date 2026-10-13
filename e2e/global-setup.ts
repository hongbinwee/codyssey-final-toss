import { e2eEnv } from "./utils/env"

// 서버 미기동 상태에서 전체 스위트가 흔들리지 않도록 사전 확인한다.
const globalSetup = async () => {
  const backend = await fetch(e2eEnv.backendURL + "/health").catch(() => null)
  if (!backend?.ok) {
    throw new Error(
      "[E2E] Medusa backend 미응답: " +
        e2eEnv.backendURL +
        "/health — backend:dev 먼저 실행"
    )
  }
  const storefront = await fetch(e2eEnv.baseURL, {
    redirect: "manual",
  }).catch(() => null)
  if (!storefront || storefront.status >= 500) {
    throw new Error(
      "[E2E] Storefront 미응답: " + e2eEnv.baseURL + " — storefront:dev 먼저 실행"
    )
  }
}

export default globalSetup