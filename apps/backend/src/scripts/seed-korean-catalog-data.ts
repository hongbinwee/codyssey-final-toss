/**
 * Korean demo catalog data for 토스 3days (used by seed-korean-catalog.ts).
 *
 * Pure data + builders only — no Medusa imports — so the unit spec can verify
 * the catalog without a database.
 *
 * Deterministic by contract: every product has a `toss3days-*` handle and
 * every variant a stable `T3D-*` SKU, so re-seeding is a no-op for anything
 * already created.
 *
 * Artwork is self-made SVG in apps/storefront/public/demo-products/<handle>.svg,
 * served by the storefront. Image URLs are
 * `${STOREFRONT_URL ?? "http://localhost:8000"}/demo-products/<handle>.svg`.
 */

export const KOREAN_CATEGORIES = [
  { key: "monitor", name: "모니터", handle: "monitor" },
  { key: "keyboard", name: "키보드", handle: "keyboard" },
  { key: "mouse", name: "마우스", handle: "mouse" },
  { key: "living", name: "생활용품", handle: "living-goods" },
] as const

export type CategoryKey = (typeof KOREAN_CATEGORIES)[number]["key"]

/**
 * Test scenarios the catalog must cover (see EXECUTION_STATUS / master plan
 * §14.3): normal purchase, multi-option selection, limited stock for
 * over-quantity cart rejection, sold-out, real sale pricing via price list,
 * and a cheap item where the shipping option cost is visible.
 */
export type DemoScenario =
  | "normal"
  | "multi-option"
  | "limited"
  | "soldout"
  | "sale"
  | "shipping-test"

export interface DemoVariantSpec {
  title: string
  /** Stable SKU (T3D-*); also copied to the inventory item. */
  sku: string
  /** option title -> value, keys must match the product's option titles. */
  options: Record<string, string>
  /** KRW amount (major unit, 0-decimal currency). */
  price: number
  /** stocked_quantity to set at the seeded stock location. */
  stock: number
}

export interface DemoProductSpec {
  title: string
  subtitle: string
  handle: string
  description: string
  category: CategoryKey
  options: { title: string; values: string[] }[]
  variants: DemoVariantSpec[]
  /** grams, optional */
  weight?: number
  scenario: DemoScenario
  /** When set, every variant gets a real sale price via a sale price list. */
  salePrice?: number
}

