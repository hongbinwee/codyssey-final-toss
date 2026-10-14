/**
 * Canonical product spec contract — PROPOSED DRAFT (SOL 확정 전).
 *
 * 목적: description/subtitle 자유 텍스트에만 있는 스펙을 metadata의 작은
 * 정형 규격으로 옮겨 조건 비교(요청 B)·필터·비교표의 기계 판독 입력을 만든다.
 * 별도 Spec 테이블은 만들지 않는다 — 기존 product/variant metadata 재사용이
 * 실증된 경로다 (DATA_READINESS_ANALYSIS §4.2).
 *
 * 규칙:
 * - schema_version/category를 항상 포함한다.
 * - 수치는 필드명에 단위를 박은 typed number (inch, hz, dpi, ml, g, mm, px).
 * - enum·array는 아래 union을 쓴다. 확인 불가 값은 반드시 null (unknown).
 *   추정하거나 물류 weight를 스펙으로 복사하지 않는다.
 * - product.metadata.specs = 상품 기본값. variant.metadata.specs = 그 variant만
 *   다른 필드의 부분 override (예: 패널 IPS/VA). 머지 규칙은 mergeSpecs().
 * - 값의 출처는 spec_source로 표기한다 ("seed_demo_text" 등).
 * - 이 파일은 계약 + fixture + patch-input 빌더만 제공한다. 실제 쓰기
 *   명령(seed 수정/실행)은 SOL 계약 선택 이후에 한다.
 */

import { KOREAN_DEMO_PRODUCTS } from "./seed-korean-catalog-data"

export const SPEC_SCHEMA_VERSION = "catalog-spec-v1"

export type SpecCategory = "monitor" | "keyboard" | "mouse" | "living"

export type MonitorPanel = "ips" | "va" | "tn" | "oled"
export type ConnectionKind =
  | "bluetooth"
  | "wireless_2_4ghz"
  | "usb_c"
  | "wired"
  | "wireless" // 프로토콜 미명시 무선
export type NoiseLevel = "quiet" | "clicky" | "standard"
export type KeyboardSwitch =
  | "red" // 적축
  | "brown" // 갈축
  | "blue" // 청축
  | "red_quiet" // 저소음 적축
  | "blue_clicky" // 클릭 청축

export interface MonitorSpecFields {
  inch: number | null
  resolution: { width_px: number; height_px: number } | null
  refresh_hz: number | null
  panel: MonitorPanel | null
  ports: string[] | null
  usb_c: boolean | null
}

export interface KeyboardSpecFields {
  layout: string | null // "tenkeyless" | "low-profile" | ...
  switch: KeyboardSwitch | null
  connection: ConnectionKind[] | null
  noise: NoiseLevel | null
}

export interface MouseSpecFields {
  dpi: number | null // 최대 DPI
  product_weight_g: number | null // 제품 자체 무게 — 물류 weight 복사 금지
  connection: ConnectionKind[] | null
  ergonomics: string | null // "vertical" 등
}

export interface LivingSpecFields {
  capacity_ml: number | null
  material: string | null
  dimensions: {
    width_mm?: number
    depth_mm?: number
    height_mm?: number
  } | null
}

export type CategorySpecFields =
  | MonitorSpecFields
  | KeyboardSpecFields
  | MouseSpecFields
  | LivingSpecFields

/** 확인 가능하지만 정형 필드가 없는 부가 스펙 보관함 (예: hdr10, waterproof). */
export type SpecExtras = Record<string, number | string | boolean | null>

export interface ProductSpecMetadata {
  schema_version: typeof SPEC_SCHEMA_VERSION
  category: SpecCategory
  spec_source: string // "seed_demo_text" 등 — 값의 출처
  fields: CategorySpecFields
  extras?: SpecExtras
}

/** variant override는 상품 기본값과 다른 필드만 담는 부분 스펙이다. */
export interface VariantSpecMetadata {
  schema_version: typeof SPEC_SCHEMA_VERSION
  category: SpecCategory
  spec_source: string
  fields: Partial<CategorySpecFields>
}

