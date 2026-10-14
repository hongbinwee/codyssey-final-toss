"use client"

import { useActionState } from "react"
import Input from "@modules/common/components/input"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import { signup } from "@lib/data/customer"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
  returnTo?: string
}

const Register = ({ setCurrentView, returnTo }: Props) => {
  const [message, formAction] = useActionState(signup, null)

  return (
    <div
      className="max-w-sm flex flex-col items-center"
      data-testid="register-page"
    >
      <h1 className="text-large-semi mb-6">3days 쇼핑 회원가입</h1>
      <p className="text-center text-base-regular text-ui-fg-base mb-4">
        계정을 만들고 더 편한 쇼핑을 시작하세요.
      </p>
      {message?.state === "verification_required" && (
        <div
          className="w-full mb-4 text-center text-base-regular text-ui-fg-base bg-ui-bg-subtle border border-ui-border-base rounded-rounded p-4"
          data-testid="register-verification-message"
        >
          <strong>{message.email}</strong>으로 인증 링크를 보냈어요. 받은
          편지함에서 이메일을 인증한 뒤 로그인해주세요.
        </div>
      )}
      <form className="w-full flex flex-col" action={formAction}>
        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label="이름"
            name="first_name"
            required
            autoComplete="given-name"
            data-testid="first-name-input"
          />
          <Input
            label="성"
            name="last_name"
            required
            autoComplete="family-name"
            data-testid="last-name-input"
          />
          <Input
            label="이메일"
            name="email"
            required
            type="email"
            autoComplete="email"
            data-testid="email-input"
          />
          <Input
            label="휴대폰 번호"
            name="phone"
            type="tel"
            autoComplete="tel"
            data-testid="phone-input"
          />
          <Input
            label="비밀번호"
            name="password"
            required
            type="password"
            autoComplete="new-password"
            data-testid="password-input"
          />
        </div>
        <ErrorMessage
          error={message?.state === "error" ? message.error : null}
          data-testid="register-error"
        />
        <span className="text-center text-ui-fg-base text-small-regular mt-6">
          한국어 로컬 데모용 회원가입입니다.{" "}
          개인정보처리방침과 이용약관 안내는 제공하지 않습니다.
        </span>
        <SubmitButton className="w-full mt-6" data-testid="register-button">
          가입하기
        </SubmitButton>
      </form>
      <span className="text-center text-ui-fg-base text-small-regular mt-6">
        이미 계정이 있으신가요?{" "}
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.SIGN_IN)}
          className="underline"
        >
          로그인
        </button>
      </span>
    </div>
  )
}

export default Register
