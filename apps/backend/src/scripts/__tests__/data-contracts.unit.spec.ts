/** Structured spec fixture invariants. Review validation lives in the runtime module. */
import {
  DEMO_SPEC_FIXTURES,
  buildSpecPatchInputs,
  mergeSpecs,
  SPEC_SCHEMA_VERSION,
  type KeyboardSpecFields,
  type MonitorSpecFields,
} from "../catalog-spec-contract"
import { KOREAN_DEMO_PRODUCTS } from "../seed-korean-catalog-data"

describe("catalog spec contract", () => {
  const patches = buildSpecPatchInputs()

  it("covers every Korean demo product and matches its category", () => {
    const demoHandles = KOREAN_DEMO_PRODUCTS.map((p) => p.handle)
    expect(patches.map((p) => p.handle).sort()).toEqual([...demoHandles].sort())
    for (const p of patches) {
      const demo = KOREAN_DEMO_PRODUCTS.find((d) => d.handle === p.handle)!
      expect(p.product_metadata_patch.specs.schema_version).toBe(SPEC_SCHEMA_VERSION)
      expect(p.product_metadata_patch.specs.category).toBe(demo.category)
      expect(p.product_metadata_patch.specs.spec_source).toBe("seed_demo_text")
    }
  })

  it("keeps unverifiable fields as null instead of guessing", () => {
    const mon24 = DEMO_SPEC_FIXTURES["toss3days-monitor-24-fhd"]
      .product.fields as MonitorSpecFields
    expect(mon24.usb_c).toBeNull() // USB-C 언급 없음 — false가 아니라 unknown
    const kb87 = DEMO_SPEC_FIXTURES["toss3days-keyboard-87"]
      .product.fields as KeyboardSpecFields
    expect(kb87.connection).toBeNull() // 연결 방식 미명시
    const retro = DEMO_SPEC_FIXTURES["toss3days-keyboard-retro"]
      .product.fields as KeyboardSpecFields
    expect(retro.connection).toEqual(["wireless"]) // 무선만 확인됨, 프로토콜 미명시
  })

  it("puts panel as variant override for the dual-panel monitor", () => {
    const f = DEMO_SPEC_FIXTURES["toss3days-monitor-27-qhd"]
    expect((f.product.fields as MonitorSpecFields).panel).toBeNull()
    expect(f.variants["T3D-MON27-IPS"].fields).toEqual({ panel: "ips" })
    expect(f.variants["T3D-MON27-VA"].fields).toEqual({ panel: "va" })

    const merged = mergeSpecs(f.product, f.variants["T3D-MON27-IPS"])
    expect((merged as MonitorSpecFields).panel).toBe("ips")
    expect((merged as MonitorSpecFields).refresh_hz).toBe(144)
  })

  it("maps keyboard switch options to canonical switch+noise overrides", () => {
    const f = DEMO_SPEC_FIXTURES["toss3days-keyboard-87"]
    expect(Object.keys(f.variants)).toHaveLength(6)
    expect(f.variants["T3D-KB87-BLK-RED"].fields).toEqual({
      switch: "red",
      noise: null,
    })
    expect(f.variants["T3D-KB87-BLK-BLU"].fields).toEqual({
      switch: "blue",
      noise: "clicky",
    })
    const lp = DEMO_SPEC_FIXTURES["toss3days-keyboard-lowprofile"]
    expect(lp.variants["T3D-KBLP-RED"].fields).toEqual({
      switch: "red_quiet",
      noise: "quiet",
    })
  })

  it("never copies logistics weight into spec fields", () => {
    // 물류 weight(90g)가 있어도 제품 무게 스펙은 텍스트 확인 불가면 null.
    const ms = DEMO_SPEC_FIXTURES["toss3days-mouse-wireless"]
      .product.fields as import("../catalog-spec-contract").MouseSpecFields
    expect(ms.product_weight_g).toBeNull()
    // 63g은 제품 무게가 텍스트로 확인되므로 허용.
    const gm = DEMO_SPEC_FIXTURES["toss3days-mouse-gaming"]
      .product.fields as import("../catalog-spec-contract").MouseSpecFields
    expect(gm.product_weight_g).toBe(63)
    expect(gm.dpi).toBe(26000)
  })

  it("emits metadata patch shapes that preserve existing keys", () => {
    for (const p of patches) {
      // patch는 specs 키만 담는다 — demo/seed/scenario와 병합될 객체의 부분만.
      expect(Object.keys(p.product_metadata_patch)).toEqual(["specs"])
      for (const v of p.variant_metadata_patches) {
        expect(Object.keys(v.metadata_patch)).toEqual(["specs"])
        expect(v.sku).toMatch(/^T3D-/)
      }
    }
  })
})
