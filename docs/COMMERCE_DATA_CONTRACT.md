# Commerce 데이터 계약

2026-10-15. 리뷰는 Medusa 2.21.2 공식 Module 확장 방식으로 구현했다. Product·Variant·Pricing·Inventory·Cart·Order core를 재사용한다. 실제 API validator/workflow가 기준이며 중복 review validator는 제거했다.

## 리뷰 읽기

| 경로 | 계약 |
| --- | --- |
| `GET /store/products/:id/reviews` | sort=newest/rating_desc/rating_asc, offset=0..10000, limit=1..50(기본10), 선택variant_id. status 등 미지원 쿼리400. |
| `GET /store/product-review-stats?product_ids=id1,id2` | 최대100 ID, `{stats:[{product_id,average_rating,review_count}]}`. 유효한 무리뷰 상품은 평균null·수0. |

Publishable key의 판매 채널에 속한 published 상품만 조회한다. 무효/비공개/채널외 상품404, 키·채널 정보 없으면400. Variant는 해당 Product 소속이어야 한다. variant 필터는 그 옵션 리뷰만 목록·집계에 포함한다.

공개 조건은 status=approved AND displayable=true. 목록은 `{reviews,count,offset,limit,summary:{average_rating,review_count}}`. 공개 DTO는 id,product_id,variant_id,title,body,rating,written_at,source,source_ref,is_synthetic,verified_purchase 12필드다. ASIN·외부ID·권리·moderation·고객ID는 비공개. title 미입력은 저장빈문자열/공개null. 평균소수점2자리/UI1자리. 모든 정렬의 최종 키는 고유id.

제목·본문은 문자열로 표시한다. 자동 PII 삭제는 없으므로 적재 담당자가 원문 개인정보·공개권리를 검수한다. 저장된 `source_ref`는 공개 DTO에 반환할 때 query/fragment를 제거하며, malformed·비-http(s)·credentials 포함 URL은 `null`로 반환한다. 따라서 원본 URL을 저장할 때 query/fragment에 token 등 비밀값을 넣지 않는 것을 권장한다. 리뷰 목록 `offset`은 0..10000으로 제한하고 범위를 벗어나면 400을 반환한다.

## 관리자 Import

`POST /admin/product-reviews/import`, Medusa 관리자 인증, `{reviews:[...]}` 최대100건. 고객/order 없이 외부 리뷰를 적재한다. SQL 직접적재를 기준으로 삼지 않는다.

| 필드 | 입력/기본값 |
| --- | --- |
| product_id | 필수, 존재하는 Medusa Product ID. ASIN 자동추정 금지. |
| variant_id | 선택/null, 해당 Product 소속 검증. |
| external_review_id | 필수1..255자, `(source,external_review_id)` 멱등 키. |
| asin / parent_asin | 선택/null, 원본 매핑 보존용. |
| title | 선택/null, 최대200자. |
| body | 필수1..5000자. |
| rating | 정수1..5, API와 product_review CHECK 검증. |
| written_at | 1970-01-01 이상·현재 이하, ISO8601 UTC 권장. |
| source | native / amazon / synthetic. |
| source_ref | 선택/null, 값이 있으면 http(s) URL·credentials 금지. 공개 DTO는 query/fragment를 제거하며 잘못된 URL은 null로 반환. |
| is_synthetic | 기본false, source=synthetic이면 항상true. |
| verified_purchase | 선택/null, 출처의 구매 표시이며 Medusa 주문 인증이 아님. |
| status | 기본pending, pending/approved/flagged. |
| displayable | 기본false. amazon 공개true에는 rights_ref 필수. |
| rights_ref | 선택/null, 공개 권리/이용조건 근거. |

전체 Product/Variant 검증→중복검사→module service 생성 순서다. 같은 키의 Product/Variant/title/body/rating이 같으면 skipped, 다르면400 conflict로 거부하고 덮어쓰지 않는다. 검증실패 혼합배치는 저장하지 않는다. DB unique가 동시 중복저장도 차단하지만 경쟁하는 동일키 import의 성공재시도는 보장하지 않는다. 배치를 순차 실행한다. Import는 write-once이며 moderation 수정 UI/API는 범위 밖이다.

Amazon 매핑: text→body, rating→rating, timestamp→written_at, asin/parent_asin→동명필드, 원본리뷰ID→external_review_id, 확정한 Medusa IDs→product_id/variant_id. 사용자식별자는 적재하지 않는다. ETL·원본수집·대량적재는 외부팀 소유다.

```json
{"reviews":[{"product_id":"prod_REPLACE_WITH_REAL_ID","external_review_id":"R_REPLACE_WITH_SOURCE_ID","source":"amazon","title":null,"body":"권리와 개인정보를 검수한 원문","rating":4,"written_at":"1996-01-01T00:00:00.000Z","is_synthetic":false,"status":"pending","displayable":false,"source_ref":"https://example.invalid/reviews/source-id"}]}
```

