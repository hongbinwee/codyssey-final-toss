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
| 2 Commerce & Catalog | 01, 03 | PASS: Catalog/한국 설정/소유권 통합, 전용DB seed·재실행/API14상품27Variant/KRW·할인·재고, Commerce22/22(skip0)·주문DB고객/통화 대조. 배송type 수정 후 정식 Backend/Admin build PASS |
| 3 Storefront UI | 02 | PASS: 기존 화면 한국어·KRW·Light/Dark/System·반응형. 18개 화면 검사·실제 구매·로그인 복귀·주문 조회 통과 |
| 4 E2E QA | 04 | PASS(단일 QA Worker): d244c3d에서 전체51/51, 실패0·건너뜀0·flaky0, 108.6초 exit0. 세 UI 주문 DB 대조 PASS |
| 5 Integration & Review | SOL, 05 | PASS(로컬 단일 Worker 범위): Worker 이력 통합·Next/Medusa/Admin build·Ponytail/주문 인증 검토·최종 E2E·비밀정보 검사 |
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
- 01 권한·타입 수정·검증 스크립트 Commit을 순차 통합한982963b에서 Commerce 실제 실행 결과22 PASS/0 FAIL/0 SKIP/0 NOT_RUN(exit0). 일반배송3,000원, 상품89,000원·주문합계92,000원, 재고 초과HTTP400, 본인 주문200/목록포함·타인404/목록격리·비로그인401을 확인했다. 같은 KRW Order를 전용 PostgreSQL에서 고객·통화 대조 PASS. 증거 `.local/bootstrap/commerce-integration-result.json`.
- 후속 정식 Backend build는 새 배송 type 재사용 입력이 string/object 혼합으로 TS2322를 내어 FAIL(exit1). 기존 Graph 타입 오류는 해소됐으며, 01이 공식 type_id 필드로 최소 수정 중이다. Gate2 실제 커머스 검증과 Gate5 빌드 미통과를 구분한다.
- 작업 중인 02 UI를 메인8000과 분리한 localhost8001에서 읽기 검증했다. 실제 Light/Dark/System 컨트롤·reload유지·OS 테마양방향 반영·한국어문서·홈/상품 가로넘침·브라우저pageerror 검사7개 PASS. 390px Hero 문장 잘림과 KRW가격없는 기존상품 노출은 별도 시각 검증에서 발견하여02수정 요청했다. 스크린샷과 `.local/bootstrap/ui-draft-result.json`에 보존한다.
- UI draft에서 실제 고객로그인→옵션선택→Cart추가완료→배송입력→일반배송→System 모의결제→주문확인 브라우저 흐름 PASS, pageerror없음. 같은 KRW주문의 DB 고객연결 대조 PASS. `.local/bootstrap/ui-draft-cart-result.json`·`ui-draft-db-result.json`에 보존했다. 작업 중 draft 증거이므로 Gate3/4 최종통합 완료로 대체하지 않는다.
- 05 UI독립리뷰에서 로그인필수checkout가드 누락·checkout고정흰배경·localStorage읽기실패예외를 발견하여02에전달했다. 실제Header안정된다크CSS는정상으로 확인했다.
- 01 Worktree에 작성된 배송 `type_id`/`type` 최소 수정과 동일한 내용을 main에 통합해 정식 `medusa build` 재검증 PASS(exit0): Backend9.92초·Admin29.71초, lint0 errors/28 KRW금액경고. Worker파일은 수정하지 않았으며 후속 Commit과 동일성 대조·이력 정리 예정.
- 최소 배송 수정 후 현재 `seed-korea` 재실행 exit0. 설치된 공식 upsert-shipping-options 단계에서 type_id가 기존 type 행 재사용에 반영됨을 확인했다. 기존 한국 설정은 추가 생성하지 않았다.
- 한국어 검색 `기계식`의 기존 `/store/search` HTTP200·2개 hit를 확인했다. hit.document의 KRW min/max/original 가격이89,000/94,000원 및129,000/135,000원으로 실제 포함됐다. `.local/bootstrap/korean-search-result.json`에 보존했다.

위 기록은 각 당시의 실행 결과이며 이후 수정 결과는 아래 최신 통합 기록을 기준으로 한다. Gate 0~2 완료 상태를 유지한다.

## 최신 통합 기록

