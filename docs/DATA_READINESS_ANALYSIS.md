# Shopping Brain Readiness & GAP 분석 — 데이터 도메인

- 작성자: 03 DEVIN · Catalog & Data
- 작성일: 2026-10-14 (03 작성, SOL 근거·우선순위 통합 검토)
- 기준 커밋: commerce main a65dfbf
- 범위: 상품 카탈로그·리뷰·스펙·검색/RAG용 데이터 자산의 현재 상태와 갭. 코드·DB·설정 변경 없이 읽기 전용 분석만 수행했다.

## 1. 검증 방법과 근거

이 문서의 수치는 세 가지 근거에서 왔다. 직접 확인한 것과 기존 증거 파일·미측정 추정을 구분해 표기한다.

1. **읽기 전용 DB 프로브 (2026-10-14, 이 세션에서 1회 실행)**: 로컬 Postgres에 `BEGIN → SET TRANSACTION READ ONLY → … → ROLLBACK`으로 SELECT만 실행. 스크립트는 세션 작업 디렉터리의 `probe-catalog-db.cjs`이며 커밋되지 않았다.
2. **기존 증거 파일 (`.local/bootstrap/`, SOL 및 이전 게이트 산출물)**: `shopping-brain-readonly-result.json`(checkedAt 2026-10-14T07:47Z), `korean-db-counts.json`, `korean-search-result.json`, `korean-catalog-result.json`, `commerce-integration-result.json`, `serial-e2e-report.json`(51/51 통과 근거), `final-e2e-report.json`(병렬 실행 48/51).
3. **런타임 상태**: SOL 확인 기준 backend `localhost:9000/health` 200, storefront `localhost:8000/kr` 200으로 **서비스는 실행 중**이다(2026-10-14). 다만 이 문서를 작성한 03 세션의 샌드박스에서는 해당 주소 접속이 제한(HttpRequestException)되어, `/store/search` 등 HTTP API는 **이번 세션에서 재호출하지 않았고** 기존 API 증거 파일을 재사용했다.
4. **소스 코드**: `apps/backend/src/search/product.ts`, `apps/backend/src/search/helpers/pricing.ts`, `apps/backend/src/scripts/seed-korean-catalog-data.ts`, `apps/backend/src/scripts/seed-korean-catalog.ts`.
5. **외부 데이터 후보**: 각 제공자의 공식 문서·공지·데이터셋 페이지만 근거로 사용한다. 공식 원문으로 확인 못 한 항목은 F(미검증)로 표시하고 도입을 전제로 기술하지 않는다.

분류 기준(이번 분석 지시에서 정의된 척도):

- **A**: 지금 그대로 사용 가능
- **B**: 설정 또는 UI 연결만 필요
- **C**: API/구조는 있는데 데이터가 부족
- **D**: 공식 확장 지점(예: `metadata` 필드) 재사용으로 해결 가능
- **E**: 최소 신규 개발 필요
- **F**: 미검증 — 확인 전까지 판단 보류

## 2. 현재 데이터 현황 (검증됨)

### 2.1 카탈로그 규모

| 항목 | 수치 | 근거 |
|---|---|---|
| 전체 상품 | 18개 | DB 프로브 `products_total` |
| 한국어 데모 상품 (`toss3days-*`) | 14개, 전부 `published` | DB 프로브 `products_t3d`, `t3d_products` |
| 업스트림 Medusa 상품 | 4개 (t-shirt, sweatshirt, sweatpants, shorts, 영어) | DB 프로브 `products_other` |
| 한국어 상품 variants | 27개, SKU `T3D-*` | DB 프로브 `variants_t3d` |
| KRW 가격 행 | 30개 | DB 프로브 `krw_prices` |
| 한국어 상품 이미지 | 14개 (상품당 1개, 자체 제작 SVG) | DB 프로브 `media_count` |
| 리전 | Europe(eur), Korea(krw) | DB 프로브 `regions` |
| 카테고리 | 모니터·키보드·마우스·생활용품 + 업스트림 4개 | DB 프로브 `categories` |
| 세일 price list | "3days 데모 세일", type=sale, status=active, starts_at 2026-01-01 | DB 프로브 `price_lists` |