export const KOREAN_DEMO_PRODUCTS: DemoProductSpec[] = [
  // ---- 모니터 -------------------------------------------------------------
  {
    title: "데일리 24인치 FHD 모니터",
    subtitle: "FHD · IPS · 75Hz",
    handle: "toss3days-monitor-24-fhd",
    description:
      "문서 작업과 영상 시청에 무난한 24인치 FHD 모니터입니다. IPS 패널, 1920×1080, 75Hz, sRGB 99%, HDMI·DP 입력.",
    category: "monitor",
    options: [{ title: "크기", values: ["24인치"] }],
    variants: [
      {
        title: "24인치",
        sku: "T3D-MON24-FHD",
        options: { 크기: "24인치" },
        price: 139000,
        stock: 100,
      },
    ],
    weight: 3200,
    scenario: "normal",
  },
  {
    title: "프로 27인치 QHD 모니터",
    subtitle: "QHD · 144Hz · 패널 선택",
    handle: "toss3days-monitor-27-qhd",
    description:
      "개발·디자인 작업용 27인치 QHD 모니터입니다. 2560×1440, 144Hz, 높이조절 스탠드. 패널 옵션에 따라 가격이 달라집니다.",
    category: "monitor",
    options: [{ title: "패널", values: ["IPS", "VA"] }],
    variants: [
      {
        title: "IPS",
        sku: "T3D-MON27-IPS",
        options: { 패널: "IPS" },
        price: 319000,
        stock: 60,
      },
      {
        title: "VA",
        sku: "T3D-MON27-VA",
        options: { 패널: "VA" },
        price: 289000,
        stock: 60,
      },
    ],
    weight: 5400,
    scenario: "normal",
  },
  {
    title: "시그니처 32인치 4K UHD 모니터",
    subtitle: "4K UHD · HDR10 · 세일 상품",
    handle: "toss3days-monitor-32-uhd",
    description:
      "세부 표현이 중요한 작업용 32인치 4K 모니터입니다. 3840×2160, HDR10, USB-C 65W 충전. 세일 가격이 적용되는 데모 상품입니다.",
    category: "monitor",
    options: [{ title: "크기", values: ["32인치"] }],
    variants: [
      {
        title: "32인치",
        sku: "T3D-MON32-UHD",
        options: { 크기: "32인치" },
        price: 549000,
        stock: 25,
      },
    ],
    weight: 7300,
    scenario: "sale",
    salePrice: 479000,
  },
  {
    title: "27인치 QHD 모니터 한정 패키지",
    subtitle: "모니터 + 스탠드 · 재고 2개",
    handle: "toss3days-monitor-27-limited",
    description:
      "27인치 QHD 모니터와 모니터 암 스탠드 구성의 한정 패키지입니다. 재고가 2개뿐이라 수량 제한 테스트에 사용합니다.",
    category: "monitor",
    options: [{ title: "구성", values: ["모니터+스탠드"] }],
    variants: [
      {
        title: "모니터+스탠드",
        sku: "T3D-MON27-LTD",
        options: { 구성: "모니터+스탠드" },
        price: 359000,
        stock: 2,
      },
    ],
    weight: 6800,
    scenario: "limited",
  },
  // ---- 키보드 -------------------------------------------------------------
  {
    title: "기계식 키보드 87키",
    subtitle: "색상 × 스위치 조합",
    handle: "toss3days-keyboard-87",
    description:
      "텐키리스 배열의 기계식 키보드입니다. 색상과 스위치를 고르는 다중 옵션 상품으로, 스위치 종류에 따라 가격이 달라집니다.",
    category: "keyboard",
    options: [
      { title: "색상", values: ["블랙", "화이트"] },
      { title: "스위치", values: ["적축", "갈축", "청축"] },
    ],
    variants: [
      {
        title: "블랙 / 적축",
        sku: "T3D-KB87-BLK-RED",
        options: { 색상: "블랙", 스위치: "적축" },
        price: 89000,
        stock: 40,
      },
      {
        title: "블랙 / 갈축",
        sku: "T3D-KB87-BLK-BRN",
        options: { 색상: "블랙", 스위치: "갈축" },
        price: 89000,
        stock: 40,
      },
      {
        title: "블랙 / 청축",
        sku: "T3D-KB87-BLK-BLU",
        options: { 색상: "블랙", 스위치: "청축" },
        price: 94000,
        stock: 40,
      },
      {
        title: "화이트 / 적축",
        sku: "T3D-KB87-WHT-RED",
        options: { 색상: "화이트", 스위치: "적축" },
        price: 89000,
        stock: 40,
      },
      {
        title: "화이트 / 갈축",
        sku: "T3D-KB87-WHT-BRN",
        options: { 색상: "화이트", 스위치: "갈축" },
        price: 89000,
        stock: 40,
      },
      {
        title: "화이트 / 청축",
        sku: "T3D-KB87-WHT-BLU",
        options: { 색상: "화이트", 스위치: "청축" },
        price: 94000,
        stock: 40,
      },
    ],
    weight: 950,
    scenario: "multi-option",
  },
  {
    title: "슬림 블루투스 키보드",
    subtitle: "무선 · 멀티페어링",
    handle: "toss3days-keyboard-slim",
    description:
      "얇고 조용한 블루투스 키보드입니다. 최대 3대 멀티페어링, USB-C 충전, 한국어 각인.",
    category: "keyboard",
    options: [{ title: "색상", values: ["화이트", "블랙"] }],
    variants: [
      {
        title: "화이트",
        sku: "T3D-KBSLIM-WHT",
        options: { 색상: "화이트" },
        price: 49000,
        stock: 80,
      },
      {
        title: "블랙",
        sku: "T3D-KBSLIM-BLK",
        options: { 색상: "블랙" },
        price: 49000,
        stock: 80,
      },
    ],
    weight: 480,
    scenario: "normal",
  },
  {
    title: "로우프로파일 기계식 키보드",
    subtitle: "휴대용 · 재고 3개",
    handle: "toss3days-keyboard-lowprofile",
    description:
      "얇은 하우징의 로우프로파일 기계식 키보드입니다. 재고가 3개뿐이라 장바구니 수량 초과 차단 테스트에 사용합니다.",
    category: "keyboard",
    options: [{ title: "스위치", values: ["저소음 적축", "클릭 청축"] }],
    variants: [
      {
        title: "저소음 적축",
        sku: "T3D-KBLP-RED",
        options: { 스위치: "저소음 적축" },
        price: 129000,
        stock: 3,
      },
      {
        title: "클릭 청축",
        sku: "T3D-KBLP-BLU",
        options: { 스위치: "클릭 청축" },
        price: 135000,
        stock: 3,
      },
    ],
    weight: 620,
    scenario: "limited",
  },
  {
    title: "레트로 무선 키보드",
    subtitle: "아이보리 · 품절 데모",
    handle: "toss3days-keyboard-retro",
    description:
      "타자기 감성의 레트로 무선 키보드입니다. 재고 0, 백오더 불가로 설정된 품절 데모 상품입니다.",
    category: "keyboard",
    options: [{ title: "색상", values: ["아이보리"] }],
    variants: [
      {
        title: "아이보리",
        sku: "T3D-KBRT-IVR",
        options: { 색상: "아이보리" },
        price: 79000,
        stock: 0,
      },
    ],
    weight: 700,
    scenario: "soldout",
  },
  // ---- 마우스 -------------------------------------------------------------
  {
    title: "무선 저소음 마우스",
    subtitle: "블루투스 · 3색",
    handle: "toss3days-mouse-wireless",
    description:
      "조용한 클릭의 무선 마우스입니다. 블루투스·2.4GHz 듀얼 연결, 최대 12개월 배터리, 3가지 색상.",
    category: "mouse",
    options: [{ title: "색상", values: ["블랙", "화이트", "핑크"] }],
    variants: [
      {
        title: "블랙",
        sku: "T3D-MSW-BLK",
        options: { 색상: "블랙" },
        price: 39000,
        stock: 120,
      },
      {
        title: "화이트",
        sku: "T3D-MSW-WHT",
        options: { 색상: "화이트" },
        price: 39000,
        stock: 120,
      },
      {
        title: "핑크",
        sku: "T3D-MSW-PNK",
        options: { 색상: "핑크" },
        price: 39000,
        stock: 120,
      },
    ],
    weight: 90,
    scenario: "normal",
  },
  {
    title: "게이밍 마우스 26000DPI",
    subtitle: "초경량 63g",
    handle: "toss3days-mouse-gaming",
    description:
      "63g 초경량 게이밍 마우스입니다. 최대 26000DPI, 8000Hz 폴링레이트, PTFE 피트.",
    category: "mouse",
    options: [{ title: "색상", values: ["블랙"] }],
    variants: [
      {
        title: "블랙",
        sku: "T3D-MSG-BLK",
        options: { 색상: "블랙" },
        price: 69000,
        stock: 45,
      },
    ],
    weight: 63,
    scenario: "normal",
  },
  {
    title: "버티컬 인체공학 마우스",
    subtitle: "오른손 · 저소음",
    handle: "toss3days-mouse-vertical",
    description:
      "손목 부담을 줄이는 57도 버티컬 마우스입니다. 무선 2.4GHz·블루투스, 6버튼.",
    category: "mouse",
    options: [{ title: "손 방향", values: ["오른손"] }],
    variants: [
      {
        title: "오른손",
        sku: "T3D-MSV-R",
        options: { "손 방향": "오른손" },
        price: 45000,
        stock: 35,
      },
    ],
    weight: 120,
    scenario: "normal",
  },
  // ---- 생활용품 -----------------------------------------------------------
  {
    title: "보온 텀블러 500ml",
    subtitle: "12시간 보온 · 3색",
    handle: "toss3days-mug-thermal",
    description:
      "이중 진공 구조의 보온 텀블러입니다. 500ml, 12시간 보온·24시간 보냉, 식기세척기 사용 가능.",
    category: "living",
    options: [{ title: "색상", values: ["크림", "그레이", "네이비"] }],
    variants: [
      {
        title: "크림",
        sku: "T3D-MUG-CRM",
        options: { 색상: "크림" },
        price: 24000,
        stock: 150,
      },
      {
        title: "그레이",
        sku: "T3D-MUG-GRY",
        options: { 색상: "그레이" },
        price: 24000,
        stock: 150,
      },
      {
        title: "네이비",
        sku: "T3D-MUG-NVY",
        options: { 색상: "네이비" },
        price: 24000,
        stock: 150,
      },
    ],
    weight: 300,
    scenario: "normal",
  },
  {
    title: "와이드 데스크 매트 90×40",
    subtitle: "PU 가죽 · 방수",
    handle: "toss3days-desk-mat",
    description:
      "키보드와 마우스를 함께 올리는 와이드 데스크 매트입니다. 90×40cm, PU 가죽, 방수 표면.",
    category: "living",
    options: [{ title: "색상", values: ["차콜", "라이트그레이"] }],
    variants: [
      {
        title: "차콜",
        sku: "T3D-MAT-CHC",
        options: { 색상: "차콜" },
        price: 25000,
        stock: 70,
      },
      {
        title: "라이트그레이",
        sku: "T3D-MAT-LGY",
        options: { 색상: "라이트그레이" },
        price: 25000,
        stock: 70,
      },
    ],
    weight: 450,
    scenario: "normal",
  },
  {
    title: "케이블 정리 세트 10개입",
    subtitle: "9,900원 · 배송비 테스트",
    handle: "toss3days-cable-set",
    description:
      "책상 아래 케이블을 정리하는 클립·벨크로 세트입니다. 저가 상품이라 배송 옵션별 배송비 차이를 확인하는 테스트에 사용합니다.",
    category: "living",
    options: [{ title: "구성", values: ["10개입"] }],
    variants: [
      {
        title: "10개입",
        sku: "T3D-CBL-10",
        options: { 구성: "10개입" },
        price: 9900,
        stock: 200,
      },
    ],
    weight: 120,
    scenario: "shipping-test",
  },
]

