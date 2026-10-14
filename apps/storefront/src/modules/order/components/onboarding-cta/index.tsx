"use client"

import { resetOnboardingState } from "@lib/data/onboarding"
import { Button, Container, Text } from "@modules/common/components/ui"

const OnboardingCta = ({ orderId }: { orderId: string }) => {
  return (
    <Container className="max-w-4xl h-full bg-ui-bg-subtle w-full">
      <div className="flex flex-col gap-y-4 center p-4 md:items-center">
        <Text className="text-ui-fg-base text-xl">
          테스트 주문이 생성됐어요! 🎉
        </Text>
        <Text className="text-ui-fg-subtle text-small-regular">
          관리자 페이지에서 스토어 설정을 마칠 수 있어요.
        </Text>
        <Button
          className="w-fit"
          size="large"
          onClick={() => resetOnboardingState(orderId)}
        >
          관리자에서 설정 마치기
        </Button>
      </div>
    </Container>
  )
}

export default OnboardingCta