### 2.2 시나리오 커버리지 (마스터플랜 §14.3 대비)

14개 한국어 상품은 `product.metadata.scenario`로 시나리오가 태깅돼 있고, 재고 엣지 케이스가 "Korea Warehouse" 재고 수준으로 실제 존재한다(DB 프로브 `inventory_levels`).

| 시나리오 | 대표 상품 | 검증 상태 |
|---|---|---|
| normal | 데일리 24인치 FHD 모니터 등 8개 | A |
| multi-option | 기계식 키보드 87키 (색상 2 × 스위치 3 = 6 variants) | A |
| limited | 27인치 한정 패키지 (재고 2), 로우프로파일 키보드 (재고 3) | A — 수량 2/3이 inventory_level에 실존 |
| soldout | 레트로 무선 키보드 (재고 0, `T3D-KBRT-IVR`) | A — 수량 0 실존 |
| sale | 시그니처 32인치 4K (salePrice 479,000, price_list 연결) | A |
| shipping-test | 케이블 정리 세트 (9,900원) | A |

모든 한국어 variant는 `allow_backorder=false`, `manage_inventory=true`다(DB 프로브 `t3d_variants_sample`).

### 2.3 검색 인덱스

Medusa 코어의 **Postgres 네이티브 검색**(Meilisearch 아님)이 구성돼 있다.

- 인덱스 테이블: `search_pg_product_v1`, `search_pg_product_v2` + `search_index*` 메타 테이블(DB 프로브 `search_tables`, SOL 프로브 `search`).
- 검색 가능 필드와 가중치: title(w3), option_values(w2), description(w1) — `apps/backend/src/search/product.ts:48-61`.
- 필터/패싯: category, labels(tags), option_values, status, sales_channel_ids, 통화별 가격(min/max/original/on_sale × eur/usd/krw) — `product.ts:44-61`, `helpers/pricing.ts`, SOL 프로브 `plan.fields`.
- `/store/search` 동작 증거: "기계식" → 2건, KRW min/max/original 가격 반환 (`korean-search-result.json`). 이번 세션에서는 미호출 — 기존 증거 재사용.
- Postgres 확장: pg_trgm 1.6, unaccent 1.1 (SOL 프로브 `extension`).
- 벡터 필드: 없음 — 양쪽 인덱스 plan의 `vectors`가 비어 있다(SOL 프로브).

## 3. 갭 분석 요약 (A–F)

| # | 항목 | 현재 상태 | 분류 | 우선순위 |
|---|---|---|---|---|
| 1 | 구조화 스펙 (해상도·주사율·DPI 등) | 자유 텍스트에만 존재. 최신 요청 B(27인치 QHD 조건 비교)에 필수 | **D + E** | **P0** |
| 2 | 리뷰·평점 데이터 존재 여부 | 검증 완료 — 테이블·모듈·데이터 부재 확인 | 확인됨 (부재) | **P0 (검증 완료)** |
| 3 | 리뷰 최소 데이터 | 0건. 전체 리뷰 시스템은 요구사항 아님 — 최소 스펙부터 | **C + E** | P1 |
| 4 | 한국어 텍스트 검색 설정 | `medusa_search_english`만 사용. 개선안 효과 미측정 | **B/F** | P1 |
| 5 | 벡터 검색·임베딩 | plan.vectors 비어 있음. RAG 필수 조건은 아님 | **선택지 (pgvector 가용성은 F)** | P2 |
| 6 | 외부 상품 ID 연계 (ASIN·GTIN 등) | 내부 id/SKU/handle만 존재. 매핑 규약 없음 | **E** (도입 시) | P2 |
| 7 | 외부 데이터셋 후보 | 4개 후보 조사 — 2개는 공식 확인상 사실상 이용 불가 | **F** | P1 |
| 8 | 합성 데이터 분리 | `metadata.demo=true` 마커 존재. SQL 필터만 확인, 인덱스 필드 없음 | **A (SQL) / F (인덱스·API)** | — |