실제 규칙: `apps/backend/src/api/admin/product-reviews/import/validators.ts`, `src/workflows/product-reviews/`, `src/api/store/products/[id]/reviews/`.

## 스펙

Product metadata.specs는 `{schema_version:"catalog-spec-v1",category,spec_source,fields,extras?}`. Variant의 동일키는 부분fields override이며 category/schema가 같아야 병합한다. unknown은null. 물류weight를 제품무게로 복사하지 않는다. 기존 metadata키는 보존한다.

| category | fields |
| --- | --- |
| monitor | inch, resolution{width_px,height_px}, refresh_hz, panel, ports, usb_c |
| keyboard | layout, switch, connection[], noise |
| mouse | dpi, product_weight_g, connection[], ergonomics |
| living | capacity_ml, material, dimensions{width_mm,depth_mm,height_mm} |

low-profile은 배열이 아니므로 extras.form_factor로 보존하고 layout은미확인이다. 미선택 IPS/VA 패널이나 스위치를 상품공통값으로 추정하지 않는다. 검수된 데모14상품은 seed텍스트 근거이며 외부실제품 스펙으로 일반화하지 않는다.

`catalog-spec-contract.ts`에 타입·검수fixtures, `seed-structured-specs.ts`에 기존공식 Product/Variant update workflow가 있다. seed는 격리 로컬 DB 연결의 격리 QA DB에만 실행한다. title/description·SKU를 확인하고 metadata를 병합한다. seed_demo_text 스펙변경만 갱신하고 다른출처 기존specs는 보존한다. 외부팀은 기존 Medusa워크플로로 metadata를 제공한다. 공유DB에는 demo seed를 실행하지 않는다.

Storefront catalog-specs.ts가 schema/category/unknown·단위를 검증한다. `/kr/compare?products=handle1,handle2&variants=variant1,variant2`는2~4상품을 표시하며 다른상품의 variant 지정은404. 미지정시첫variant를 표시하고 이름을 명시한다. 가격·구매가능여부는 Store API calculated_price/inventory, 평점은같은Product ID batchstats다. 검색카드스펙도현재ID로 기존Product API를 배치조회한다. 검색인덱스는 최종구매가격·재고의 원본이 아니며 상세/Cart에서 재검증한다.

## 조건 검색

`POST /store/product-condition-search` — `apps/backend/src/api/store/product-condition-search/route.ts` + `helpers.ts` 구현 기준으로 확정. publishable key의 sales channel이 **정확히 1개**일 때만 동작한다(아니면 400). `region_id`는 존재하는 region이어야 한다(없으면 400). 결과 공개 범위는 published + publishable key sales channel 상품이다. 조회량 상한은 status와 무관하게 sales channel에 연결된 전체 카탈로그에 적용한다: product link 1,000개, variant 5,000개까지 지원하며 초과 시 400이다. 상품 본문 그래프를 100건씩 조회하기 전에 variant ID만 최대 5,001개 가져와 상한을 확인한다. 실행 검증 상태는 EXECUTION_STATUS Gate F~H를 따른다(2026-10-15 복구 후 새 실행: Backend unit54/54(조건검색 helper12 포함), Backend/Admin·Next production build·별도 타입검사·HTTP smoke PASS, 전체 production E2E156/156 및 최종 조건검색42/42 PASS).

Request:

| 필드 | 규칙 |
| --- | --- |
| region_id | 필수 문자열(≤256). 가격 계산의 region 기준(Region QueryContext). |
| query | 선택 문자열(≤200, trim). 상품 title·description·handle·카테고리명 + variant title·sku·옵션명·값에 대한 대소문자 무시 부분일치. |
| category | 선택, `monitor\|keyboard\|mouse\|living` — catalog-spec-v1 category enum. |
| conditions | 선택 최대 20개 `[{field, operator, value}]`(field≤100자, value는 string/number/boolean). field는 카테고리별 allowlist만 허용하고 operator는 타입별 제한: number=eq/gte/lte, boolean·enum=eq만, string·string[]·enum[]=eq/contains. `category` 지정 시 그 카테고리 필드만 허용하고, 미지정 시 모든 조건이 하나의 카테고리에 공통 허용돼야 한다. |
| max_price | 선택 ≥0. 요청 region의 variant `calculated_price`와 비교하며 가격이 없는 variant는 제외한다. |
| in_stock_only | 선택. 실제 재고로 걸러내며 `manage_inventory=false` 상품은 가용으로 간주한다. `allow_backorder`는 `purchasable` 판정에만 반영하고 이 필터에는 영향이 없다. |
| offset / limit | offset 0..10000 기본0, limit 1..50 기본12. |

