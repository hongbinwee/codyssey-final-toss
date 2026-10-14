"use client"

import type { Hit } from "instantsearch.js"
import { useEffect, useRef } from "react"
import { useHits, useInstantSearch } from "react-instantsearch"

import { priceAttribute } from "@lib/search-client"
import { EMPTY_REVIEW_SUMMARY } from "@lib/commerce-contracts"
import useProductReviewStats from "@lib/hooks/use-product-review-stats"
import useSearchSettled from "@lib/hooks/use-search-settled"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Text } from "@modules/common/components/ui"
import RatingSummary from "@modules/products/components/reviews/rating-summary"
import Thumbnail from "@modules/products/components/thumbnail"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import SearchPagination from "./pagination"
import HitPrice, { HitPricing } from "./price"

type ProductHit = Hit<
  {
    title: string | null
    handle: string | null
    thumbnail: string | null
  } & HitPricing
>

type StoreHitsProps = {
  hitsPerPage: number
  currencyCode: string
}

const StoreHits = ({ hitsPerPage, currencyCode }: StoreHitsProps) => {
  const { items } = useHits<ProductHit>()
  const { status, error, indexUiState } = useInstantSearch()
  const { isSearching, hasNoResultsYet } = useSearchSettled()

  // 검색 인덱스에 후기 필드가 없으므로 상품 ID 기준으로 한 번만 배치 조회한다
  const reviewStats = useProductReviewStats(
    items.map((hit: ProductHit) => hit.objectID).filter(Boolean)
  )

  const { page, ...refinements } = indexUiState
  const currentPage = page ?? 1
  const refinementKey = JSON.stringify(refinements)

  const settled = useRef({ page: currentPage, refinementKey })

  useEffect(() => {
    if (!isSearching) {
      settled.current = { page: currentPage, refinementKey }
    }
  }, [isSearching, currentPage, refinementKey])

  const isPagingOnly =
    refinementKey === settled.current.refinementKey &&
    currentPage !== settled.current.page

  const showSkeleton = hasNoResultsYet || (isSearching && isPagingOnly)

  if (status === "error") {
    return (
      <Text
        className="py-16 text-center text-ui-fg-error"
        data-testid="products-error"
      >
        상품을 불러오지 못했어요. 다시 시도해주세요
        {error?.message ? `: ${error.message}` : "."}
      </Text>
    )
  }

  return (
    <>
      {showSkeleton ? (
        <SkeletonProductGrid numberOfProducts={hitsPerPage} />
      ) : !items.length ? (
        <Text
          className="py-16 text-center text-ui-fg-subtle"
          data-testid="no-products"
        >
          조건에 맞는 상품이 없어요
        </Text>
      ) : (
        <ul
          className="grid grid-cols-2 w-full small:grid-cols-3 medium:grid-cols-4 gap-x-6 gap-y-8"
          data-testid="products-list"
        >
          {items.map((hit) =>
            hit.handle &&
            typeof hit[priceAttribute("min_price", currencyCode)] ===
              "number" ? (
              <li key={hit.objectID}>
                <LocalizedClientLink
                  href={`/products/${hit.handle}`}
                  className="group"
                >
                  <div data-testid="product-wrapper">
                  <Thumbnail thumbnail={hit.thumbnail} size="square" />
                  <div className="mt-3 flex flex-col gap-y-1">
                      <Text
                      className="text-ui-fg-base line-clamp-2 text-sm leading-5"
                        data-testid="product-title"
                      >
                        {hit.title}
                      </Text>
                      {reviewStats.status === "error" ? (
                        <RatingSummary status="error" size="small" />
                      ) : reviewStats.status === "ready" ? (
                        <RatingSummary
                          summary={
                            reviewStats.map[hit.objectID] ??
                            EMPTY_REVIEW_SUMMARY
                          }
                          size="small"
                        />
                      ) : null}
                      <HitPrice hit={hit} currencyCode={currencyCode} />
                    </div>
                  </div>
                </LocalizedClientLink>
              </li>
            ) : null
          )}
        </ul>
      )}
      <SearchPagination />
    </>
  )
}

export default StoreHits
