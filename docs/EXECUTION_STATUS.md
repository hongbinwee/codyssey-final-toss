# 토스 3days 실행 상태

최상위 기준은 저장소 바깥 PROJECT_MASTER_PLAN.md다. Gate 완료는 실제 실행 증거와 Commit으로 기록한다.

## 기준점

- upstream: medusajs/dtc-starter, 원본 SHA f677db438f27294fc50e4c7c6612e71ff38eeff5 (Medusa 2.21.2 / Next.js 15.5.24).
- origin: hongbinwee/codyssey-final-toss. 기존 원격 브랜치 없음 확인. MIT 라이선스와 공식 이력 유지.
- Node 24.15.0, 프로젝트 실행 pnpm 10.11.1. 참고자료는 저장소 밖 유지.

## Gate

| Gate | 담당 | 상태 / 완료 증거 |
|---|---|---|
| 0 Repository & Bootstrap | SOL, 05 | PASS: Clone·hongbinwee Push dry-run·remote·pnpm10.11.1 설치·DB SELECT1·공식 migration. Backend health200, Store product4개 API200, Storefront /dk 및 /dk/store 브라우저 렌더, Admin emailpass200·/app/orders 대시보드/Products 링크 확인 |
| 1 Design & Parallel Preparation | SOL, 02 | PASS: DESIGN_SYSTEM.md·기능 인벤토리·파일 소유권, Worker Worktree4개·기능 branch·구체 작업 지시. 모든 Worker 응답/작업 시작 확인 |
| 2 Commerce & Catalog | 01, 03 | Catalog b051d34·한국 설정8c39396 통합. 전용DB seed·재실행 PASS, API14상품27Variant/KRW·할인·재고 PASS. 소유권 통합·KRW 주문/DB 대조 진행 |
| 3 Storefront UI | 02 | 디자인 MD 기준으로 기존 화면·한국어·테마 작업 진행 |
| 4 E2E QA | 04 | 최소 테스트 의존성 제공·브라우저 설치·테스트 작성 진행 |
| 5 Integration & Review | SOL, 05 | 대기 |
| 6 Commerce Frame Freeze | SOL | 대기 |

## Medusa 기능 인벤토리

아래는 코드 존재 확인이다. 정상 동작 PASS는 실행 후 기록한다.

| 기능 | 분류 | 재사용 경로 / 작업 |
|---|---|---|
| Product / Variant / Inventory | A+B | 기존 Medusa core 및 src/scripts/seed-demo-products.ts 패턴, 한국 데모 데이터 설정 |
| Region / KRW / Shipping | B | src/migration-scripts/initial-data-seed.ts의 core-flows·service-zone·manual_manual; 추가 한국 설정 seed |
| Cart / totals | A | storefront src/lib/data/cart.ts의 createLineItem·updateLineItem·deleteLineItem·shipping method |
| Checkout / Payment / Order | A+B | 기존 initiatePaymentSession·cart.complete, pp_system_default 및 payment-button 재사용 |
| Customer / Orders | A | src/lib/data/customer.ts·orders.ts 및 기존 account/order 화면. 소유권 테스트 필요 |
| 상품 검색 | A | 기존 store 검색 컴포넌트·Backend search를 먼저 검증 |
| 한국어 / 테마 / 디자인 | C | 기존 storefront 컴포넌트·Tailwind class darkMode·money helper 변경 |
| 브라우저 E2E | D (검증만) | 최소 Playwright 설정 추가. 커머스 기능 신규 구현 없음 |

## 파일 소유권

- SOL: root package.json·lockfile·Git·env·문서 상태/통합. 공통 설정 변경은 사전 협의.
- 01: backend medusa-config.ts 및 src/scripts/seed-korea.ts·verify-commerce.ts. Catalog seed 수정 금지.
- 02: apps/storefront/src 전체·tailwind.config.js·docs/DESIGN_SYSTEM.md. API 계약 유지; backend·QA 수정 금지.
- 03: backend src/scripts/seed-korean-catalog.ts 및 데이터 파일, storefront public/demo-products 자체 이미지. infra seed·UI 수정 금지.
- 04: e2e/·playwright.config.ts·테스트 문서. 앱 코드 변경은 담당 Worker에 요청. package/lock 변경은 SOL 조율.
- 05: 저장소 밖 .local/infra 전용 DB·인프라. 이후 독립 리뷰.