- 사용자에 의한 02 모델 전환 후 기존 Worker 응답 정체 차단이 해소돼 현재 Goal을 재개했다. 새 프로젝트·채팅·태스크는 생성하지 않았다. 진행 중 UI 태스크를 중복 지시하지 않고 완료 후 실제 결함만 보완했다.
- Worker 최종 이력을 main에 보존했다: 01 `7c67b9a`, 03 `3b2cf97`, 02 `2303708`·`9132e81`·`af08c40`·`1342e8c`·`b8f1d9d`·`734c64f`, 04 `18713b5`·`5efc0a1`·`f30fb15`·`9a8a103`·`7ba6a9e`·`d9adc9b`·`8ced6b6`. 각 Worktree 역할과 기존 Medusa 구조를 유지했다.
- 초기 Next fetch 캐시는 Europe만 갖고 있어 한국 경로가404였다. 생성 캐시를 로컬 백업하고 재시작해 해소했다. DB·소스·원본 상품을 삭제하지 않았다.
- KRW 검색 필드의 DB 인덱스 계획이 이전 EUR/USD 상태였다. 공식 `medusa db:migrate:search --execute-safe-search`로 product_v1→product_v2를 추가하고, 재기동 시18문서 자동 sync·활성화를 확인했다. 실제 KRW 상품14개/가격 범위4개 검색 HTTP200 PASS.
- InstantSearch Configure 숫자 필터와 기존 useRange 충돌은 어댑터 요청 경계에서 가격 존재 조건을 추가하는 최소 변경으로 해결했다. 선택한 가격 하한·상한을 유지한다.
- 주문 액션은 현재 고객 인증을 `no-store`로 조회하고 Cart 허용 필드 `customer.id`와 비교한다. 비로그인·만료 세션·타인·없는 Cart·Cart 없음의 완료 호출0, 본인1인 검사6/6 PASS. 새 모델·주문 API를 만들지 않았다.
- 가입 후 무쿼리 Checkout 진입에서 주소 폼이 닫히던 문제를 기존 Cart 상태별 단계 판정으로 수정했다. 미구현 CMS·고객센터 링크는 지원 범위 안내로 바꿨다.
- UI 주문3건(라이트·다크·모바일)의 같은 order ID를 전용 PostgreSQL `order`·`order_summary`에서 대조해 고객 ID·통화·번호·총액 저장 PASS. 상품9,900원+배송3,000원=12,900원.
- Light/Dark 화면360·768·1440px의 홈·목록·상세18검사에서 가로 넘침/pageerror 없음. Pretendard 실제 로드와 프로젝트 테마 저장 키 접근 실패 복구 PASS.
- 초기 병렬 실행의 React418 복구 오류1회는 같은 홈5회 및 재기동 직후1회 재검사에서 발생하지 않았고, 후속 전체 실행에서도 없었다. 오류 무시 패턴은 추가하지 않았다.
- 최신 Next 정식 build는 TypeScript 검사 포함 exit0. Backend/Admin build exit0, Medusa lint0 errors/28 KRW 정수 가격 휴리스틱 warnings. 원본 Next lint 생략 설정을 lint 통과로 보고하지 않는다.
- 05의 토스3days Ponytail/인증 검토는 회수했으며, 다른 프로젝트 경로를 대상으로 한 최근 응답은 이번 검증에서 제외했다.
- 공개 저장소 검사: 추적317파일·미푸시이력221blob에서 실제 비밀값/금지파일0건. 최종 문서 변경 후 Push 직전 다시 확인한다. GitHub CLI의 다른 활성 계정은 쓰지 않고 저장소별 GCM hongbinwee 인증을 사용한다.
- 최종 검증 소스는 `d244c3dfd7335d4da06dc50bb46df99d1b9670f2`. `playwright test --workers 1` 전체51/51 PASS(108.6초, exit0), 세 프로젝트가 실제 UI 주문·새 세션 조회·고객별 격리를 모두 통과했다. 삭제 처리 중 수량/삭제 잠금과 성공 후 라우터 동기화를 추가했고 모바일 Cart 반복3/3 PASS.
- 통과 실행에서 생성된 주문: desktop `order_01M4W6R25KDF9YMA4M1WRTWE22`, desktop-dark `order_01M4W6S05CMBK3DETRZ0BD3E7W`, mobile `order_01M4W6T8J3ZH3CHH8Y6G0S1XWP`. 모두 같은 주문의 DB 고객·KRW·번호·총액12,900원 대조 PASS. 고객 이메일·주소·인증값은 공개 기록에서 제외한다.
- 병렬 QA 2 Workers는48/51로 실패했다. 삭제 및 상세 이동의 RSC 요청 종료 지연이 남고 원인은 확정되지 않았다. 기본 QA는 실제 통과한1 Worker로 실행하며, 동시 접속 안정성은 검증 완료로 선언하지 않는다. 운영 검증 후속 항목으로 보존한다.

실행 증거는 비공개 `.local/bootstrap`와 gitignore된 Playwright 결과 폴더에 보관한다. 환경 파일·키·고객 개인정보·세션·trace는 Commit하지 않는다. 실행 방법과 기존 Medusa API 목록은 [LOCAL_SETUP.md](LOCAL_SETUP.md), 테스트 계약은 [E2E.md](E2E.md)에 기록했다. 실제 PG·배송·이메일·CS·취소/반품/교환·AI·외부 상품 API·외부 배포는 후속 범위다. 운영용 Redis/event bus/locking 설정과 원본 SDK의 전체 Storage 차단 대응도 후속 범위다.
