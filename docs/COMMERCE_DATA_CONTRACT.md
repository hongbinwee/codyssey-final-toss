# Commerce 데이터 계약

2026-10-14. 리뷰는 Medusa 2.21.2 공식 Module 확장 방식으로 구현했다. Product·Variant·Pricing·Inventory·Cart·Order core를 재사용한다. 실제 API validator/workflow가 기준이며 중복 review validator는 제거했다.

## 리뷰 읽기

| 경로 | 계약 |
| --- | --- |
| `GET /store/products/:id/reviews` | sort=newest/rating_desc/rating_asc, offset>=0, limit=1..50(기본10), 선택variant_id. status 등 미지원 쿼리400. |
| `GET /store/product-review-stats?product_ids=id1,id2` | 최대100 ID, `{stats:[{product_id,average_rating,review_count}]}`. 유효한 무리뷰 상품은 평균null·수0. |

Publishable key의 판매 채널에 속한 published 상품만 조회한다. 무효/비공개/채널외 상품404, 키·채널 정보 없으면400. Variant는 해당 Product 소속이어야 한다. variant 필터는 그 옵션 리뷰만 목록·집계에 포함한다.

공개 조건은 status=approved AND displayable=true. 목록은 `{reviews,count,offset,limit,summary:{average_rating,review_count}}`. 공개 DTO는 id,product_id,variant_id,title,body,rating,written_at,source,source_ref,is_synthetic,verified_purchase 12필드다. ASIN·외부ID·권리·moderation·고객ID는 비공개. title 미입력은 저장빈문자열/공개null. 평균소수점2자리/UI1자리. 모든 정렬의 최종 키는 고유id.

제목·본문은 문자열로 표시한다. 자동 PII 삭제는 없으므로 적재 담당자가 원문 개인정보·공개권리를 검수한다. 원본 URL은 공개 가능한 http(s) 참조이며 user/password를 허용하지 않는다.

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
| source_ref | 선택/null, 값이 있으면 실제 http(s) URL·credentials 금지. |
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

`catalog-spec-contract.ts`에 타입·검수fixtures, `seed-structured-specs.ts`에 기존공식 Product/Variant update workflow가 있다. seed는 localhost55432의 toss3days_review_spike_20261014에만 실행한다. title/description·SKU를 확인하고 metadata를 병합한다. seed_demo_text 스펙변경만 갱신하고 다른출처 기존specs는 보존한다. 외부팀은 기존 Medusa워크플로로 metadata를 제공한다. 공유DB에는 demo seed를 실행하지 않는다.

Storefront catalog-specs.ts가 schema/category/unknown·단위를 검증한다. `/kr/compare?products=handle1,handle2&variants=variant1,variant2`는2~4상품을 표시하며 다른상품의 variant 지정은404. 미지정시첫variant를 표시하고 이름을 명시한다. 가격·구매가능여부는 Store API calculated_price/inventory, 평점은같은Product ID batchstats다. 검색카드스펙도현재ID로 기존Product API를 배치조회한다. 검색인덱스는 최종구매가격·재고의 원본이 아니며 상세/Cart에서 재검증한다.

## Migration / 운영 경계

신규 product_review 및 Medusa module link만 추가했다. Migration20261014124719(생성), Migration20261014125207(default변경), Migration20261014132500(rating CHECK). 적용 migration은 재작성하지 않는다. Product/Variant core 스키마변경은 없다.

공유DB toss3days에는 migration·seed·테스트쓰기 미실행. 독립DB에만 합성QA상품/리뷰/고객/주문을 생성했다. 공유환경 사용전 사용자 migration승인이 필요하며 합성seed는운영에적용하지 않는다. 운영Redis/eventbus/locking·동시import·대용량리뷰DB집계·원문권리/PII검수는 별도 운영준비사항이다.