Seed 실행 순서: 기본 migration/공식 초기 seed → 한국 infra seed(01) → 한국 catalog seed(03). 실제 DB에 동시에 seed/migration 실행하지 않는다.

## 검증 계획

Gate 0: migration, DB SELECT 1, /health·Admin·Storefront HTTP, Store products 요청. Gate 2: KRW region/배송/재고, 공식 Cart·payment·Order API 및 DB 주문 확인, 고객별 접근 제한. Gate 3/4: 한국어·0자리 KRW·모바일/데스크톱·세 테마·실제 구매 흐름. Gate 5/6: build·실행 테스트·diff 리뷰·secret/참고자료 제외·origin/hongbinwee 확인 후 Push.

## Bootstrap 실행 증거

2026-10-14 KST: 원본 f677db4, 디자인 기준38c524c, QA 의존성d161fff. 프로젝트 전용 PostgreSQL17.11 / toss3days / localhost55432, 공식 migration exit0. 로컬 비공개 .local/bootstrap에 migration/browser 결과와 서버 PID·로그·스크린샷 보관. Backend9000, Storefront8000. 개발용 fake redis/local event bus/in-memory locking은 기본 로컬 설정이며 운영 배포는 현재 범위 밖.

## 원본 기반 구매 흐름 및 통합 전 검증

