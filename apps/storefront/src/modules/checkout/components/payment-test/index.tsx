import { Badge } from "@modules/common/components/ui"

const PaymentTest = ({ className }: { className?: string }) => {
  return (
    <Badge color="orange" className={className}>
      <span className="font-semibold">테스트:</span> 실제 결제 없이 주문이
      생성되는 모의 결제예요
    </Badge>
  )
}

export default PaymentTest
