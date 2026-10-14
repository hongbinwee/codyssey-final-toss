import { Heading, Text } from "@modules/common/components/ui"
import TransferActions from "@modules/order/components/transfer-actions"
import TransferImage from "@modules/order/components/transfer-image"

export default async function TransferPage({
  params,
}: {
  params: { id: string; token: string }
}) {
  const { id, token } = params

  return (
    <div className="flex flex-col gap-y-4 items-start w-2/5 mx-auto mt-10 mb-20">
      <TransferImage />
      <div className="flex flex-col gap-y-6">
        <Heading level="h1" className="text-xl text-ui-fg-base">
          주문 {id} 이전 요청
        </Heading>
        <Text className="text-ui-fg-subtle">
          주문({id})의 소유권 이전 요청을 받았어요. 요청에 동의하면 아래
          버튼으로 이전을 승인할 수 있습니다.
        </Text>
        <div className="w-full h-px bg-ui-border-base" />
        <Text className="text-ui-fg-subtle">
          승인하면 이 주문에 대한 모든 권한과 책임이 새 소유자에게 이전됩니다.
        </Text>
        <Text className="text-ui-fg-subtle">
          요청을 알 수 없거나 소유권을 유지하려면 아무 작업도 하지 않으면 됩니다.
        </Text>
        <div className="w-full h-px bg-ui-border-base" />
        <TransferActions id={id} token={token} />
      </div>
    </div>
  )
}