## 4. 항목별 상세

### 4.1 리뷰·평점 데이터 — 존재 여부 검증 결과: 부재 (P0 항목, 검증 완료)

**검증 결과 (완료)**

- `information_schema`에서 `%review%`/`%rating%` 패턴 테이블 **0건** (DB 프로브 `review_like_tables` 결과 비어 있음).
- SOL 프로브의 `reviewTables`에 잡힌 `price_preference`, `user_preference`는 이름만 유사할 뿐 Medusa 내부 테이블이며 쇼핑 선호/리뷰와 무관하다. 혼동 금지.
- 백엔드 소스에 리뷰 모듈·API 없음 (`apps/backend/src` grep). 스토어프론트의 `review` 히트는 전부 checkout 주문확인 단계이며 상품 리뷰가 아니다.
- Medusa v2 코어에는 리뷰 모듈이 없다. 공식/커뮤니티 리뷰 플러그인 존재 여부는 이번에 검증하지 않았다(F).

**판단**: 리뷰·평점 데이터는 존재하지 않는다(검증 완료). 단, SOL 지시대로 **전체 리뷰/평점/사진/도움돼요 시스템 구축은 현재 요구사항이 아니다.** 리뷰 기능이 필요해지면 최소 스펙부터 도입을 검토한다.

요청 항목별 필드 존재 확인:

| 요청 필드/기능 | 존재 여부 | 근거 |
|---|---|---|
| 브랜드 | 부재 | `DemoProductSpec`에 brand 필드 없음 (`seed-korean-catalog-data.ts:42-64`) |
| 내부 product_id / variant_id | 존재 | `prod_*` ULID, variant id (DB 프로브 `t3d_products`) |
| 외부 상품 ID (ASIN·GTIN 등) | 부재 | 시드 스키마에 없음 (§4.5) |
| 별점·리뷰 수·평점 평균 | 부재 | 리뷰 테이블·필드 없음 (위 검증 결과) |
| 리뷰 일시·출처 | 부재 | 동일 |
| 구매 인증 플래그 (purchase flag) | 부재 | 동일 |
| 리뷰 조회 UI·API | 부재 | storefront·backend에 상품 리뷰 경로 없음 |
| 리뷰 작성 UI·API | 현재 부재 | 읽기 리뷰 분석을 위해 전체 작성 시스템을 먼저 만들 필요는 없음 |
| 리뷰 정렬·필터 | 부재 | 검색 인덱스·API에 리뷰 필드 없음 (`product.ts:44-61`) |

**최소 리뷰 데이터 스펙 (도입 시 제안, 규모·모듈 수 미확정)**

- 필수: 본문(text), product_id, 출처(source), 작성시간
- 선택: rating(평점)
- 이후 단계로 분리: 사진 리뷰, 도움돼요 수, 정렬 옵션 → P1/P2
- 필요 모듈·API 개수는 설계 확정 전 단정하지 않는다.

P0는 리뷰 존재 여부 확인에 더해 **시나리오 B의 리뷰 근거를 어떤 데이터로 검증할지 결정하는 단계**까지 포함한다. 실제 소량 리뷰 실험을 첫 MVP에 넣으면 필요한 읽기 데이터/출처/상품 ID 연결도 P0다. 리뷰 없는 스펙 MVP를 선택하면 그 제한을 답변에 명시하고, 리뷰 도입·고도화는 P1로 남긴다. 리뷰 부재 확인만으로 리뷰 근거 추천이 준비됐다는 뜻은 아니다. 전체 우선순위는 [통합 분석](SHOPPING_BRAIN_GAP_ANALYSIS.md)을 따른다.

