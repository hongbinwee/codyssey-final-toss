import { Heading } from "@modules/common/components/ui"
import React from "react"

const Help = () => {
  return (
    <div className="mt-6">
      <Heading className="text-base-semi">도움이 필요하세요?</Heading>
      <div className="text-base-regular my-2 text-ui-fg-subtle">
        문의 및 반품·교환 안내는 현재 제공하지 않습니다.
      </div>
    </div>
  )
}

export default Help
