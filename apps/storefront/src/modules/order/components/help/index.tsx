import { Heading } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import React from "react"

const Help = () => {
  return (
    <div className="mt-6">
      <Heading className="text-base-semi">도움이 필요하세요?</Heading>
      <div className="text-base-regular my-2">
        <ul className="gap-y-2 flex flex-col">
          <li>
            <LocalizedClientLink href="/contact">문의하기</LocalizedClientLink>
          </li>
          <li>
            <LocalizedClientLink href="/contact">반품·교환</LocalizedClientLink>
          </li>
        </ul>
      </div>
    </div>
  )
}

export default Help