### 4.2 구조화 스펙 부재 — P0 (요청 B 조건 비교 필수)

**현재 상태 (검증됨)**

스펙 정보가 자유 텍스트에만 들어 있다. 예시는 `seed-korean-catalog-data.ts`:

- 모니터: "1920×1080, 75Hz, sRGB 99%, HDMI·DP" (L73), "2560×1440, 144Hz, 높이조절" (L93), "3840×2160, HDR10, USB-C 65W" (L120) — 전부 `description` 문자열.
- 마우스: "26000DPI"(title, L325), "63g"(subtitle, L326) — 텍스트.
- 검색 인덱스가 구조화해서 노출하는 것은 options 값뿐이다: 크기, 패널, 색상, 스위치, 구성, 손 방향 (`option_values` 패싯). 해상도·주사율·색역·DPI·연결방식 같은 비교축은 어떤 필드로도 필터/패싯 불가.
- `product.metadata`는 `{demo, seed, scenario}` 마커만 담고 스펙은 담지 않는다(DB 프로브 `t3d_products`).
- **weight 구분**: `DemoProductSpec.weight`(그램, `seed-korean-catalog-data.ts:60`)는 `buildProductInputs`가 `createProductsWorkflow` 입력의 **상품 수준 `weight` 필드**로 전달한다(`seed-korean-catalog-data.ts:487` — `variants[]` 항목에는 weight가 없다). 14개 상품 전부 값이 있다(L85~L443). 이 필드는 Medusa에서 **배송비 계산용 물리 속성(무게)**이며 비교·추천용 스펙 필드가 아니다. 실제 DB의 `variant.weight` 반영값(0/null 여부)은 기존 증거 파일에 없고 추가 DB 조회를 수행하지 않아 미확인(F).

**영향**: 최신 요청 B의 "27인치 QHD 모니터 조건 비교"처럼 해상도·주사율·패널 같은 조건 추천·비교·필터 칩이 구조화 데이터 없이는 불가능하다.

카테고리별 속성 매트릭스(구조화 = options/variant 필드로 필터 가능, 텍스트만 = description·subtitle·title에만 존재):

| 카테고리 | 구조화된 속성 (해당 상품 일부만) | 텍스트에만 있는 속성 | 비교·추천 핵심축 중 결손 |
|---|---|---|---|
| 모니터 (4) | 크기(24·32인치 모델만), 패널(27 QHD만), 구성(한정 패키지만), weight(전 상품, 물류용) | 해상도, 주사율, 색역(sRGB 99%), HDR, 입력포트(HDMI·DP), USB-C 충전 | 해상도, 주사율, **색역**, 입력포트, **USB-C** |
| 키보드 (4) | 색상(87키·슬림만), 스위치(87키·로우프로파일만) | 배열(87키), 소음(저소음 적축·클릭 청축 — 스위치 명칭 텍스트), **무선/연결방식**(블루투스·무선), 멀티페어링, 프로파일 | 소음, 배열, 무선 여부. **키압은 N/gf 수치 데이터가 어디에도 없음 (unknown)** |
| 마우스 (3) | 색상(무선 모델만), **손 방향**(버티컬만) | DPI, 무게(63g), 저소음, **인체공학**(버티컬), 연결방식 | DPI, 무게, 인체공학 |
| 생활용품 (3) | 색상(텀블러·매트), 구성(케이블 세트) | 용량(500ml), 재질(PU 가죽), 방수, 보온시간(12시간), 사이즈(90×40) | 용량, 재질, 사이즈 |

