import { retrieveCart } from "@lib/data/cart"
import { retrieveCustomer } from "@lib/data/customer"
import PaymentWrapper from "@modules/checkout/components/payment-wrapper"
import CheckoutForm from "@modules/checkout/templates/checkout-form"
import CheckoutSummary from "@modules/checkout/templates/checkout-summary"
import { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "결제하기",
}

export default async function Checkout(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  const cart = await retrieveCart()

  if (!cart) {
    return notFound()
  }

  const customer = await retrieveCustomer()

  // 주문 조회가 로그인 + 소유자 검증으로 보호되므로 게스트 결제는 허용하지
  // 않는다. 로그인이나 가입을 마치면 같은 장바구니로 결제를 이어간다.
  if (!customer) {
    const checkoutPath = `/${countryCode}/checkout`
    redirect(
      `/${countryCode}/account?next=${encodeURIComponent(checkoutPath)}`
    )
  }

  return (
    <div className="grid grid-cols-1 small:grid-cols-[1fr_416px] content-container gap-x-40 py-12">
      <PaymentWrapper cart={cart}>
        <CheckoutForm cart={cart} customer={customer} />
      </PaymentWrapper>
      <CheckoutSummary cart={cart} />
    </div>
  )
}