/**
 * Sale price list applied to every variant of scenario "sale" products.
 * The installed pricing model defaults price lists to type "sale", so the
 * storefront gets a real calculated < original price — no fake UI discount.
 */
export const SALE_PRICE_LIST = {
  title: "3days 데모 세일",
  description:
    "Seed-created sale price list for the 토스 3days demo catalog.",
} as const

export const imageUrl = (imageBase: string, handle: string) =>
  `${imageBase}/${handle}.svg`

export interface CatalogContext {
  salesChannelId: string
  shippingProfileId: string
  /** category key -> id */
  categoryIds: Record<CategoryKey, string>
  /** e.g. http://localhost:8000/demo-products */
  imageBase: string
}

/** Maps demo specs to createProductsWorkflow input records. */
export function buildProductInputs(
  products: DemoProductSpec[],
  ctx: CatalogContext
): Record<string, unknown>[] {
  return products.map((product) => {
    const image = imageUrl(ctx.imageBase, product.handle)

    return {
      title: product.title,
      subtitle: product.subtitle,
      handle: product.handle,
      description: product.description,
      status: "published",
      thumbnail: image,
      images: [{ url: image }],
      weight: product.weight,
      shipping_profile_id: ctx.shippingProfileId,
      category_ids: [ctx.categoryIds[product.category]],
      sales_channels: [{ id: ctx.salesChannelId }],
      options: product.options.map((option) => ({
        title: option.title,
        values: option.values,
      })),
      variants: product.variants.map((variant) => ({
        title: variant.title,
        sku: variant.sku,
        options: variant.options,
        manage_inventory: true,
        allow_backorder: false,
        prices: [{ amount: variant.price, currency_code: "krw" }],
      })),
      metadata: {
        demo: true,
        scenario: product.scenario,
        seed: "seed-korean-catalog",
      },
    }
  })
}

/** sku -> stocked_quantity for every catalog variant. */
export function stockBySku(
  products: DemoProductSpec[] = KOREAN_DEMO_PRODUCTS
): Map<string, number> {
  return new Map(
    products.flatMap((product) =>
      product.variants.map((variant) => [variant.sku, variant.stock])
    )
  )
}

/** sku -> sale price for variants covered by the sale price list. */
export function salePriceBySku(
  products: DemoProductSpec[] = KOREAN_DEMO_PRODUCTS
): Map<string, number> {
  return new Map(
    products
      .filter((product) => product.salePrice != null)
      .flatMap((product) =>
        product.variants.map((variant) => [variant.sku, product.salePrice!])
      )
  )
}