**권장 (P0)**: 카테고리별 필수 속성 스키마를 기존 `product.metadata`와 필요한 `variant.metadata`에 정형화한다 — 기본 필드 재사용으로 신규 Commerce 테이블부터 만들 필요 없다. 숫자(인치/Hz/DPI/그램)는 수치·단위·범위 검색 필드, 패널/연결 방식은 enum/keyword 필드로 투영하는 최소 확장을 검토한다(D+최소 코드). 설명에서 추출할 수 있는 값은 사람이 검수하고, 없는 포트/키압/색역 등은 unknown으로 남긴다. 파싱 가능하다고 모든 필요한 데이터를 이미 갖춘 것은 아니다. 같은 상품의 패널별 속성·가격은 해당 variant에서 동시에 조건을 충족해야 한다.

### 4.3 한국어 검색 품질 — P1

- 사용 중인 텍스트 설정: `medusa_search_english` (SOL 프로브 `textConfigurations` — korean 설정 없음, Postgres 기본 제공에도 korean 없음).
- "기계식" 2건 히트는 관찰됐지만(`korean-search-result.json`), 그것이 pg_trgm 부분매칭 기여인지 ts_rank 정확 매칭인지 **측정하지 않았다**. 조사 변형·동의어·오탈자에 대한 커버율도 미측정이므로 "현재 검색이 데모에 충분하다/부족하다"고 단정하지 않는다 — 품질 평가가 필요하다.
- 개선 후보: `simple` 텍스트 설정(설정 후보, B), pg_bigm/한국어 파서 확장(F — 대상 Postgres 가용성 미확인), 다른 search provider(F — 공식 지원·현재 버전 통합 확인 필요). `simple`은 한국어 형태소 분석기가 아니다. 우선 한국어 질의셋으로 현재 검색을 평가(P0)하고, 개선안 도입·효과는 그 결과로 결정한다. Algolia/Meilisearch를 설치된 공식 모듈로 간주하지 않는다.

### 4.4 벡터 검색·임베딩 — P2 (선택지이지 필수가 아님)

- 검색 plan의 `vectors` 배열이 양쪽 인덱스 모두 비어 있다(SOL 프로브). 임베딩 파이프·벡터 컬럼·pgvector 확장 전부 부재.
- 주의: **RAG에 벡터 검색은 필수가 아니다.** 키워드 검색 결과를 LLM 컨텍스트에 넣는 방식으로도 RAG를 구성할 수 있고, "키워드 검색으로 의미 기반 쿼리를 커버 못 한다"고 측정 없이 단정하지 않는다. 의미검색 품질이 요구 수준에 못 미치는지는 평가가 선행돼야 한다.
- pgvector 설치 가능 여부(로컬 Postgres 빌드) 미확인 → F.

### 4.5 ID 연계 체계 — P2

- 내부 식별자는 안정적이다: `prod_*`(ULID), variant id, SKU `T3D-*`(결정론적), handle `toss3days-*` — 재시드 시에도 동일 키 유지(`seed-korean-catalog-data.ts` 헤더 주석).
- 외부 식별자(ASIN, GTIN/EAN, 브랜드·모델번호)는 시드 스키마에 없고 외부 데이터와의 ID 매핑도 없다. variant에 ean/upc/barcode 컬럼은 Medusa 모델상 존재하나 시드에서 미설정.
- 외부 데이터를 붙이려면 매핑 테이블 또는 `variant.metadata` 내 외부 ID 규약이 필요하다(E). 외부 연동 계획 자체가 미정이므로 P2.

## 5. 외부 데이터셋 후보 (공식 1차 소스 확인 기준)

조사 결과 4개 후보 중 2개는 공식 확인상 사실상 이용 불가다. 조건 미확인 항목은 도입 전제로 기술하지 않는다(마스터플랜 §19.3). 모든 외부 코퍼스의 저장·AI 분석/재배포 권리는 아직 미검증(F)이며, 외부 데이터와 내부 상품 간 ID 매핑은 되어 있지 않다.

