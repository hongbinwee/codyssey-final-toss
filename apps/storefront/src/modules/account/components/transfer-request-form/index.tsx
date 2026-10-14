"use client"
import { createTransferRequest } from "@lib/data/orders"
import { CheckCircleMiniSolid, XCircleSolid } from "@medusajs/icons"
import { Heading, IconButton, Input, Text } from "@modules/common/components/ui"
import { useActionState } from "react"
// TODO: Re-add Toaster component when needed
import { SubmitButton } from "@modules/checkout/components/submit-button"
import { useEffect, useState } from "react"

export default function TransferRequestForm() {
  const [showSuccess, setShowSuccess] = useState(false)

  const [state, formAction] = useActionState(createTransferRequest, {
    success: false,
    error: null,
    order: null,
  })

  useEffect(() => {
    if (state.success && state.order) {
      setShowSuccess(true)
    }
  }, [state.success, state.order])

  return (
    <div className="flex flex-col gap-y-4 w-full">
      <div className="grid sm:grid-cols-2 items-center gap-x-8 gap-y-4 w-full">
        <div className="flex flex-col gap-y-1">
          <Heading level="h3" className="!text-sm font-semibold text-ui-fg-base">
            주문 이전
          </Heading>
          <p className="text-small-regular text-ui-fg-subtle">
            찾는 주문이 없으신가요?
            <br /> 주문을 내 계정에 연결하세요.
          </p>
        </div>
        <form
          action={formAction}
          className="flex flex-col gap-y-1 sm:items-end"
        >
          <div className="flex flex-col gap-y-2 w-full">
            <Input className="w-full" name="order_id" placeholder="주문 ID" />
            <SubmitButton
              variant="secondary"
              size="small"
              className="w-fit whitespace-nowrap self-end"
            >
              이전 요청
            </SubmitButton>
          </div>
        </form>
      </div>
      {!state.success && state.error && (
        <Text className="text-base-regular text-ui-fg-error text-right">
          {state.error}
        </Text>
      )}
      {showSuccess && (
        <div className="flex justify-between p-4 bg-ui-bg-subtle shadow-borders-base w-full self-stretch items-center">
          <div className="flex gap-x-2 items-center">
            <CheckCircleMiniSolid className="w-4 h-4 text-emerald-500" />
            <div className="flex flex-col gap-y-1">
              <Text className="text-medim-pl text-ui-fg-base">
                주문 {state.order?.id} 이전을 요청했어요
              </Text>
              <Text className="text-base-regular text-ui-fg-subtle">
                {state.order?.email}으로 이전 요청 이메일을 보냈어요
              </Text>
            </div>
          </div>
          <IconButton
            className="h-fit"
            onClick={() => setShowSuccess(false)}
          >
            <XCircleSolid className="w-4 h-4 text-ui-fg-muted" />
          </IconButton>
        </div>
      )}
    </div>
  )
}
