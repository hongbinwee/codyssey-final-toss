import React from "react"

import UnderlineLink from "@modules/common/components/interactive-link"

import AccountNav from "../components/account-nav"
import { HttpTypes } from "@medusajs/types"

interface AccountLayoutProps {
  customer: HttpTypes.StoreCustomer | null
  children: React.ReactNode
}

const AccountLayout: React.FC<AccountLayoutProps> = ({
  customer,
  children,
}) => {
  return (
    <div className="flex-1 small:py-12" data-testid="account-page">
      <div className="flex-1 content-container h-full max-w-5xl mx-auto bg-ui-bg-base flex flex-col">
        <div className="grid grid-cols-1  small:grid-cols-[240px_1fr] py-12">
          <div>{customer && <AccountNav customer={customer} />}</div>
          <div className="flex-1">{children}</div>
        </div>
        <div className="flex flex-col small:flex-row items-end justify-between small:border-t border-ui-border-base py-12 gap-8">
          <div>
            <h3 className="text-xl-semi mb-4">문의가 필요하세요?</h3>
            <span className="txt-medium">
              자주 묻는 질문과 답변은 고객센터에서 확인할 수 있어요.
            </span>
          </div>
          <div>
            <UnderlineLink href="/customer-service">고객센터</UnderlineLink>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AccountLayout