| 후보 | 규모·내용 | 한국어 | 공식 확인 상태 | 공식 소스 |
|---|---|---|---|---|
| AI Hub 속성기반 감정분석 데이터 | 약 250,312건 (2022년 구축, 2023-12 갱신 — 공식 페이지 표시). 쇼핑몰·SNS 상품 리뷰의 속성·감정 라벨, JSON | 예 | 데이터셋 페이지 확인됨(dataSetSn=71603). 이용조건·다운로드 요건·저장/AI 활용 권리는 로그인 후 확인 필요 → F | https://aihub.or.kr/aihubdata/data/view.do?currMenu=115&dataSetSn=71603&topMenu=100 |
| Amazon Reviews 2023 (McAuley Lab, UCSD) | 리뷰 5.7154억 건·사용자 5451만·상품 4819만·33개 카테고리(1996-05~2023-09). 필드: rating/text/images/asin/parent_asin/timestamp/helpful_vote/verified_purchase + 상품 메타 | 아니오 (영어) | 데이터셋 페이지 확인됨. 라이선스 비명시(연구 목적, 준수 책임 사용자) → 저장·AI 활용·재배포 권리 F | https://amazon-reviews-2023.github.io , https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023 |
| 네이버 쇼핑 검색 API | 상품 검색 API (리뷰 본문 미제공) | 예 | **종료 상태 (공식 확인)**: 개발자센터 공지(아래 URL)에서 2026-07-31 24:00 서비스 종료·유예 없음·API HUB 이관 대상 제외로 안내 — API 문서 본문에는 종료 문구가 없어 공지 URL을 별도 인용. 신규 이용 불가 → 후보에서 제외 | https://developers.naver.com/notice/article/32530 (종료 공지) , 문서: https://developers.naver.com/docs/serviceapi/search/shopping/shopping.md |
| Amazon PA-API 5.0 → Creators API | 실시간 상품 정보·가격·오퍼, ASIN 키 | 아니오 | PA-API 5.0 문서 URL이 deprecation 공지로 리다이렉트됨(확인) → 구 API를 가용 후보로 확정 불가. Creators API 가입·사용·저장 조건 미검증 → F | https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation (deprecation 공지) |

판단 메모: 한국어 리뷰 코퍼스 요건이라면 AI Hub 데이터셋이 공식 페이지에서 확인된 한국어 후보다(다른 한국어 코퍼스의 존재 여부는 이번에 조사하지 않아 단정하지 않는다). Amazon Reviews 2023은 규모·스키마가 크지만 영어 데이터이고 라이선스가 비명시다. 네이버 쇼핑 API는 공식 공지상 종료 상태라 후보가 아니며, PA-API 5.0은 deprecation 리다이렉트가 확인돼 Creators API 조건 확인 전까지 도입 대상이 아니다.

공통 제약: 네 후보 모두 현재 데모 상품과 **ID 매핑이 되어 있지 않다**(외부 ID 체계 부재, §4.5). 평점 연결 방식도 미확정이다 — Amazon Reviews 2023은 rating·ASIN·parent_asin·helpful_vote·verified_purchase·timestamp 필드가 있으나 데모 상품과의 연결 규약이 없고, AI Hub는 별점(1-5점) 형태인지 속성·감정 라벨 중심인지 공식 페이지 표시만으로는 미확인 → F. 제공된 신뢰 신호가 리뷰의 진실성·이 프로젝트 상품과의 동일성을 보증하지 않는다. 코퍼스의 과거 기간/갱신일과 지속 갱신 계획을 구분하며, 후자는 미확인이다. 저장·AI 분석·재배포 권리는 전 후보 공통 F.

## 6. RAG 준비도 평가