평가 규칙: 모든 조건은 **같은 variant**에서 판정한다. `normalizeConditionSearchSpecs`가 `product.metadata.specs` + `variant.metadata.specs` override를 catalog-spec-v1 allowlist로 정규화한다 — schema/category/spec_source 형식이 맞지 않으면 무효이고, malformed variant 값은 그 필드만 null로 override해 오매칭을 막는다. extras와 알 수 없는 키는 응답에 포함하지 않는다. unknown/null 필드는 조건 불일치다. specs가 없는 상품은 조건이 있으면 불일치, 없으면 `specs:null`로 결과에 포함될 수 있다.

Response: `{results:[{product_id, variant_id, handle, title, thumbnail|null, variant_title, sku|null, options:[{title,value}]|null, specs:{schema_version, category, spec_source, fields}|null, price:{calculated_amount|null, original_amount|null, currency_code}, inventory:{quantity, manage_inventory, allow_backorder, purchasable}}], count, offset, limit, observed_at}`. `variant_title`이 없으면 옵션값 조합 또는 `"기본 옵션"`으로 채운다. `quantity`는 `manage_inventory`일 때만 실제 가용 수량이고 아니면 null이다. `purchasable`은 `!manage_inventory || allow_backorder || quantity>0`이다. `count`는 페이지 적용 전 전체 매치 수이며 정렬은 상품명→옵션명→variant id다.

연계·경계: results의 `product_id`/`variant_id`는 기존 `/store/products/:id`·리뷰·cart line item과 동일한 실제 Medusa ID다. `price`/`inventory`는 `observed_at` 시점의 조회 스냅샷으로 비권위다 — 최종 가격·재고는 cart/checkout이 다시 검증하고 검색 응답은 재고 예약이나 가격 고정을 의미하지 않는다(기존 검색 인덱스와 같은 경계). 공개 read는 publishable key 범위이며 Admin import/write와 무관하다. 리뷰의 `is_synthetic`은 공개 출처 표시 flag로 moderation(approved+displayable 공개 게이트)과 직교한다 — synthetic도 approved+displayable이면 공개된다.

## AI/RAG handoff boundary

이번 단계는 계약만 정의하며 RAG 검색·생성·색인 runtime과 Amazon ETL은 구현하지 않는다.

- 정규 식별자는 Medusa API가 반환하는 `product_id`와 `variant_id`다. handle은 화면 탐색용, ASIN과 원본 리뷰 ID는 외부 데이터 매핑용이므로 제목·ASIN만으로 상품이나 variant를 추정하지 않는다.
- 스펙 근거는 Product `metadata.specs`에 Variant override를 병합한 결과다. `schema_version`, `category`, `spec_source`를 보존하고 unknown/null은 미확인으로 취급한다. 값이 없을 때 유사 상품이나 설명문에서 보충 추론하지 않는다.
- 리뷰 근거는 동일 Product ID의 공개 Store 리뷰 API에서 가져온다. `approved`와 `displayable=true`인 리뷰만 공개 가능하며, 운영 RAG는 `is_synthetic=true` fixture를 고객 리뷰 근거로 색인하거나 표시하지 않는다. `verified_purchase`는 원본 출처의 표시이며 Medusa 주문 인증을 뜻하지 않는다. 본문에서 개인정보를 제거하고, query/fragment가 제거된 공개 API의 `source_ref`만 색인·인용에 사용한다. DB 저장 원문을 직접 색인하지 않는다.
- 가격과 재고는 조건검색의 `observed_at` 스냅샷 또는 embedding 본문을 정답 근거로 쓰지 않는다. 추천 variant와 region을 정한 뒤 기존 Store Product API로 최신 계산가·재고를 읽고, Cart/Checkout의 기존 검증을 다시 거친다.
- RAG 응답은 후보의 canonical `product_id`/`variant_id`와 근거만 반환한다. Cart 변경은 사용자가 항목을 선택한 뒤 기존 Medusa Store Cart API로 수행하며 직접 DB 쓰기나 별도 Cart 구현은 하지 않는다.

## Migration / 운영 경계

신규 product_review 및 Medusa module link만 추가했다. Migration20261014124719(생성), Migration20261014125207(default변경), Migration20261014132500(rating CHECK). 적용 migration은 재작성하지 않는다. Product/Variant core 스키마변경은 없다.

공유 DB에는 migration·seed·테스트쓰기 미실행. 독립DB에만 합성QA상품/리뷰/고객/주문을 생성했다. 공유환경 사용전 사용자 migration승인이 필요하며 합성seed는운영에적용하지 않는다. 운영Redis/eventbus/locking·동시import·대용량리뷰DB집계·원문권리/PII검수는 별도 운영준비사항이다.
