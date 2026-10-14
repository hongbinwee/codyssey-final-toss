import { Metadata } from "next"

import InteractiveLink from "@modules/common/components/interactive-link"

export const metadata: Metadata = {
  title: "404",
  description: "페이지를 찾을 수 없어요",
}

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)]">
      <h1 className="text-2xl-semi text-ui-fg-base">페이지를 찾을 수 없어요</h1>
      <p className="text-small-regular text-ui-fg-base">
        장바구니를 불러올 수 없어요. 쿠키를 삭제한 뒤 다시 시도해주세요.
      </p>
      <InteractiveLink href="/">홈으로 가기</InteractiveLink>
    </div>
  )
}