| 계층 | 현재 | 평가 |
|---|---|---|
| 검색 코퍼스 (상품) | title/description/option_values 텍스트 + 카테고리·가격 패싯 | 키워드 검색 코퍼스로 사용 가능 (A) |
| 리뷰 코퍼스 | 없음 | 리뷰 RAG는 데이터 확보가 선행 (C→E, 최소 스펙은 §4.1) |
| 벡터 저장소 | 없음 (plan.vectors=0) | RAG 필수 조건 아님 — 키워드 검색 + LLM 컨텍스트로 시작 가능. 벡터 도입은 품질 평가 후 선택 (pgvector 가용성 F) |
| 한국어 토큰화 품질 | medusa_search_english | 커버율 미측정 — 평가 후 개선안 결정 (B/F) |
| 청킹·임베딩 파이프 | 없음 | 벡터 경로 선택 시에만 필요 (E) |

결론: 상품 키워드 검색은 지금 쓸 수 있고, 그 위에 컨텍스트 주입형 RAG도 벡터 없이 시작할 수 있다. 다만 요청 B 유형의 조건 비교는 구조화 스펙(P0)이 선행돼야 하고, 리뷰 근거 답변은 리뷰 데이터 확보가 선행이다.

## 7. 합성 데이터 분리 정책과 최소 데이터 권장

**현재 분리 장치 (검증 범위 표기)**: 14개 한국어 상품 전부 `metadata = {demo:true, seed:"seed-korean-catalog", scenario:*}`. **SQL에서 `metadata->>demo` 필터로 식별 가능한 것까지만 확인했다.** 검색 인덱스 필드 정의(`product.ts:44-61`)에는 metadata가 없으므로 인덱스·검색 층에서의 필터는 현재 불가하고, 스토어 API에서 metadata 파라미터 필터 지원 여부도 미확인(F). 업스트림 4개 상품과는 handle prefix로 구분된다. 재시드는 handle/SKU 기준 멱등이다.

**권장 정책**

1. 향후 추가되는 모든 합성 데이터(리뷰 포함)에 동일 마커 규약 적용: `metadata.demo=true` + `metadata.seed` + `metadata.scenario`.
2. 외부 데이터가 들어오면 product/review 테이블에 직접 섞지 말고, `metadata.source`(예: `"aihub"`, `"amazon-reviews-2023"`)로 출처를 남기고 외부 원본과의 매핑 키를 별도 보관한다.
3. 라이선스가 비명시인 외부 코퍼스(Amazon Reviews 2023)는 조건 확인 전까지 DB 적재를 하지 않는다.

**14개 상품의 용도별 충분성 (현재 데이터 기준 평가)**

| 용도 | 충분한가 | 근거·결손 |
|---|---|---|
| 구매·장바구니·주문 시나리오 | 충분 | 6개 시나리오 실제 커버 (§2.2, A) |
| 키워드 검색 데모 | 부분 | `/store/search` 히트 증거 있으나 코퍼스가 18개라 랭킹·교정 품질 평가는 한계. 커버율 미측정 |
| 옵션 필터/패싯 | 부분 | option_values·category·가격 패싯 존재. 카테고리당 3~4개 상품이라 패싯 선택지가 적다 |
| 스펙 비교 (요청 B) | 불충분 | 구조화 스펙 부재 — P0 해소 필요 (§4.2) |
| 리뷰 기반 기능 | 불충분 | 리뷰 데이터 0건 (§4.1) |
| 품질·성능 평가 | 한계 | 상품 수가 적어 추천 품질·검색 품질의 통계적 평가 커버리지가 제한된다 (측정 자체는 아직 안 함) |

**최소 데이터 권장안**: 상품 추가보다 결손 축부터 메운다. (1) 구조화 스펙을 `product.metadata`에 기입해 요청 B 조건 비교를 해소(P0). (2) 리뷰는 최소 스펙(본문·product_id·출처·작성시간, rating 선택)의 합성 데이터를 demo 마킹으로 소량 도입 여부를 결정 — 사진·도움돼요는 P1/P2로 분리. (3) 외부 코퍼스는 라이선스·저장 조건 검증 후 판단.

