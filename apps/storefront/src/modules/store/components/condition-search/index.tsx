"use client"

import { FormEvent, useRef, useState } from "react"

import {
  ConditionSearchRequest,
  ConditionSearchResponse,
  ConditionSearchResult,
  ProductCondition,
} from "@lib/commerce-contracts"
import {
  searchProductsByConditions,
  CONDITION_SEARCH_LIMIT,
} from "@lib/data/condition-search-client"
import {
  SPEC_CATEGORY_OPTIONS,
  specFieldRows,
  specValueName,
} from "@lib/catalog-specs"
import { convertToLocale } from "@lib/util/money"
import { Button, Checkbox, Input, Text } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Thumbnail from "@modules/products/components/thumbnail"

import { CompareToggle } from "../compare-selection"

type ConditionFieldDef = {
  key: string
  label: string
  operator: ProductCondition["operator"]
  input: "number" | "select" | "boolean"
  options?: string[]
  unit?: string
  placeholder?: string
}

const CONNECTION_OPTIONS = [
  "wired",
  "wireless",
  "bluetooth",
  "wireless_2_4ghz",
  "usb_c",
]

/** 카테고리별 대표 typed 조건 — catalog-specs definitions의 키만 사용한다 */
const CONDITION_FIELDS: Record<string, ConditionFieldDef[]> = {
  monitor: [
    { key: "panel", label: "패널", operator: "eq", input: "select", options: ["ips", "va", "tn", "oled"] },
    { key: "refresh_hz", label: "주사율", operator: "gte", input: "number", unit: "Hz 이상", placeholder: "144" },
    { key: "inch", label: "화면 크기", operator: "gte", input: "number", unit: "인치 이상", placeholder: "27" },
    { key: "usb_c", label: "USB-C 지원", operator: "eq", input: "boolean" },
  ],
  keyboard: [
    { key: "switch", label: "스위치", operator: "eq", input: "select", options: ["red", "brown", "blue", "red_quiet", "blue_clicky"] },
    { key: "connection", label: "연결 방식", operator: "eq", input: "select", options: CONNECTION_OPTIONS },
    { key: "noise", label: "소음", operator: "eq", input: "select", options: ["quiet", "clicky"] },
  ],
  mouse: [
    { key: "dpi", label: "최대 DPI", operator: "gte", input: "number", unit: "이상", placeholder: "16000" },
    { key: "product_weight_g", label: "무게", operator: "lte", input: "number", unit: "g 이하", placeholder: "80" },
    { key: "connection", label: "연결 방식", operator: "eq", input: "select", options: CONNECTION_OPTIONS },
    { key: "ergonomics", label: "형태", operator: "eq", input: "select", options: ["vertical", "standard"] },
  ],
  living: [
    { key: "capacity_ml", label: "용량", operator: "gte", input: "number", unit: "ml 이상", placeholder: "500" },
    { key: "material", label: "재질", operator: "eq", input: "select", options: ["pu_leather"] },
  ],
}

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: ConditionSearchResponse }
  | { status: "error"; message: string | null }

const resultHref = (result: ConditionSearchResult) =>
  "/products/" + result.handle + "?v_id=" + result.variant_id

const priceText = (result: ConditionSearchResult) => {
  const amount = result.price?.calculated_amount ?? null
  if (amount == null) {
    return "가격 미확인"
  }
  return convertToLocale({
    amount,
    currency_code: result.price?.currency_code ?? "krw",
  })
}

const stockText = (result: ConditionSearchResult) => {
  // 가격이 확인되지 않으면 구매 가능 여부도 주장하지 않는다 (05 finding)
  if (result.price?.calculated_amount == null) {
    return "구매 가능 여부 미확인"
  }
  if (!result.inventory) {
    return "재고 미확인"
  }
  if (result.inventory.purchasable) {
    return result.inventory.quantity == null
      ? "구매 가능(수량 미확인)"
      : "구매 가능"
  }
  return "구매 불가"
}

const specText = (result: ConditionSearchResult) => {
  const rows = specFieldRows(result.specs?.category, result.specs?.fields).filter(
    (row) => row.value !== "미확인"
  )
  if (!rows.length) {
    return "스펙 미확인"
  }
  return rows
    .slice(0, 3)
    .map((row) => row.label + " " + row.value)
    .join(" · ")
}

