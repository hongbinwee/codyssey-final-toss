import { retrieveOrder } from "@lib/data/orders"
import OrderCompletedTemplate from "@modules/order/templates/order-completed-template"
import InteractiveLink from "@modules/common/components/interactive-link"
import { Metadata } from "next"

type Props = {
  params: Promise<{ id: string }>
}
export const metadata: Metadata = {
  title: "주문 완료",
  description: "주문이 정상적으로 접수됐어요",
}

export default async function OrderConfirmedPage(props: Props) {
  const params = await props.params
  const order = await retrieveOrder(params.id).catch(() => null)

  if (!order) {
    // 주문 조회에는 로그인 + 소유자 검증이 필요하다. 게스트 주문의 확정 화면은
    // 주문 번호와 이동 링크만 노출한다.
    return (
      <div className="py-6 min-h-[calc(100vh-64px)]">
        <div
          className="content-container flex flex-col items-center justify-center gap-y-6 py-24 text-center"
          data-testid="order-complete-container"
        >
          <h1 className="text-3xl-semi text-ui-fg-base">주문이 접수됐어요</h1>
          <p className="text-base-regular text-ui-fg-subtle">
            주문 번호: <span data-testid="order-id">{params.id}</span>
          </p>
          <p className="text-small-regular text-ui-fg-muted">
            로그인하면 내 쇼핑의 주문 내역에서 다시 확인할 수 있어요.
          </p>
          <div className="flex gap-x-6">
            <InteractiveLink href="/account">내 쇼핑</InteractiveLink>
            <InteractiveLink href="/">홈으로 가기</InteractiveLink>
          </div>
        </div>
      </div>
    )
  }

  return <OrderCompletedTemplate order={order} />
}
