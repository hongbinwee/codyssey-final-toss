# E2E — Playwright 최소 검증 스위트

Medusa 기존 구매 흐름을 실제 브라우저로 검증한다. 커머스 기능을 새로 만들지 않고, Storefront UI·Store API·주문 소유권이 기대대로 동작하는지만 확인한다.

## 실행

```powershell
# backend(:9000)와 storefront(:8000)가 실행 중이어야 한다
pnpm run test:e2e                 # 전체 (desktop / desktop-dark / mobile)
pnpm run test:e2e -- --list       # 수집된 테스트 목록만 출력
pnpm run test:e2e -- --project=desktop e2e/checkout.spec.ts
```

- packageManager는 pnpm 10.11.1. `test:e2e` 스크립트·`@playwright/test@1.61.1`은 root package.json 소유(SOL 추가 완료). 추가 npm 의존성 없음 — Node fetch만 사용.
- 브라우저: Playwright 1.61.1 Chromium. 공용 캐시 `토스 3days/.local/browser-cache`를 config가 상위 디렉터리 탐색으로 자동 선택(worktree·main checkout 모두 동작). `PLAYWRIGHT_BROWSERS_PATH` 환경변수로 덮어쓰기 가능.

## 환경 변수

| 변수 | 기본값 | 용도 |
| --- | --- | --- |
| E2E_BASE_URL | http://localhost:8000 | storefront (localhost/127.0.0.1만 허용) |
| E2E_BACKEND_URL | apps/storefront/.env(.local)의 NEXT_PUBLIC_MEDUSA_BACKEND_URL → http://localhost:9000 | Medusa backend (localhost만 허용) |
| E2E_PUBLISHABLE_KEY | apps/storefront/.env(.local)의 NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY | Store API 인증 |
| E2E_COUNTRY_CODE | kr | 국가 코드 경로 |
| E2E_CUSTOMER_PASSWORD | 없음 — 미설정 시 실행마다 랜덤 생성 | 테스트 계정 비밀번호 |
| PLAYWRIGHT_BROWSERS_PATH | 프로젝트 공용 캐시 자동 탐색 | Chromium 위치 |

- `.env`는 worktree에 복사되지 않으므로 메인 checkout(`토스 3days/commerce/apps/storefront`)의 .env / .env.local까지 탐색한다. 비밀값은 출력·커밋하지 않는다.
- publishable key가 비어 있으면 API 단언이 명시적 오류로 실패한다.
- globalSetup은 backend /health·storefront 접속과 **localhost 전용 대상**을 검증한다 — 원격 서버를 가리키면 즉시 실패한다.

## 구조

```text
playwright.config.ts     # testDir ./e2e, 3개 project(desktop 1440x900 / desktop-dark / mobile 390x844)
e2e/
  global-setup.ts        # localhost 전용 + backend /health + storefront 사전 확인
  utils/
    env.ts               # env 로딩(비밀값 출력 금지)
    api.ts               # 최소 Store API 클라이언트·리전/카탈로그 탐색·주문 픽스처
    helpers.ts           # 콘솔 오류 수집·테스트 데이터·금액 파싱
  catalog.spec.ts        # 홈/목록/검색/상세/옵션별 실가격/할인가/품절
  cart.spec.ts           # 담기·수량·합계·삭제·재고 초과(API)
  checkout.spec.ts       # 회원가입→주소→배송→pp_system_default 결제→order.id 대조→주문 목록/상세 (serial)
  isolation.spec.ts      # 고객B API 401/403/404 + 목록 격리 + UI 404 (serial)
  ui.spec.ts             # 뷰포트 overflow·html lang ko·실제 테마 컨트롤·KRW 0자리·콘솔 오류
  commerce-readiness.spec.ts  # 반품 권한 negative + 리뷰·평점 읽기(계약 대기). 독립 env(9002/8002) 전용
  helpers/readiness.ts   # REVIEW_CONTRACT 계약 블록 + 리뷰 조회·fixture·반품 헬퍼
```

## commerce-readiness.spec.ts (Shopping Brain 준비 단계)