## 8. 우선순위 정리

- **P0**: 구조화 스펙 — 요청 B(27인치 QHD 조건 비교) 필수. `product.metadata` 재사용(D) + 필요 시 검색 필드 최소 확장(E). / 리뷰 존재 여부 검증 — **완료(부재 확인)**.
- **P1**: 리뷰 최소 데이터 도입 여부 결정(§4.1 최소 스펙), 외부 데이터 후보 조건 검증(AI Hub 이용조건·Amazon Reviews 2023 라이선스), 한국어 검색 품질 측정(§4.3).
- **P2**: 벡터 검색 도입 평가(품질 측정 후, pgvector 가용성 F), 외부 ID 매핑 규약(§4.5), 사진 리뷰·도움돼요 등 확장 스펙.

## 9. 미검증(F) 항목 목록

1. 실제 DB의 `variant.weight` 반영값(0/null 여부) — 시드 입력에는 14개 상품 전부 상품 수준 weight가 있지만 DB 반영값은 추가 DB 조회를 수행하지 않아 미확인.
2. Medusa용 공식/커뮤니티 리뷰 플러그인의 존재와 v2 호환성.
3. 대상 Postgres에 pgvector·pg_bigm 설치 가능 여부.
4. AI Hub 속성기반 감정분석 데이터(71603)의 이용조건·다운로드 요건·저장/AI 활용 권리(로그인 후 확인 필요).
5. Amazon Reviews 2023의 저장·가공·AI 분석·재배포 허용 범위(라이선스 비명시) — 외부 코퍼스 공통 미해결 권리.
6. Amazon Creators API의 가입·사용·저장 제한 조건(PA-API 5.0은 deprecation 리다이렉트 확인됨).
7. 스토어 API에서 `metadata` 필터 지원 여부, `/store/search` 등 API 재검증(03 세션 샌드박스에서 로컬 주소 접속 제한).
8. 검색 품질 관련 미측정 항목: trgm 부분매칭 기여도, 조사 변형·오탈자 커버율, 키워드 검색의 의미 쿼리 커버 범위.
9. 외부 데이터와 내부 상품 간 ID 매핑 규약 — 현재 매핑 없음, 도입 시 설계 필요.

## 10. 증거 부록

- 이번 세션 실행: read-only DB 프로브(`probe-catalog-db.cjs`, BEGIN READ ONLY → ROLLBACK, 출력은 위 각 절에 인용). 커밋되지 않은 세션 스크립트.
- 기존 증거: `.local/bootstrap/shopping-brain-readonly-result.json`(extensions, textConfigurations, search plan, products.total=18/korean=14, reviewTables), `.local/bootstrap/korean-db-counts.json`(14/27/1/1/1), `.local/bootstrap/korean-search-result.json`("기계식"→2건, KRW 가격 필드), `.local/bootstrap/korean-catalog-result.json`(7개 체크 통과), `.local/bootstrap/commerce-integration-result.json`(22/22), `.local/bootstrap/serial-e2e-report.json`(**51/51 통과, --workers 1 직렬 실행**), `.local/bootstrap/final-e2e-report.json`(병렬 --workers 2 실행에서 48/51, 3건 실패 — 통과 근거로 쓰지 않음).
- 코드: `apps/backend/src/search/product.ts:44-61`, `apps/backend/src/search/helpers/pricing.ts`, `apps/backend/src/scripts/seed-korean-catalog-data.ts`(상품 정의 L69-444, weight L60/L85-443, 상품 수준 weight 전달 L487, metadata 주입 L506 부근), `apps/backend/src/scripts/seed-korean-catalog.ts`(실행 스크립트, 298줄).
- 외부 공식 소스: §5 표의 URL(AI Hub 데이터셋 페이지 71603, Amazon Reviews 2023 페이지·HF 데이터셋, 네이버 개발자센터 공지 article/32530, PA-API deprecation 공지).
