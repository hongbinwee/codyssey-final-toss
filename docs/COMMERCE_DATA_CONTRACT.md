# COMMERCE_DATA_CONTRACT — 리뷰·스펙 데이터 계약 (proposed)

- 작성자: 03 DEVIN · Catalog & Data
- 작성일: 2026-10-14 · 기준: worktree `.worktrees/catalog-data` @ work/catalog-data (33c85fd)
- 상태: **proposed**. SOL 확정 전 계약 초안. 스키마/모델/migration/API 확정은 01 단독 소유, storefront 직접 편집은 하지 않는다.

## 1. 리뷰 계약 (SOL 확정 표준 반영)

구현 타입·검증·투영 헬퍼: `apps/backend/src/scripts/review-import-contract.ts`
(`REVIEW_CONTRACT_VERSION = "review-contract-draft-2"`), 단위 테스트 `__tests__/data-contracts.unit.spec.ts`.

### 1.1 읽기 API (01이 실구현 — 여기는 계약만)

| API | 형태 |
|---|---|
| `GET /store/products/:id/reviews` | `?sort=newest\|rating_desc\|rating_asc&offset=0&limit=10`(limit max 50), `variant_id` 지정 시 **그 exact variant 리뷰만**(상품 전체와 섞지 않음). 미지정 시 상품 전체(모든 variant) 리뷰. |
| `GET /store/product-review-stats` | `?product_ids=a,b,c` batch → `{stats:[{product_id, average_rating, review_count}]}`. 유효한 상품은 리뷰 0건이어도 `review_count:0, average_rating:null`로 채운다. |

응답 `reviews[]` 원소(public projection):
`{id, product_id, variant_id, title, body, rating, written_at, source, source_ref, is_synthetic, verified_purchase}`

**투영 제외**: `asin`, `parent_asin`, `external_review_id`, `rights_ref`, `status`, `displayable`, 고객 식별자·이메일 등 비공개 데이터. `source_ref`는 공개-safe 내용만.

공개 조회는 `status="approved"` AND `displayable=true`만. client가 pending을 요청할 수 없다. 리뷰 0건은 `average_rating=null` — **0점으로 표시 금지**. 평균 평점은 backend 표준 **소수점 2자리** 반올림(01 메서드와 동일), UI 표시는 toFixed(1) 등 별도 결정.

### 1.2 Import 계약 (Admin only — P0에 쓰기 UI 없음)

`POST /admin/product-reviews/import` — body `{reviews:[…]}`, 배치 최대 50건, Admin 인증만. SQL 직접 적재 금지.

| 필드 | 타입 | 규칙 |
|---|---|---|
| `product_id` | string `prod_*` | 필수, 명시적. ASIN 자동 추정 매핑 금지 |
| `variant_id` | string? | 지정 시 해당 product 소속이어야 함 |
| `external_review_id` | string | 필수 — `unique(source, external_review_id)` |
| `asin` / `parent_asin` | string? | 보존용. 상품 매핑에는 쓰지 않는다 |
| `title` | string? | 입력 optional null 허용. 01 model이 text 필수면 '' 저장 또는 model nullable — canonical public은 null 유지 (SOL 결정) |
| `body` | string | 원문 필수 |
| `rating` | int 1..5 | 필수 |
| `written_at` | ISO 8601 | 필수, parse 가능해야 함 |
| `source` | `"native"\|"amazon"\|"synthetic"` | 출처 채널. `source="synthetic"`이면 `is_synthetic=true` 필수(double-false 금지). 반대 방향(is_synthetic=true인 native)은 허용 |
| `source_ref` | string? | 원본 참조. 외부 소스(native 외)는 필수 |
| `is_synthetic` | boolean | 합성/테스트 여부 |
| `verified_purchase` | boolean? | **출처 사이트의 claim이며 Medusa 구매 인증이 아니다.** 신호 없으면 null |
| `status` | `pending\|approved\|flagged` | 기본값 `pending` |
| `displayable` | boolean | rights 불명이면 false. `rights_ref=null`이면서 `displayable=true`는 검증 거절 |
| `rights_ref` | string? | 이용조건·라이선스 참조. 외부 데이터 필수 |

배치 규칙: 쓰기 전에 배치 전체를 원자적으로 검증하고 멱등(idempotent). 같은 `(source, external_review_id)` 중복은 **datasource 충돌**로 리포트. 외부 리뷰는 기존 Medusa customer/order 없이도 허용한다(필수). 고객 개인정보는 계약 필드에 없다.

### 1.3 외부 팀 매핑 노트

