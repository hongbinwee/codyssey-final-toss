import { login } from "@lib/data/customer"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"
import { useActionState } from "react"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
  returnTo?: string
}

const Login = ({ setCurrentView, returnTo }: Props) => {
  const [message, formAction] = useActionState(login, null)

  return (
    <div
      className="max-w-sm w-full flex flex-col items-center"
      data-testid="login-page"
    >
      <h1 className="text-large-semi mb-6">다시 오셨군요</h1>
      <p className="text-center text-base-regular text-ui-fg-base mb-8">
        로그인하고 쇼핑을 이어가세요.
      </p>
      {message?.state === "verification_required" && (
        <div
          className="w-full mb-6 text-center text-base-regular text-ui-fg-base bg-ui-bg-subtle border border-ui-border-base rounded-rounded p-4"
          data-testid="login-verification-message"
        >
          <strong>{message.email}</strong>으로 인증 링크를 보냈어요. 이메일을
          확인한 뒤 로그인해주세요.
        </div>
      )}
      <form className="w-full" action={formAction}>
        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label="이메일"
            name="email"
            type="email"
            title="올바른 이메일 주소를 입력해주세요."
            autoComplete="email"
            required
            data-testid="email-input"
          />
          <Input
            label="비밀번호"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            data-testid="password-input"
          />
        </div>
        <ErrorMessage
          error={message?.state === "error" ? message.error : null}
          data-testid="login-error-message"
        />
        <SubmitButton data-testid="sign-in-button" className="w-full mt-6">
          로그인
        </SubmitButton>
      </form>
      <span className="text-center text-ui-fg-base text-small-regular mt-6">
        아직 회원이 아니신가요?{" "}
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.REGISTER)}
          className="underline"
          data-testid="register-button"
        >
          회원가입
        </button>
      </span>
    </div>
  )
}

export default Login
