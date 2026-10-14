import InteractiveLink from "@modules/common/components/interactive-link"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "404",
  description: "페이지를 찾을 수 없어요",
}

export default async function NotFound() {
  return (
    <div className="flex flex-col gap-4 items-center justify-center min-h-[calc(100vh-64px)]">
      <h1 className="text-2xl-semi text-ui-fg-base">페이지를 찾을 수 없어요</h1>
      <p className="text-small-regular text-ui-fg-base">
        요청한 페이지가 존재하지 않아요.
      </p>
      <InteractiveLink href="/">홈으로 가기</InteractiveLink>
    </div>
  )
}