/** 상품 기본값 + variant override 머지 — variant 값이 이긴다. */
export function mergeSpecs(
  product: ProductSpecMetadata | null | undefined,
  variant: VariantSpecMetadata | null | undefined
): CategorySpecFields | null {
  if (!product) return null
  if (!variant) return product.fields
  return { ...(product.fields as object), ...(variant.fields as object) } as CategorySpecFields
}

// ---------------------------------------------------------------------------
// Demo fixtures — seed 텍스트(title/subtitle/description/options)에서 확인
// 가능한 값만 채운다. 확인 불가 필드는 전부 null (unknown).
// ---------------------------------------------------------------------------

const S = (category: SpecCategory, fields: CategorySpecFields, extras?: SpecExtras): ProductSpecMetadata => ({
  schema_version: SPEC_SCHEMA_VERSION,
  category,
  spec_source: "seed_demo_text",
  fields,
  ...(extras ? { extras } : {}),
})

const V = (category: SpecCategory, fields: Partial<CategorySpecFields>): VariantSpecMetadata => ({
  schema_version: SPEC_SCHEMA_VERSION,
  category,
  spec_source: "seed_demo_text",
  fields,
})

/** 키보드 스위치 옵션값 → 정규 스위치+소음. */
const SWITCH_MAP: Record<string, { switch: KeyboardSwitch; noise: NoiseLevel | null }> = {
  "적축": { switch: "red", noise: null },
  "갈축": { switch: "brown", noise: null },
  "청축": { switch: "blue", noise: "clicky" },
  "저소음 적축": { switch: "red_quiet", noise: "quiet" },
  "클릭 청축": { switch: "blue_clicky", noise: "clicky" },
}

interface SpecFixture {
  product: ProductSpecMetadata
  variants: Record<string, VariantSpecMetadata> // sku -> override
}

