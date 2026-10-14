import { Button, Heading, Text } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const SignInPrompt = () => {
  return (
    <div className="bg-ui-bg-base flex items-center justify-between">
      <div>
        <Heading level="h2" className="txt-xlarge">
          이미 계정이 있으신가요?
        </Heading>
        <Text className="txt-medium text-ui-fg-subtle mt-2">
          로그인하면 주문 내역을 다시 확인할 수 있어요.
        </Text>
      </div>
      <div>
        <LocalizedClientLink href="/account">
          <Button variant="secondary" className="h-10" data-testid="sign-in-button">
            로그인
          </Button>
        </LocalizedClientLink>
      </div>
    </div>
  )
}

export default SignInPrompt
