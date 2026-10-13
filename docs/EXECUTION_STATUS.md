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
| 2 Commerce & Catalog | 01, 03 | 한국 설정·상품 seed 및 소유권 검사 작업 진행 |
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