- 기존 Store API로 고객 등록·로그인, Cart 수량 변경과 합계·삭제, 배송 선택, pp_system_default 결제, 실제 Order 생성, 본인 주문 상세·목록 조회를 실행했다. 원본 EUR 기준이며 최종 KRW/P0 완료 증거로 대체하지 않는다.
- 같은 Order ID를 PostgreSQL의 `order` 테이블에서 조회하여 customer_id·currency_code를 대조했다. 주문 ID와 실행 결과는 공개 저장소 밖 `.local/bootstrap/original-commerce-result.json`에 기록했다.
- 주문 상세 권한 재현: 본인·비로그인·별도 합성 고객 모두 같은 주문의 `/store/orders/:id`에 HTTP200을 반환했다. 비로그인/다른 고객 차단 FAIL이며 Worker 01 소유권 middleware 통합 후 반드시 재검증한다. 재현 증거는 `.local/bootstrap/original-ownership-result.json`에 기록했다.
- Backend build exit0. 원본 기반 Backend `eslint src medusa-config.ts` exit0, Storefront `tsc --noEmit --incremental false` exit0. `/health`와 `/dk` HTTP200 재확인.
- 공식 Next.js 설정의 `ignoreBuildErrors`를 제거했다. 메인 Storefront production build에서 실제 `Checking validity of types` 수행 후 exit0을 확인했다. 원본 UI Worktree production build도 exit0이며 한국어 UI 변경 후 다시 검증한다. 빌드 중 개발 서버와 같은 출력 경로가 겹치지 않도록 프로젝트의 검증된 Next 프로세스만 잠시 정지 후 재실행했다.
- Worker 03 데이터 단위 테스트는 검증했으나 seed의 실제 Medusa DTO 오류를 발견하여 수정을 요청했다. QA의 테스트 수집 성공은 실제 E2E PASS로 기록하지 않는다.
- 05 독립 읽기 리뷰 회수: Catalog 가격 목록의 `name`·`type`이 설치된 CreatePriceListWorkflowInputDTO에 없음을 대조했다. 한국 재고 위치·판매 채널의 임의 fallback도 제거해야 한다. QA는 pp_system_default만 선택하고, 전용 로컬 실행 대상을 확인하며, 필수 fixture 누락과 실제 테마 컨트롤 동작을 검증해야 한다. 기존 재고를 주문 전 상태로 자동 초기화하지 않으며 소진된 테스트 재고는 명시적으로 관리한다.
- 현재 01~04는 앱에서 실행 중으로 표시되나 최근 도구 실행 및 파일 변경에 진전이 없다. 실제 한도 오류 여부는 미확인이며 모델을 자동 전환하지 않았다.
- 05 리뷰 후속 메시지가 자동 승인 검토에서 전송 승인 불명확 사유로 한 번 차단됐다. 사용자 직접 지시 및 마스터 §8.5/§23 STEP8 원본을 재확인해 권한 근거를 제시한 후 01~05 후속 전송이 승인됐다. 05는 주문 권한 독립 리뷰를 시작했다.
- 05 주문 권한 독립 리뷰 완료: 정확한 GET `/store/orders/:id`에 authenticate 및 customer_id/actor_id 검사를 선행하는 공식 방식 확인. 본인 주문 확인·계정 상세는 기존 인증 헤더를 재사용하며, 게스트 주문 확인은 404가 되므로 로그인 필수 체크아웃과 함께 적용한다. transfer 경로·다른 메서드까지 matcher를 확장하지 않는다. 실제 수정 및 권한 PASS는 Worker 01 통합 후 확인한다.
- Catalog 17파일(14 자체 SVG 포함) diff 검토 및 통합 후 Backend 전체 tsc exit0, Jest7/7 PASS, Medusa lint0 errors/27 KRW 금액 경고를 확인했다. 해당 경고는 major-unit 정수 입력을 휴리스틱으로 지적하며 규칙을 비활성화하지 않았다. 실제 금액은 KRW API/주문 검증 시 대조한다.
- 기존 구매 UI baseline 브라우저 test 1건 실행 결과 FAIL: 가입 후 상품 담기 클릭 직후 이동한 Cart가 비어 checkout-button 대기90초 timeout. 비동기 담기 완료를 확인하지 않는 테스트 흐름을 04에게 전달했다. 추적·스크린샷은 공개 저장소 밖 Worker test-results에 보존했다. 최종 KRW/P0 검사와 구분한다.
- 01/02/04의 도구 실행 및 파일 변경이 다시 관찰됐다. 샌드박스의 pnpm 의존성 링크 읽기 문제로 발생한 export 타입 오류와 실제 소스 오류를 분리해 SOL의 권한 허용 타입 검사 결과를 전달했다. 설치나 import 구조를 우회 변경하지 않는다.
- 전용 localhost55432/toss3days 대상 확인 후 `seed-korea` → `seed-korean-catalog` 순차 exit0. 각각 재실행도 exit0이며 기존 설정·상품·재고·세일 목록을 추가 생성하지 않았다. Store API에서14상품·27 KRW Variant, 품절0·한정2/3/3, 실제549,000→479,000 할인, 한국어 상품명·pp_system_default를 검증했다. 증거 `.local/bootstrap/korean-catalog-result.json`.
- 05 Catalog 통합 독립 리뷰에서 추가 확정 결함·과잉 구현은 없다고 보고했다. 기본 판매 채널·한국 창고 누락 fail-fast, DTO, 재고보존 정책과 자체 SVG를 확인했다.
- 실제 한국 Store API 구매 및 PostgreSQL 대조 PASS: 합성 고객 등록·재로그인, 품목 수량/합계·삭제, 배송·System 결제, 실제 KRW 주문, 본인 주문 목록/상세, 같은 주문의 DB customer_id/currency_code 확인. 증거 `.local/bootstrap/korean-commerce-result.json`. 비로그인·타 고객 차단 및 브라우저 전체 PASS는 별도 남아 있다.
- 기본 국가 변수를 kr로 바꾼 후 실제 루트 HTTP307 `/kr` 확인.
- 한국 설정 통합 후 정식 Medusa build는 FAIL(exit1): 생성 Graph 타입 갱신 후 seed-korea.ts의 currency_code 좁히기·RegionDTO/StockLocationDTO 대입·undefined 가드 오류가 발견됐다. Admin frontend build는 통과했지만 Backend 완료로 인정하지 않는다. 01에 최소 타입 수정 follow-up Commit을 요청했다.

로컬 초기 실행 안내는 `LOCAL_SETUP.md`에 기록했다. Gate 2~6은 아직 완료하지 않았다.
