import { PRODUCT_INDEX_NAME, priceAttribute } from "@lib/search-client"

export const OPTION_VALUES_ATTRIBUTE = "option_values"
export const CATEGORY_ATTRIBUTE = "category"
// The index calls the product's tags "labels".
export const LABELS_ATTRIBUTE = "labels"

export const getSortOptions = (currencyCode: string) => {
  const minPrice = priceAttribute("min_price", currencyCode)

  return [
    { value: PRODUCT_INDEX_NAME, label: "관련도순" },
    {
      value: `${PRODUCT_INDEX_NAME}/sort/created_at:desc`,
      label: "최신순",
    },
    {
      value: `${PRODUCT_INDEX_NAME}/sort/${minPrice}:asc`,
      label: "낮은 가격순",
    },
    {
      value: `${PRODUCT_INDEX_NAME}/sort/${minPrice}:desc`,
      label: "높은 가격순",
    },
    { value: `${PRODUCT_INDEX_NAME}/sort/title:asc`, label: "가나다순" },
    { value: `${PRODUCT_INDEX_NAME}/sort/title:desc`, label: "가나다 역순" },
  ]
}
