import { Metadata } from "next"
import { Suspense } from "react"

import VerifyAccount from "@modules/account/components/verify-account"

export const metadata: Metadata = {
  title: "이메일 인증",
  description: "이메일 주소를 인증하면 가입이 완료됩니다.",
}

export default function VerifyAccountPage() {
  return (
    <div className="w-full flex justify-center px-8 py-12">
      <Suspense
        fallback={
          <p className="text-base-regular text-ui-fg-base">
            이메일을 확인하고 있어요…
          </p>
        }
      >
        <VerifyAccount />
      </Suspense>
    </div>
  )
}
