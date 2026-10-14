import { Button, Container, Text } from "@modules/common/components/ui"
import { cookies as nextCookies } from "next/headers"

async function ProductOnboardingCta() {
  const cookies = await nextCookies()

  const isOnboarding = cookies.get("_medusa_onboarding")?.value === "true"

  if (!isOnboarding) {
    return null
  }

  return (
    <Container className="max-w-4xl h-full bg-ui-bg-subtle w-full p-8">
      <div className="flex flex-col gap-y-4 center">
        <Text className="text-ui-fg-base text-xl">
          데모 상품이 생성됐어요! 🎉
        </Text>
        <Text className="text-ui-fg-subtle text-small-regular">
          관리자 페이지에서 스토어 설정을 이어서 진행하세요.
        </Text>
        <a href="http://localhost:7001/a/orders?onboarding_step=create_order_nextjs">
          <Button className="w-full">관리자에서 계속 설정</Button>
        </a>
      </div>
    </Container>
  )
}

export default ProductOnboardingCta