- **실행 환경**: 독립 실험 env(backend 9002 / storefront 8002)에서만 실행한다. 공유 prod 9000/8000에는 write 테스트를 실행하지 않는다. 실행 설정은 기존 `E2E_BASE_URL`/`E2E_BACKEND_URL` env를 그대로 사용하며 playwright.config는 변경하지 않는다(SOL 소유).
- **반품 권한**: 설치 코어 `@medusajs/medusa@2.21.2`의 `POST /store/returns`는 의도적 비인증이다. 01의 프로젝트 middleware 보호를 검증한다. 확정 상태는 익명 401 / 타인 주문 404 / `receive_now=true` 400. `return_shipping.option_id`는 코어 validator 필수 필드이므로 `receive_now` 대조 실험은 `E2E_RETURN_SHIPPING_OPTION_ID`가 제공된 env에서만 유효하다 — 미제공 시 대조 불가를 첨부물로 보고하고 통과로 위장하지 않는다.
- **리뷰·평점**: SOL 확정 계약(01 공식 Module) — `GET /store/products/:id/reviews?sort=newest|rating_desc|rating_asc&offset=&limit=(max50)&variant_id=`, `GET /store/product-review-stats?product_ids=`(batch, 유효 상품 기본 count0·avg null), `POST /admin/product-reviews/import`(Admin, unique(source,external_review_id)·atomic·idempotent). 공개 목록은 approved+displayable 고정이며 status 필터는 400. 합성 fixture는 QA 전용 상품(`E2E_FIXTURE_PRODUCT_A`/`B`)에만 `E2E_ADMIN_TOKEN`으로 주입하고 main toss3days-* 상품은 실제 리뷰 0을 유지한다(0건은 average=null·count=0·"후기 없음"). `E2E_FIXTURE_VARIANT_A1`/`B1`이 있으면 정확 variant 귀속·미소속 거부도 검증한다. 필요 env: `E2E_ADMIN_TOKEN`, `E2E_FIXTURE_PRODUCT_A`, `E2E_FIXTURE_PRODUCT_B`, `E2E_FIXTURE_VARIANT_A1`(선택), `E2E_FIXTURE_VARIANT_B1`(선택), `E2E_RETURN_SHIPPING_OPTION_ID`(선택).
- **회귀 분리**: 신규 변경의 회귀는 기존 51/51 기록과 별도 결과로 보고한다. 병렬 48/51 3건 실패는 원인 미확정의 기존 이슈로 추적한다.

### 2026-10-14 통합 검증

독립 `toss3days_review_spike_20261014`, Backend9002·Storefront8002에서 실행한다. 이번 신규51건은 기존Commerce51건과 다른 테스트다. 전체최종범위는 기존Commerce51 + 리뷰·반품51 + 스펙/비교9 + 리뷰실패복구/원본표시3 =114건, QA worker1개. 최종 결과는 EXECUTION_STATUS.md에 기록한다.

- 리뷰fixture는 프로젝트별 qa-fixture-a/b 상품에21개 공개리뷰와비공개리뷰를관리자import로주입한다. 원본URL은 https://example.invalid/qa-fixture. 실제고객리뷰가아니며 UI에테스트표시.
- 평균은소수점2자리계약과대조하고카드/상세1자리표시도확인. status쿼리400,ASIΝ/rights/개인정보키비공개,Product/Variant귀속·동률정렬·전페이지·재import·mixedbatch원자성확인.
- 설치Medusa core bodyvalidator는customreturnauth보다먼저실행될수있다. 유효한요청shape로익명401/타인404를확인한다. receive_now는400+정책message를확인하며 없는배송옵션에의한400과구분한다. 실제반품완료/환불은범위밖.
- 상품/옵션스펙·가격비교·unknown·검색카드·모바일가로넘침,IPS→VA 및 v_id deep link확인.
- review-states.spec.ts는브라우저응답intercept로503→재시도·외부원본구매표시·출처link를검증한다. DB에가짜외부리뷰를주입하지않는다.
- 옵션가격회귀fixture는옵션2개이상+판매가능variant의서로다른가격을명시해상품조회순서에의존하지않는다.

확정결과JSON/log는공개저장소밖 .local/readiness-spike, screenshots/traces는gitignore된 test-results에보존한다. 환경·auth값을출력/커밋하지않는다. 공유DB에migration/seed를실행하지않는다.

## 검증 범위 매핑 (태스크 G4-QA-PREP)

| 요구 흐름 | 위치 | 방법 |
| --- | --- | --- |
| /kr 홈 → 목록/검색 | catalog.spec.ts | 네비게이션·products-list·store-search-input |
| 상품상세 → variant/가격 | catalog.spec.ts | 가격이 다른 판매 가능 Variant의 전체 옵션을 선택하고 각각 API 가격과 대조 |
| 할인 상품 | catalog.spec.ts | original > calculated 금액 비교 |
| Cart add/update/remove/합계 | cart.spec.ts | 담기 후 `cartItemCount` 폴링→product-select-button·cart-subtotal data-value |
| 재고 초과·품절 | cart.spec.ts, catalog.spec.ts | Store API 거부 단언 + add 버튼 disabled |
| 고객A register/login | checkout.spec.ts | register-page 폼 → account-page/customer-email |
| 주소/배송/mock payment | checkout.spec.ts | step=address→delivery→payment→review, **pp_system_default만 허용**(radio 없으면 실패, cart.payment_sessions로 provider 재확인) |
| 실제 order ID | checkout.spec.ts | confirmed URL의 order.id를 API로 재조회, 번호·고객 ID·KRW·총액을 최소 JSON attachment로 기록 |
| 고객 order list/detail | checkout.spec.ts | 새 컨텍스트에 프로젝트 viewport·테마·모바일 설정을 적용하고 재로그인, 같은 주문 번호와 실제 상세 합계를 API total과 대조 |
| 고객B 타인 상세 denied·목록 격리 | isolation.spec.ts | A 귀속 선검증(목록 포함·customer_id 본인) 후 B API 401/403/404 + UI 404 |
| mobile/desktop, light/dark/system | config projects + ui.spec.ts | 390x844, 1440x900, colorScheme 에뮬레이션 + 실제 theme-select 컨트롤 |
| 한국어/KRW | ui.spec.ts | html lang ko, ₩/원 + 소수점 없음 |
| 오류 콘솔 | helpers.ts 전 스펙 | pageerror + console.error 수집 후 빈 배열 단언 |

