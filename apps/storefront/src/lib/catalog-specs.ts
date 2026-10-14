export type SpecRow = { key: string; label: string; value: string }
type Specs = { schema_version: string; category: string; spec_source: string; fields: Record<string, unknown> }
const definitions: Record<string, [string, string, string?][]> = {
  monitor: [["inch", "화면 크기", "인치"], ["resolution", "해상도"], ["refresh_hz", "주사율", "Hz"], ["panel", "패널"], ["ports", "연결 포트"], ["usb_c", "USB-C 지원"]],
  keyboard: [["layout", "배열"], ["switch", "스위치"], ["connection", "연결 방식"], ["noise", "소음 특성"]],
  mouse: [["dpi", "최대 DPI", "DPI"], ["product_weight_g", "제품 무게", "g"], ["connection", "연결 방식"], ["ergonomics", "형태"]],
  living: [["capacity_ml", "용량", "ml"], ["material", "재질"], ["dimensions", "규격"]],
}
const names: Record<string, string> = { ips: "IPS", va: "VA", tn: "TN", oled: "OLED", bluetooth: "블루투스", wireless_2_4ghz: "2.4GHz 무선", usb_c: "USB-C", wired: "유선", wireless: "무선", red: "적축", brown: "갈축", blue: "청축", red_quiet: "저소음 적축", blue_clicky: "클릭 청축", quiet: "저소음", clicky: "클릭음", standard: "일반", tenkeyless: "텐키리스", "low-profile": "로우프로파일", vertical: "수직형", pu_leather: "PU 가죽" }
function parse(metadata: unknown): Specs | null {
  if (!metadata || typeof metadata !== "object") return null
  const specs = (metadata as Record<string, unknown>).specs
  if (!specs || typeof specs !== "object") return null
  const value = specs as Specs
  return value.schema_version === "catalog-spec-v1" && typeof value.category === "string" && Object.prototype.hasOwnProperty.call(definitions, value.category) && typeof value.spec_source === "string" && value.fields && typeof value.fields === "object" && !Array.isArray(value.fields) ? value : null
}
function format(key: string, value: unknown, unit?: string): string {
  if (value == null) return "미확인"
  if (key === "usb_c") return typeof value === "boolean" ? (value ? "지원" : "미지원") : "미확인"
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? `${value.toLocaleString("ko-KR")}${unit ? " " + unit : ""}` : "미확인"
  if (Array.isArray(value)) return value.length && value.every(v => typeof v === "string") ? value.map(v => names[v] ?? v).join(" · ") : "미확인"
  if (typeof value === "string") return value ? names[value] ?? value : "미확인"
  if (typeof value === "object" && key === "resolution") {
    const v = value as { width_px?: number; height_px?: number }
    return typeof v.width_px === "number" && v.width_px > 0 && typeof v.height_px === "number" && v.height_px > 0 ? `${v.width_px} × ${v.height_px} px` : "미확인"
  }
  if (typeof value === "object" && key === "dimensions") {
    const v = value as Record<string, unknown>
    const parts = ["width_mm", "depth_mm", "height_mm"].map(k => v[k]).filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0)
    return parts.length ? parts.join(" × ") + " mm" : "미확인"
  }
  return "미확인"
}
export function specRows(productMetadata: unknown, variantMetadata?: unknown): SpecRow[] {
  const product = parse(productMetadata)
  if (!product) return []
  const variant = parse(variantMetadata)
  const fields = variant && variant.category === product.category ? { ...product.fields, ...variant.fields } : product.fields
  return definitions[product.category].map(([key, label, unit]) => ({ key, label, value: format(key, fields[key], unit) }))
}

/** 조건 검색 UI의 카테고리 선택 옵션 — definitions 키와 1:1 대응한다 */
export const SPEC_CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "monitor", label: "모니터" },
  { value: "keyboard", label: "키보드" },
  { value: "mouse", label: "마우스" },
  { value: "living", label: "리빙" },
]

/**
 * 이미 병합된 스펙 필드 레코드(condition-search 응답의 specs)를 행으로 변환.
 * 카테고리를 알 수 없거나 정의에 없으면 빈 배열 — 표시할 수 없는 값을 지어내지 않는다.
 */
export function specFieldRows(
  category: string | null | undefined,
  fields: Record<string, unknown> | null | undefined
): SpecRow[] {
  if (!category || !fields) return []
  const defs = definitions[category]
  if (!defs) return []
  return defs.map(([key, label, unit]) => ({
    key,
    label,
    value: format(key, fields[key], unit),
  }))
}

/** 필드 값의 표시용 이름 — select 옵션 라벨 등에서 재사용 */
export function specValueName(value: string): string {
  return names[value] ?? value
}
