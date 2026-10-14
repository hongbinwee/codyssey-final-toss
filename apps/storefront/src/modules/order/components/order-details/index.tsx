import { HttpTypes } from "@medusajs/types"
import { Text } from "@modules/common/components/ui"

type OrderDetailsProps = {
  order: HttpTypes.StoreOrder
  showStatus?: boolean
}

const OrderDetails = ({ order, showStatus }: OrderDetailsProps) => {
  const formatStatus = (str: string) => {
    const formatted = str.split("_").join(" ")

    return formatted.slice(0, 1).toUpperCase() + formatted.slice(1)
  }

  const fulfillmentStatusMap: Record<string, string> = {
    not_fulfilled: "출고 준비 중",
    partially_fulfilled: "일부 출고 처리",
    fulfilled: "출고 처리 완료",
    partially_shipped: "일부 발송",
    shipped: "발송 완료",
    partially_delivered: "일부 배송 완료",
    delivered: "배송 완료",
    canceled: "취소됨",
  }

  const paymentStatusMap: Record<string, string> = {
    not_paid: "결제 대기",
    awaiting: "결제 대기",
    authorized: "결제 승인",
    partially_authorized: "일부 승인",
    captured: "결제 완료",
    partially_captured: "일부 결제 완료",
    partially_refunded: "부분 환불",
    refunded: "환불 완료",
    canceled: "취소됨",
  }

  const toKorean = (status: string, map: Record<string, string>) =>
    map[status] ?? formatStatus(status)

  return (
    <div>
      <Text>
        주문 이메일:{" "}
        <span
          className="text-ui-fg-medium-plus font-semibold"
          data-testid="order-email"
        >
          {order.email}
        </span>
      </Text>
      <Text className="mt-2">
        주문일:{" "}
        <span data-testid="order-date">
          {new Date(order.created_at).toLocaleDateString("ko-KR")}
        </span>
      </Text>
      <Text className="mt-2 text-ui-fg-interactive">
        주문 번호: <span data-testid="order-id">{order.display_id}</span>
      </Text>

      <div className="flex items-center text-compact-small gap-x-4 mt-4">
        {showStatus && (
          <>
            <Text>
              주문 상태:{" "}
              <span className="text-ui-fg-subtle " data-testid="order-status">
                {toKorean(order.fulfillment_status, fulfillmentStatusMap)}
              </span>
            </Text>
            <Text>
              결제 상태:{" "}
              <span
                className="text-ui-fg-subtle "
                data-testid="order-payment-status"
              >
                {toKorean(order.payment_status, paymentStatusMap)}
              </span>
            </Text>
          </>
        )}
      </div>
    </div>
  )
}

export default OrderDetails
