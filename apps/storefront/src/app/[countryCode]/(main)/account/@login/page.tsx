import { Metadata } from "next"

import LoginTemplate from "@modules/account/templates/login-template"

export const metadata: Metadata = {
  title: "로그인",
  description: "3days 쇼핑 계정으로 로그인하세요.",
}

export default async function Login(props: {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const [{ countryCode }, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ])
  const checkoutPath = `/${countryCode}/checkout`
  const returnTo = searchParams.next === checkoutPath ? checkoutPath : undefined

  return <LoginTemplate returnTo={returnTo} />
}
