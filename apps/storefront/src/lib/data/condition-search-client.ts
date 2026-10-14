import { sdk } from "@lib/config"
import {
  ConditionSearchRequest,
  ConditionSearchResponse,
} from "@lib/commerce-contracts"

// 클라이언트 컴포넌트에서 호출하는 구조 조건 검색 fetcher.
// cookies.ts 같은 server-only 모듈을 가져오지 않는다.

export const CONDITION_SEARCH_LIMIT = 20

export const searchProductsByConditions = async (
  body: ConditionSearchRequest
): Promise<ConditionSearchResponse> => {
  return sdk.client.fetch<ConditionSearchResponse>(
    "/store/product-condition-search",
    {
      method: "POST",
      body,
      cache: "no-store",
    }
  )
}