export const DEMO_SPEC_FIXTURES: Record<string, SpecFixture> = {
  "toss3days-monitor-24-fhd": {
    product: S("monitor", {
      inch: 24,
      resolution: { width_px: 1920, height_px: 1080 },
      refresh_hz: 75,
      panel: "ips",
      ports: ["hdmi", "displayport"],
      usb_c: null,
    }, { color_gamut: "sRGB 99%" }),
    variants: {},
  },
  "toss3days-monitor-27-qhd": {
    // 패널은 옵션에 따라 달라지므로 상품 기본값은 null, variant에서 override.
    product: S("monitor", {
      inch: 27,
      resolution: { width_px: 2560, height_px: 1440 },
      refresh_hz: 144,
      panel: null,
      ports: null,
      usb_c: null,
    }),
    variants: {
      "T3D-MON27-IPS": V("monitor", { panel: "ips" }),
      "T3D-MON27-VA": V("monitor", { panel: "va" }),
    },
  },
  "toss3days-monitor-32-uhd": {
    product: S("monitor", {
      inch: 32,
      resolution: { width_px: 3840, height_px: 2160 },
      refresh_hz: null,
      panel: null,
      ports: null,
      usb_c: true,
    }, { hdr: "HDR10", usb_c_charging_w: 65 }),
    variants: {},
  },
  "toss3days-monitor-27-limited": {
    // "QHD" 표기는 2560×1440 표준 해상도로 해석.
    product: S("monitor", {
      inch: 27,
      resolution: { width_px: 2560, height_px: 1440 },
      refresh_hz: null,
      panel: null,
      ports: null,
      usb_c: null,
    }, { bundle: "모니터+스탠드" }),
    variants: {},
  },
  "toss3days-keyboard-87": {
    product: S("keyboard", {
      layout: "tenkeyless",
      switch: null,
      connection: null,
      noise: null,
    }),
    variants: Object.fromEntries(
      KOREAN_DEMO_PRODUCTS.find((p) => p.handle === "toss3days-keyboard-87")!
        .variants.map((v) => [
          v.sku,
          V("keyboard", {
            switch: SWITCH_MAP[v.options["스위치"]]?.switch ?? null,
            noise: SWITCH_MAP[v.options["스위치"]]?.noise ?? null,
          }),
        ])
    ),
  },
  "toss3days-keyboard-slim": {
    product: S("keyboard", {
      layout: null, // "슬림"은 배열이 아니라 형태 — layout은 unknown
      switch: null,
      connection: ["bluetooth"],
      noise: "quiet", // "얇고 조용한" (description)
    }, { multi_pairing_max: 3, charging: "usb-c", korean_legend: true }),
    variants: {},
  },
  "toss3days-keyboard-lowprofile": {
    product: S("keyboard", {
      layout: "low-profile",
      switch: null,
      connection: null,
      noise: null,
    }),
    variants: {
      "T3D-KBLP-RED": V("keyboard", { switch: "red_quiet", noise: "quiet" }),
      "T3D-KBLP-BLU": V("keyboard", { switch: "blue_clicky", noise: "clicky" }),
    },
  },
  "toss3days-keyboard-retro": {
    product: S("keyboard", {
      layout: null,
      switch: null,
      connection: ["wireless"], // "무선" — 프로토콜 미명시
      noise: null,
    }),
    variants: {},
  },
  "toss3days-mouse-wireless": {
    product: S("mouse", {
      dpi: null,
      product_weight_g: null, // 물류 weight 90은 제품 무게가 아니므로 복사 금지
      connection: ["bluetooth", "wireless_2_4ghz"],
      ergonomics: null,
    }, { battery_months: 12, silent_click: true }),
    variants: {},
  },
  "toss3days-mouse-gaming": {
    product: S("mouse", {
      dpi: 26000,
      product_weight_g: 63, // subtitle "초경량 63g" — 제품 무게 확인 가능
      connection: null,
      ergonomics: null,
    }, { polling_hz: 8000, feet: "PTFE" }),
    variants: {},
  },
  "toss3days-mouse-vertical": {
    product: S("mouse", {
      dpi: null,
      product_weight_g: null,
      connection: ["wireless_2_4ghz", "bluetooth"],
      ergonomics: "vertical",
    }, { vertical_angle_deg: 57, buttons: 6, handedness: "right" }),
    variants: {},
  },
  "toss3days-mug-thermal": {
    product: S("living", {
      capacity_ml: 500,
      material: null, // "이중 진공"은 구조이지 재질 미명시
      dimensions: null,
    }, { keep_warm_hours: 12, keep_cold_hours: 24, dishwasher_safe: true }),
    variants: {},
  },
  "toss3days-desk-mat": {
    product: S("living", {
      capacity_ml: null,
      material: "pu_leather", // "PU 가죽"
      dimensions: { width_mm: 900, depth_mm: 400 }, // 90×40cm
    }, { waterproof: true }),
    variants: {},
  },
  "toss3days-cable-set": {
    product: S("living", {
      capacity_ml: null,
      material: null,
      dimensions: null,
    }, { pack_count: 10 }),
    variants: {},
  },
}

// ---------------------------------------------------------------------------
// Patch-input builder — 메모리상 patch 입력만 만든다. 쓰기 명령은 없다.
// SOL이 계약을 확정하면 시드가 이 출력을 metadata로 merge한다.
// ---------------------------------------------------------------------------

export interface SpecPatchInput {
  handle: string
  /** product.metadata에 merge할 부분 — 기존 demo/seed/scenario 키는 유지해야 한다. */
  product_metadata_patch: { specs: ProductSpecMetadata }
  /** sku -> variant.metadata에 merge할 부분. override 없는 variant는 제외. */
  variant_metadata_patches: { sku: string; metadata_patch: { specs: VariantSpecMetadata } }[]
}

export function buildSpecPatchInputs(
  handles?: string[]
): SpecPatchInput[] {
  const wanted = handles ?? Object.keys(DEMO_SPEC_FIXTURES)
  return wanted.map((handle) => {
    const fixture = DEMO_SPEC_FIXTURES[handle]
    if (!fixture) {
      throw new Error("no spec fixture for handle: " + handle)
    }
    return {
      handle,
      product_metadata_patch: { specs: fixture.product },
      variant_metadata_patches: Object.entries(fixture.variants).map(
        ([sku, specs]) => ({ sku, metadata_patch: { specs } })
      ),
    }
  })
}
