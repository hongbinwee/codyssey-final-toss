"use client"

import type { SearchClient } from "instantsearch.js"
import { Configure, InstantSearch } from "react-instantsearch"
import { useMemo } from "react"

import {
  parseSearchParams,
  type InstantSearchRequest,
  type SearchClient as AdapterSearchClient,
} from "@medusajs/instantsearch-adapter"

import {
  priceAttribute,
  PRODUCT_INDEX_NAME,
  searchClient,
} from "@lib/search-client"
import StoreHits from "@modules/store/components/store-hits"
import StoreRefinements from "@modules/store/components/store-refinements"
import StoreSearchBox from "@modules/store/components/store-search-box"
import ConditionSearch from "@modules/store/components/condition-search"
import {
  CompareSelectionProvider,
  CompareTray,
} from "@modules/store/components/compare-selection"

const PRODUCT_LIMIT = 12

// Keep this bound out of Configure.numericFilters: PriceRange manages the same
// attribute through useRange.
const addPriceAvailabilityFilter = (
  request: InstantSearchRequest,
  currencyCode: string
): InstantSearchRequest => {
  const params = parseSearchParams(request.params)
  const numericFilters = params.numericFilters

  return {
    ...request,
    params: {
      ...params,
      numericFilters: [
        `${priceAttribute("min_price", currencyCode)}>=0`,
        ...(Array.isArray(numericFilters)
          ? numericFilters
          : numericFilters
            ? [numericFilters]
            : []),
      ],
    },
  }
}

const StoreTemplate = ({
  currencyCode,
  regionId,
}: {
  currencyCode: string
  regionId: string
}) => {
  const filteredSearchClient = useMemo<AdapterSearchClient>(
    () => ({
      ...searchClient,
      search: (requests) =>
        searchClient.search(
          requests.map((request) =>
            addPriceAvailabilityFilter(request, currencyCode)
          )
        ),
      searchForFacetValues: (requests) =>
        searchClient.searchForFacetValues(
          requests.map((request) =>
            addPriceAvailabilityFilter(request, currencyCode)
          )
        ),
    }),
    [currencyCode]
  )

  return (
    <div className="py-6 content-container" data-testid="category-container">
      <div className="mb-8 text-2xl-semi">
        <h1 data-testid="store-page-title">전체 상품</h1>
      </div>

      <div className="flex flex-col small:flex-row small:items-start">
        <CompareSelectionProvider>
          <InstantSearch
            indexName={PRODUCT_INDEX_NAME}
            searchClient={filteredSearchClient as unknown as SearchClient}
            routing
            future={{ preserveSharedStateOnUnmount: true }}
          >
            <Configure hitsPerPage={PRODUCT_LIMIT} />
            <StoreRefinements currencyCode={currencyCode} />
            <div className="w-full min-w-0">
              <ConditionSearch regionId={regionId} currencyCode={currencyCode} />
              <StoreSearchBox />
              <StoreHits
                hitsPerPage={PRODUCT_LIMIT}
                currencyCode={currencyCode}
              />
            </div>
          </InstantSearch>
          <CompareTray />
        </CompareSelectionProvider>
      </div>
    </div>
  )
}

export default StoreTemplate
