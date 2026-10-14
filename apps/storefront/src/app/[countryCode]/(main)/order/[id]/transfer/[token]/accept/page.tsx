import { acceptTransferRequest } from "@lib/data/orders"
import { Heading, Text } from "@modules/common/components/ui"
import TransferImage from "@modules/order/components/transfer-image"

export default async function TransferPage({
  params,
}: {
  params: { id: string; token: string }
}) {
  const { id, token } = params

  const { success, error } = await acceptTransferRequest(id, token)

  return (
    <div className="flex flex-col gap-y-4 items-start w-2/5 mx-auto mt-10 mb-20">
      <TransferImage />
      <div className="flex flex-col gap-y-6">
        {success && (
          <>
            <Heading level="h1" className="text-xl text-ui-fg-base">
              주문이 이전됐어요
            </Heading>
            <Text className="text-ui-fg-subtle">
              주문 {id}의 소유권이 새 소유자에게 이전됐어요.
            </Text>
          </>
        )}
        {!success && (
          <>
            <Text className="text-ui-fg-subtle">
              이전을 수락하는 중 오류가 발생했어요. 다시 시도해주세요.
            </Text>
            {error && (
              <Text className="text-ui-fg-error">오류: {error}</Text>
            )}
          </>
        )}
      </div>
    </div>
  )
}