const ConditionSearch = ({
  regionId,
  currencyCode,
}: {
  regionId: string
  currencyCode: string
}) => {
  const [category, setCategory] = useState("")
  const [values, setValues] = useState<Record<string, string>>({})
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  const [query, setQuery] = useState("")
  const isKrw = currencyCode.toLowerCase() === "krw"
  const [maxPrice, setMaxPrice] = useState(isKrw ? "400000" : "")
  const [inStockOnly, setInStockOnly] = useState(false)
  const [state, setState] = useState<SearchState>({ status: "idle" })
  const lastRequest = useRef<ConditionSearchRequest | null>(null)

  const fields = CONDITION_FIELDS[category] ?? []

  const buildRequest = (): ConditionSearchRequest => {
    const conditions: ProductCondition[] = []
    for (const def of fields) {
      if (def.input === "boolean") {
        if (flags[def.key]) {
          conditions.push({ field: def.key, operator: def.operator, value: true })
        }
        continue
      }
      const raw = (values[def.key] ?? "").trim()
      if (!raw) {
        continue
      }
      if (def.input === "number") {
        const numeric = Number(raw)
        if (!Number.isFinite(numeric)) {
          continue
        }
        conditions.push({ field: def.key, operator: def.operator, value: numeric })
      } else {
        conditions.push({ field: def.key, operator: def.operator, value: raw })
      }
    }

    const parsedMaxPrice = Number(maxPrice)
    return {
      region_id: regionId,
      ...(query.trim() ? { query: query.trim() } : {}),
      ...(category ? { category } : {}),
      conditions,
      ...(maxPrice.trim() && Number.isFinite(parsedMaxPrice)
        ? { max_price: parsedMaxPrice }
        : {}),
      ...(inStockOnly ? { in_stock_only: true } : {}),
      limit: CONDITION_SEARCH_LIMIT,
    }
  }

  const run = (body: ConditionSearchRequest) => {
    lastRequest.current = body
    setState({ status: "loading" })
    searchProductsByConditions(body)
      .then((data) => setState({ status: "ready", data }))
      .catch((error) =>
        setState({
          status: "error",
          message:
            error instanceof Error && error.message ? error.message : null,
        })
      )
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    run(buildRequest())
  }

  const fieldInput = (def: ConditionFieldDef) => {
    if (def.input === "select") {
      return (
        <select
          value={values[def.key] ?? ""}
          onChange={(event) =>
            setValues((prev) => ({ ...prev, [def.key]: event.target.value }))
          }
          className="w-full rounded-lg border border-ui-border-base bg-ui-bg-field px-3 py-2 text-sm text-ui-fg-base"
          data-testid={"condition-field-" + def.key}
        >
          <option value="">전체</option>
          {(def.options ?? []).map((option) => (
            <option key={option} value={option}>
              {specValueName(option)}
            </option>
          ))}
        </select>
      )
    }
    if (def.input === "boolean") {
      return (
        <Checkbox
          label={def.label}
          checked={!!flags[def.key]}
          onChange={(event) =>
            setFlags((prev) => ({ ...prev, [def.key]: event.target.checked }))
          }
          data-testid={"condition-field-" + def.key}
        />
      )
    }
    return (
      <Input
        type="number"
        min={0}
        value={values[def.key] ?? ""}
        placeholder={def.placeholder}
        onChange={(event) =>
          setValues((prev) => ({ ...prev, [def.key]: event.target.value }))
        }
        data-testid={"condition-field-" + def.key}
      />
    )
  }

  return (
    <section className="mb-8 rounded-xl border border-ui-border-base p-4 small:p-5">
      <form data-testid="condition-search-form" onSubmit={onSubmit}>
        <div className="flex items-baseline justify-between gap-x-4 flex-wrap">
          <h2 className="text-base font-semibold text-ui-fg-base">
            조건으로 찾기
          </h2>
          <p className="text-xs text-ui-fg-muted">
            확인된 스펙만 조건에 사용해요.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 small:grid-cols-4 gap-x-3 gap-y-3">
          <label className="flex flex-col gap-y-1 text-xs text-ui-fg-muted">
            카테고리
            <select
              value={category}
              onChange={(event) => {
                setCategory(event.target.value)
                setValues({})
                setFlags({})
              }}
              className="w-full rounded-lg border border-ui-border-base bg-ui-bg-field px-3 py-2 text-sm text-ui-fg-base"
              data-testid="condition-category"
            >
              <option value="">카테고리 선택</option>
              {SPEC_CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {fields
            .filter((def) => def.input !== "boolean")
            .map((def) => (
              <label
                key={def.key}
                className="flex flex-col gap-y-1 text-xs text-ui-fg-muted"
              >
                {def.label}
                {def.unit ? " (" + def.unit + ")" : ""}
                {fieldInput(def)}
              </label>
            ))}
          {fields
            .filter((def) => def.input === "boolean")
            .map((def) => (
              <div key={def.key} className="flex items-end pb-1">
                {fieldInput(def)}
              </div>
            ))}

          <label className="flex flex-col gap-y-1 text-xs text-ui-fg-muted">
            {"예산 상한(" + currencyCode.toUpperCase() + ")"}
            <Input
              type="number"
              min={0}
              step={1000}
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
              data-testid="condition-max-price"
            />
          </label>

          <label className="flex flex-col gap-y-1 text-xs text-ui-fg-muted">
            상품명(선택)
            <Input
              type="text"
              value={query}
              placeholder="예: 무선"
              onChange={(event) => setQuery(event.target.value)}
              data-testid="condition-query"
            />
          </label>
        </div>

        <div className="mt-4 flex items-center gap-x-4 flex-wrap gap-y-2">
          <Checkbox
            label="재고 있는 상품만"
            checked={inStockOnly}
            onChange={(event) => setInStockOnly(event.target.checked)}
            data-testid="condition-in-stock-only"
          />
          <Button
            type="submit"
            variant="primary"
            isLoading={state.status === "loading"}
            data-testid="condition-search-submit"
          >
            조건으로 검색
          </Button>
        </div>
      </form>

      {state.status === "loading" && (
        <Text
          className="py-8 text-center text-ui-fg-muted"
          data-testid="condition-search-loading"
        >
          조건에 맞는 상품을 찾는 중이에요.
        </Text>
      )}

      {state.status === "error" && (
        <div
          className="py-8 text-center"
          data-testid="condition-search-error"
          role="alert"
        >
          <Text className="text-ui-fg-error">
            조건 검색에 실패했어요. 다시 시도해주세요
            {state.message ? ": " + state.message : "."}
          </Text>
          {lastRequest.current && (
            <Button
              type="button"
              variant="secondary"
              className="mt-3"
              onClick={() => {
                if (lastRequest.current) run(lastRequest.current)
              }}
              data-testid="condition-search-retry"
            >
              다시 시도
            </Button>
          )}
        </div>
      )}

      {state.status === "ready" && !state.data.results.length && (
        <Text
          className="py-8 text-center text-ui-fg-subtle"
          data-testid="condition-search-empty"
        >
          조건에 맞는 상품이 없어요. 조건을 조금만 완화해보세요.
        </Text>
      )}

      {state.status === "ready" && state.data.results.length > 0 && (
        <ul
          className="mt-6 grid grid-cols-2 w-full small:grid-cols-3 medium:grid-cols-4 gap-x-6 gap-y-8"
          data-testid="condition-search-results"
        >
          {state.data.results.map((result) => (
            <li
              key={result.product_id + ":" + result.variant_id}
              data-testid="condition-search-result"
            >
              <LocalizedClientLink
                href={resultHref(result)}
                className="group"
              >
                <div data-testid="product-wrapper">
                  <Thumbnail thumbnail={result.thumbnail} size="square" />
                  <div className="mt-3 flex flex-col gap-y-1">
                    <Text
                      className="text-ui-fg-base line-clamp-2 text-sm leading-5"
                      data-testid="condition-search-result-title"
                    >
                      {result.title}
                    </Text>
                    <p className="text-xs leading-5 text-ui-fg-muted">
                      옵션: {result.variant_title}
                    </p>
                    <p
                      className="text-xs leading-5 text-ui-fg-muted"
                      data-testid="condition-search-result-spec"
                    >
                      {specText(result)}
                    </p>
                    <p
                      className="text-sm text-ui-fg-base"
                      data-testid="condition-search-item-price"
                    >
                      {priceText(result)}
                    </p>
                    <p
                      className="text-xs text-ui-fg-muted"
                      data-testid="condition-search-result-stock"
                    >
                      {stockText(result)}
                    </p>
                  </div>
                </div>
              </LocalizedClientLink>
              <CompareToggle
                item={{
                  handle: result.handle,
                  variantId: result.variant_id,
                  title: result.title,
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default ConditionSearch