## 데이터 발견 규칙 (fail-loud)

- 상품 handle를 상수로 박지 않는다. `GET /store/products?region_id=…&fields=*variants.calculated_price,+variants.inventory_quantity`로 매 실행 탐색한다.
- **한국 리전(kr/KRW) 필수** — 없으면 발견 리전과 함께 실패한다(Europe fallback 없음).
- **toss3days-* 상품 필수** + 시나리오 픽스처(simple·optioned·soldOut·stockLimited·discounted) 중 하나라도 없으면 목록과 함께 실패한다 — skip으로 통과를 위장하지 않는다.
- 주문/고객은 실행마다 고유 이메일(qa-*@example.test)과 새 카트로 격리한다.
- 재고 자동 리셋이 없으므로 실제 주문 생성은 프로젝트별 checkout 1건 + isolation 픽스처 1건으로 제한한다(전체 6건). Cart·품절·재고 초과 검증은 주문을 완료하지 않아 재고를 소모하지 않는다.

## 셀렉터 근거 (실제 코드 기준)

- 장바구니/체크아웃/계정: storefront의 기존 `data-testid` 전수 조사 결과 사용(cart-container, product-row, product-select-button, cart-subtotal[data-value], checkout-button, shipping-*-input, submit-address-button, delivery-option-radio, submit-delivery-option-button, submit-payment-button, submit-order-button, order-complete-container, order-card, order-display-id, order-id, no-orders-container …).
- 결제 선택: payment radio에 testid 없음 — role=radio + 이름 `manual|모의 결제|수동 결제`로 찾고, `/store/carts`의 `payment_collection.payment_sessions[0].provider_id`가 `pp_system_default`인지 API로 재확인한다.
- 테마: 02 storefront-ui의 theme-select 컴포넌트 실제 계약 — `theme-select-button`(aria-label 테마 선택) → `theme-option-light`/`theme-option-dark`/`theme-option-system`, localStorage 키 `3days-theme`. DOM class·localStorage를 테스트가 직접 조작하지 않는다.
- 서버 액션 완료 대기: `add-product-button` 클릭은 async server action이므로 `_medusa_cart_id` 쿠키 + Store API 항목 수 폴링으로 확인 후 이동한다(지연 sleep 금지 — baseline 실패 재현 근거 반영).

## 통합 실행

- 최종 `d244c3d`의 생산 빌드에서 `playwright test --workers 1`51/51 PASS,108.6초,실패0·건너뜀0·flaky0였다. 각 프로젝트의 UI 주문3건을 전용 PostgreSQL의 고객 ID·통화·주문번호·총액과 대조했다. 상세 증거는 `EXECUTION_STATUS.md`에 기록한다.
- 로컬 기본 QA는1 Worker다.2개 병렬 실행은 RSC 요청 종료 지연으로48/51이었으며 원인은 확정되지 않았다. 이 결과를 숨기거나 동시 접속 안정성이 완료됐다고 해석하지 않는다. 재시도·skip·오류 무시를 추가하지 않았다.
- 한국 리전·상품·UI·주문 소유권 middleware 통합 후 51개 테스트가 수집된다. 실제 최종 PASS/FAIL 결과와 검증 Commit은 `EXECUTION_STATUS.md`를 기준으로 한다.
- Backend 9000과 production Storefront 8000을 기동한 후 저장소 루트에서 `pnpm test:e2e`로 실행한다. 공식 검색 스키마 migration 및 재시작 방법은 `LOCAL_SETUP.md`에 있다.
- `/store/orders/:id`는 본인 200, 다른 고객 404, 비로그인 401이다. UI는 다른 고객의 주문 정보를 표시하지 않는다. 예상된 404 콘솔 오류는 정확히 해당 주문 상세 경로에서 온 경우만 허용한다.
- Cart·상품 화면의 skeleton과 실제 카드가 같은 상위 testid를 사용하므로 실제 카드·옵션·가격·활성 버튼을 기다린다. Cart 합계는 Header dropdown 대신 `cart-container` 안의 값을 검사한다.
- `order-diagnostic` 첨부의 UI 주문 ID를 전용 DB의 `order`·`order_summary`와 대조해 고객 ID·통화·번호·실제 총액 저장을 확인한다. 첨부에는 이메일·주소·인증 쿠키·비밀번호를 넣지 않는다.
- `/store/search` 인덱스가 준비되지 않거나 필수 픽스처가 없으면 실패하며, skip으로 통과시키지 않는다.

## 산출물

- test-results/(trace·screenshot·video), playwright-report/ — gitignore 대상. 인증 쿠키·토큰이 들어간 산출물은 커밋·공유하지 않는다.
