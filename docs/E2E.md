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
```

## 검증 범위 매핑 (태스크 G4-QA-PREP)

| 요구 흐름 | 위치 | 방법 |
| --- | --- | --- |
| /kr 홈 → 목록/검색 | catalog.spec.ts | 네비게이션·products-list·store-search-input |
| 상품상세 → variant/가격 | catalog.spec.ts | option-button 클릭 후 표시 금액이 variant 실가격 집합에 속하는지 확인 |
| 할인 상품 | catalog.spec.ts | original > calculated 금액 비교 |
| Cart add/update/remove/합계 | cart.spec.ts | 담기 후 `cartItemCount` 폴링→product-select-button·cart-subtotal data-value |
| 재고 초과·품절 | cart.spec.ts, catalog.spec.ts | Store API 거부 단언 + add 버튼 disabled |
| 고객A register/login | checkout.spec.ts | register-page 폼 → account-page/customer-email |
| 주소/배송/mock payment | checkout.spec.ts | step=address→delivery→payment→review, **pp_system_default만 허용**(radio 없으면 실패, cart.payment_sessions로 provider 재확인) |
| 실제 order ID | checkout.spec.ts | /order/{id}/confirmed URL 캡처 → GET /store/orders/{id}와 대조(id·display_id·total) |
| 고객 order list/detail | checkout.spec.ts | **새 browser context(baseURL+ko-KR)에서 재로그인** 후 order-card/display_id ↔ order-id, payment-amount = API order.total 대조 |
| 고객B 타인 상세 denied·목록 격리 | isolation.spec.ts | A 귀속 선검증(목록 포함·customer_id 본인) 후 B API 401/403/404 + UI 404 |
| mobile/desktop, light/dark/system | config projects + ui.spec.ts | 390x844, 1440x900, colorScheme 에뮬레이션 + 실제 theme-select 컨트롤 |
| 한국어/KRW | ui.spec.ts | html lang ko, ₩/원 + 소수점 없음 |
| 오류 콘솔 | helpers.ts 전 스펙 | pageerror + console.error 수집 후 빈 배열 단언 |

## 데이터 발견 규칙 (fail-loud)

- 상품 handle를 상수로 박지 않는다. `GET /store/products?region_id=…&fields=*variants.calculated_price,+variants.inventory_quantity`로 매 실행 탐색한다.
- **한국 리전(kr/KRW) 필수** — 없으면 발견 리전과 함께 실패한다(Europe fallback 없음).
- **toss3days-* 상품 필수** + 시나리오 픽스처(simple·optioned·soldOut·stockLimited·discounted) 중 하나라도 없으면 목록과 함께 실패한다 — skip으로 통과를 위장하지 않는다.
- 주문/고객은 실행마다 고유 이메일(qa-*@example.test)과 새 카트로 격리한다.
- 재고 자동 리셋이 없으므로 실제 주문 생성은 checkout 1건 + isolation 픽스처 1건으로 제한한다. 카트 수준 재고 검증(add/update 거부)은 재고를 소모하지 않아 반복 안전하다.

## 셀렉터 근거 (실제 코드 기준)

- 장바구니/체크아웃/계정: storefront의 기존 `data-testid` 전수 조사 결과 사용(cart-container, product-row, product-select-button, cart-subtotal[data-value], checkout-button, shipping-*-input, submit-address-button, delivery-option-radio, submit-delivery-option-button, submit-payment-button, submit-order-button, order-complete-container, order-card, order-display-id, order-id, no-orders-container …).
- 결제 선택: payment radio에 testid 없음 — role=radio + 이름 `manual|모의 결제|수동 결제`로 찾고, `/store/carts`의 `payment_collection.payment_sessions[0].provider_id`가 `pp_system_default`인지 API로 재확인한다.
- 테마: 02 storefront-ui의 theme-select 컴포넌트 실제 계약 — `theme-select-button`(aria-label 테마 선택) → `theme-option-light`/`theme-option-dark`/`theme-option-system`, localStorage 키 `3days-theme`. DOM class·localStorage를 테스트가 직접 조작하지 않는다.
- 서버 액션 완료 대기: `add-product-button` 클릭은 async server action이므로 `_medusa_cart_id` 쿠키 + Store API 항목 수 폴링으로 확인 후 이동한다(지연 sleep 금지 — baseline 실패 재현 근거 반영).

## 현재 상태 / 미검증

- **NOT_RUN(kr 기준)**: 한국 리전 seed·02 UI 통합 전. `--list` 수집 48 tests(5 files x 3 projects) 통과만 확인됐다. dk/EUR 기준 부분 실행만 mechanics 검증용이며 최종 PASS가 아니다.
- 주문 소유권 격리: `/store/orders/:id`에 ownership middleware 미적용 시 owner/anonymous/B 모두 200 → isolation.spec.ts 실패가 **기대되는 현재 상태**이며, 01 수정 통합 후 PASS 전환 필수.
- order.id 대조: cart.complete은 서버 액션이라 브라우저에서 응답을 가로챌 수 없어 confirmed URL의 order.id를 Store API로 재조회한다.
- DB SELECT 검증: infra 연결 정보 제공 시 SOL/01과 조율 후 추가.
- 검색 스펙은 `/store/search` 인덱스를 전제한다 — 인덱스 미구축이면 실패 = 실제 결함 신호.

## 산출물

- test-results/(trace·screenshot·video), playwright-report/ — gitignore 대상. 인증 쿠키·토큰이 들어간 산출물은 커밋·공유하지 않는다.