- 외부 데이터팀은 별도 브랜치/저장소일 가능성이 높아 계약 대기 없이 이 문서를 proposed로 공유한다. Amazon ETL·원본 수집은 이번 범위 밖.
- Amazon Reviews 2023 필드 대응(예시): `asin`/`parent_asin`→동명 필드, `rating`→`rating`, `text`/`title`→`body`/`title`, `timestamp`→`written_at`, `verified_purchase`→`verified_purchase`, 사용자 정보는 계약에 없음(적재하지 않음). 실제 페이로드 필드명은 01 검증 결과 후 2차 정합화.
- 플러그인(lambdacurry) 현 모델은 metadata 없음으로 확인돼 공식 Module 전환 가능성이 높다 — schema 생성·migration은 01 단독.

## 2. 스펙 계약 (proposed)

구현 타입·fixture·patch-input 빌더: `apps/backend/src/scripts/catalog-spec-contract.ts`
(`SPEC_SCHEMA_VERSION = "catalog-spec-v1"`). **별도 Spec 테이블은 만들지 않는다** — product/variant `metadata.specs` 재사용(D).

| 규칙 | 내용 |
|---|---|
| 구조 | `{schema_version, category, spec_source, fields, extras?}` |
| 수치 | 필드명에 단위 포함 typed number (inch, hz, dpi, ml, g, mm, px) |
| unknown | 확인 불가 값은 `null`. 추정 금지 |
| 상품/옵션 | `product.metadata.specs` = 기본값, `variant.metadata.specs` = 그 variant만 다른 필드의 부분 override(`mergeSpecs` 머지, variant 우선). 예: 27인치 QHD의 `panel`은 상품 null + `T3D-MON27-IPS`→ips / `T3D-MON27-VA`→va |
| 물류 weight | `product.weight`(배송비 계산용)를 스펙으로 복사 금지. 제품 무게는 `product_weight_g`로만 |

카테고리 필드: monitor `inch/resolution{width_px,height_px}/refresh_hz/panel/ports/usb_c`, keyboard `layout/switch/connection/noise`, mouse `dpi/product_weight_g/connection/ergonomics`, living `capacity_ml/material/dimensions`. 정형 필드에 없는 검증 가능 값은 `extras`에 둔다(hdr10, waterproof 등).

`DEMO_SPEC_FIXTURES`는 14개 데모 상품 전부를 seed 텍스트에서 확인 가능한 값으로만 채웠다(나머지 null). `buildSpecPatchInputs()`는 metadata merge용 patch 입력만 생성 — **실제 쓰기는 SOL 계약 선택 후** seed 수정 시에만 반영한다. 기존 `demo/seed/scenario` metadata 키는 merge로 보존해야 한다.

## 3. 표시/UI 공용 계약 제안 (02 전달용 draft — storefront 편집 없음)

- 상품 카드/비교표 입력: `{product_id, average_rating: number|null, review_count: number}` (`product-review-stats` 응답과 동형). `average_rating=null`이면 별점 영역을 렌더하지 않는다(0점 표시 금지).
- 상품 상세 리뷰 영역 입력: `ReviewListResponse` 그대로. `count=0`이면 empty state.
- 스펙 표시/비교 입력: `mergeSpecs(product.metadata.specs, variant.metadata.specs)` 결과 + `extras`. null 필드는 "확인되지 않음"으로 표시하거나 행을 숨긴다 — 임의 값을 채우지 않는다.

## 4. 소유권·전제

| 항목 | 소유 |
|---|---|
| 계약 타입·검증·투영 헬퍼·테스트 | 03 (이 파일 + `review-import-contract.ts` + `catalog-spec-contract.ts` + unit spec) |
| 리뷰 schema/모델/migration/Store·Admin API 구현 | 01 단독 (공식 Module 방식 유력) |
| Storefront 표시 | 02 (위 draft 입력 계약 사용) |
| 외부 데이터 적재 | 외부 데이터팀 — Admin import 계약으로만, SQL 금지 |
| 공유 DB(localhost:55432/toss3days) 쓰기·migration·seed 실행 | 사용자 승인 전 금지. 합성 리뷰 테스트는 격리 DB만 |

미결·대기: 없음(계약 대기 불필요 — SOL이 확정 책임). 플러그인 실제 페이로드 정합화는 01 결과 후 2차.

## 5. 검증 증거

- `npx jest src/scripts/__tests__/data-contracts.unit.spec.ts` (TEST_TYPE=unit): **17/17 통과** — 전 상품 fixture 커버, unknown=null, variant override(IPS/VA·스위치·소음), 물류 weight 미복사, patch 형태 보존, rating 범위/본문/id/date 검증, rights↔displayable, synthetic⇒is_synthetic 필수, 배치 max 50, (source,external_review_id) 중복 충돌, approved+displayable 투영·비공개 필드 제외, 통계 0건→null, 평균 소수점 2자리.
- DB·API·migration 실행 없음. 실제 적재·런타임 검증은 별도 Gate.
