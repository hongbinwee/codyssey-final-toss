# Shopping Brain Readiness & GAP Analysis

분석일: 2026-10-14 · 기준: `main a65dfbff9205c7029a86cd086a39f9bb98469c1a` · Medusa 2.21.2 / Next.js 15.5.24.

## 1. 목표와 판단 기준

사용자의 예산·목적·사용 환경·선호·허용된 대화 맥락을 이해하고, 실제 상품과 검증 가능한 근거로 구매 판단을 돕는 AI 쇼핑 비서가 목표다. 기존 Medusa Commerce Frame을 재사용한다. 이번 산출물은 분석과 다음 개발 순서이며 AI 구현 완료 보고가 아니다.

우선순위는 최신 사용자 GAP Analysis 요청을 따른다. 저장소 밖 `PROJECT_MASTER_PLAN.md`의 재사용·최소 변경 원칙과 Commerce Gate 0~6 완료를 유지한다. 과거 참고자료의 T1~T3 동시 P0, 12개 논리 테이블, 자체 version/취소 상태 머신, 다른 프로젝트의 승인·구현 내역을 현재 계약으로 가져오지 않는다. 최신 요청에서 주문·취소는 P1 후보이고 첫 P0는 탐색·비교·선택 상품 담기다.

세 문서의 역할: 이 문서는 판단·우선순위·API/Agent/RAG 경계의 기준이다. 상세 화면 대조는 [UX_FLOW_GAP_ANALYSIS.md](UX_FLOW_GAP_ANALYSIS.md), 데이터·카테고리 속성·외부 공급 후보는 [DATA_READINESS_ANALYSIS.md](DATA_READINESS_ANALYSIS.md)를 따른다. 기존 실행 증거는 [EXECUTION_STATUS.md](EXECUTION_STATUS.md), API와 실행법은 [LOCAL_SETUP.md](LOCAL_SETUP.md), 기존 테스트는 [E2E.md](E2E.md)에 보존한다.

### 상태 분류

| 분류 | 의미 |
|---|---|
| A | Medusa 기본 지원 + 현재 사용 가능 |
| B | Medusa 기본 지원 + 설정 또는 UI 연결 필요 |
| C | 화면 또는 API 존재, 해당 목적의 실제 데이터 부족 |
| D | Medusa 공식 확장 방식으로 보완 가능; 설치된 공식 완제품이라는 뜻은 아님 |
| E | 목표를 위한 최소 신규 개발 필요 |
| F | 현재 검증되지 않음; 미지원이라는 뜻은 아님 |

조합 표기는 층별 상태를 뜻한다. 예를 들어 상품 API는 A, 비교 스펙은 C, 스펙 검색 투영 확장은 D다. `AI 읽기 가능`은 원천 API를 재사용할 수 있다는 뜻이며, Agent와 Tool Adapter는 아직 없다. `AI 쓰기 가능`은 현재 구현 사실로 표시하지 않는다.

## 2. 확인 범위와 증거

이번에 실행한 것은 Git 상태·코드·참고 문서·대표 이미지 읽기, 화면 열람, 안전한 API 조회, DB `BEGIN READ ONLY`/`ROLLBACK` 분석이다. 코드/설정/의존성/DB/migration/상품·리뷰·주문을 변경하지 않았고 구매 E2E와 빌드를 재실행하지 않았다. 최종 확인 시 Git 변경 범위는 세 분석 문서만이어야 한다.

| 증거 | 확인 내용 | 해석 한계 |
|---|---|---|
| `main a65dfbf`, 분석 시작 `git status --short` 빈 결과 | 현재 통합 코드 기준 | 오래된 Worker Worktree는 현재 구현의 근거로 쓰지 않음 |
| 기존 `.local/bootstrap/final-freeze-result.json` | 최종 검증 소스 `d244c3d`, 단일 QA Worker 51/51·skip0·flaky0, Backend/Admin/Next build exit0 | 이번에 새로 수행한 테스트가 아님; 로컬 단일 Worker 범위 |
| 기존 `.local/bootstrap/final-orders-db-result.json` | UI 주문 3건 DB 대조, 각 KRW 12,900원 | `paid_total=0`, 실제 PG 결제·환불 완료 증거가 아님 |
| 기존 `.local/bootstrap/final-e2e-report.json` | 2 QA Workers 48/51 | 삭제·상세 이동 RSC 종료 지연 원인 미확정; 동시 접속 안정성 미완료 |
| 이번 `.local/bootstrap/shopping-brain-readonly-result.json` | 전체18/한국14상품, `product_v2` KRW 필드·벡터 없음, `pg_trgm`/`unaccent`만, 리뷰 테이블 없음 | 테이블 이름 검사만으로 모든 외부 리뷰 서비스의 부재를 단정하지 않음; 03의 코드/API 대조와 결합 |
| `apps/backend/src/search/product.ts:13,43,125` | 검색 필드·정적 인덱스 투영·미발행 이벤트 TODO | 검색 hit가 실시간 가격/재고/정확한 옵션을 보증하지 않음 |

증거 파일은 저장소 바깥 비공개 `.local/bootstrap`에 있다. 자격증명·고객 개인정보·세션·trace·토스 참고 캡처를 공개 문서에 복사하지 않는다. 소스 링크는 저장소 상대 경로이며 `파일:행` 표기는 기준 SHA의 위치다.

## 3. 핵심 사용자 시나리오와 우선순위

| 시나리오 | 현재 원천 준비 | 추가 조건 / 완료 기준 | 제안 단계 |
|---|---|---|---|
| A 가성비·개발용 모니터 추천 | 상품·가격·옵션·재고 A, 목적은 설명 텍스트 C | 목적/예산을 구조화하고 unknown 스펙을 만족으로 판정하지 않음; 이유마다 상품 근거 | P0, 현재 대화에 명시된 선호부터 |
| B 27인치 QHD·40만원 이하·장시간 리뷰 비교 | 가격 A, 스펙 C, 리뷰 E/F | 스펙 정규화, 단가/배송 포함 예산 구분, 실제 연결된 리뷰·출처; 없으면 리뷰 기준 검증 불가 안내 | P0에서 리뷰 근거 가능성 검증. 신뢰 가능한 데이터 없으면 스펙 MVP와 한계 공개 |
| C 두 번째 추천 모니터 담기 | 기존 Cart A | 직전 추천 결과 ID와 exact variant/옵션/수량, 최신 Medusa 가격·재고·사용자 의도 재확인, 결과 Cart 재조회 | P0 |
| D 지난 주문 배송 조회 | 소유 주문 A, 실제 배송 사건 C/B | 인증·소유권 유지, fulfillment/tracking 허용 필드 확인; 정보 없으면 확인 불가, ETA 창작 금지 | P1 |
| E 발송 전 승인 취소 | Core 취소·환불 경로 B, 고객 실행 경계 D/E | 프로젝트 취소 정책, 캡처/환불 기준, 출고와 경합, 서버 승인/재검증/중복 방지, 안전한 고객용 경계 | P1; P0 선행 조건으로 승격하지 않음 |
| F 전에 추천한 키보드 비교 | 구매 이력 원천 A, 대화 저장/메모리 E | 같은 대화 후보·조건·선택 ID 유지 P0; 허용된 이전 대화 검색·보존기간·삭제 P2 | 세션 맥락 P0, 저장 선호 P1, 장기 기억 P2 |

전 시나리오가 다음 MVP의 필수 구현은 아니다. 별점은 다른 구매자의 요약 신호이며 필수 조건을 보증하지 않는다. 리뷰는 소음·장시간 편안함 같은 사용 경험을 보완하지만 구조 스펙을 대체하지 않는다.

## 4. Commerce·Backend·DB·API 재사용

현재 Store API 경로는 [LOCAL_SETUP.md의 API 표](LOCAL_SETUP.md#재사용한-store-api)와 실제 설치된 `@medusajs/medusa@2.21.2/dist/api`를 함께 확인한다. Core 지원과 현재 UI/데이터 연결을 분리한다. 공식 기능 전체를 신규 API/새 Commerce DB로 복제하지 않는다.

### 4.1 현재 사용할 원천

| 기능 | Core / 현재 데이터·UI·검증 | 원천 API / 코드 근거 | AI 활용과 최소 보완 |
|---|---|---|---|
| Product / Variant / Category | A, 한국14/27·4분류; 원본 EUR 상품4 별도 보존 | `GET /store/products`, categories; `src/scripts/seed-korean-catalog*.ts`, `src/search/product.ts` | ID·SKU·옵션 원천 재사용; 비교 속성은 C, metadata 규격부터 |
| Pricing / KRW / 할인 | A, 지역 가격·세일 실제 Commerce 검증 | `variants.calculated_price`, `src/search/helpers/pricing.ts` | 검색 min/max는 후보 가격; 선택 variant를 region/customer context로 다시 조회. 자체 금액 계산 금지 |
| Inventory | A, 관리 재고·품절·초과 거절 검증 | Store product inventory projection·기존 Cart workflow | 초기 seed 수량을 현재 판매 가능 수량으로 쓰지 않음; 예약·재고 최신 확인은 Core |
| Cart | A, 추가·수량·삭제·합계·로그인 후 transfer 검증 | Store carts/line-items; `storefront/src/lib/data/cart.ts` | 상품 새 모델 불필요. Agent 전용 allowlist/context/명확한 의도 경계 E |
| Customer / Authentication | A, emailpass·등록·로그인 | `/auth/customer/emailpass`, `/store/customers/me`; `customer.ts` | customer_id를 LLM이 선택하지 않도록 인증 context 강제; 이메일 인증/발송은 현재 F/B |
| Checkout / shipping method | A, 주소·일반3,000/무료 배송·KRW totals 검증 | carts 주소·shipping-options/shipping-methods | 사용자 직접 checkout 재사용. 배송비 견적은 Cart context로 산출, 가격 설명에 일률 무료 가정 금지 |
| Payment / Order 생성 | A, System 모의 세션·실제 주문 생성 | payment-collections/payment-sessions, carts/:id/complete | 실제 PG·capture는 B/F. Agent에 자동 결제/주문 완료 권한 주지 않음 |
| 소유 주문 목록·상세 | A, 본인200·타인404·익명401 검증 | `/store/orders`, `/store/orders/:id`; `api/middlewares/order-ownership.ts`, `lib/data/orders.ts` | 원천 재사용. AI 조회는 필요한 필드만, 현재 상태 조회는 UI force-cache를 그대로 쓰지 않음 |
| Shipping / Fulfillment | 배송 옵션 A, 주문 fulfillment/실제 tracking B/C | Core fulfillment module/workflows, order fulfillment relations | 배송 방법 선택 성공 ≠ 출고/택배 추적. 정책·저장 사건·provider/UI 연결 필요 |

Storefront 주문 액션은 `cart.ts:412,432`에서 고객/Cart를 `no-store`로 확인하고 `customer.id` 소유권을 검증한다. 직접 Store API의 게스트 complete는 기존 Medusa 기능으로 남아 있다. 따라서 브라우저 로그인 가드만으로 모든 AI 쓰기 API가 고객 인증·소유권을 강제한다고 추정하면 안 된다. 장바구니 ID는 접근 능력을 갖는 식별자로 취급하고, Tool에서 원래 세션의 Cart만 선택한다.

### 4.2 구매 후 지원과 추가 경계

| 기능 | 현재 Core/API / 실제 연결 | 분류·최소 보완 / 권한 |
|---|---|---|
| 주문·결제·배송 상태 | Order의 서로 다른 상태·Payment collection·Fulfillment 원천, UI 한국어 상태 맵 | A(주문 조회)/B·C(후속 상태 데이터). `not_fulfilled`를 실제 출고로 설명하지 않는다 |
| 출고·배송 추적 | Admin 주문 fulfillment/shipment/delivered 경로·배송 label tracking 정보 | B/C/F. 실제 택배 provider·저장된 사건·고객 조회 projection·UI 연결; 현재 실행 전이 미검증 |
| 주문 취소 | `POST /admin/orders/:id/cancel`와 Core `cancelOrderWorkflow` | B + D/E. 고객용 정책/승인/소유권 검증을 앞단에 붙여 기존 workflow 호출; AI에 Admin 권한을 주지 않는다 |
| 결제 capture·환불 | Admin payments capture/refund, Core payment workflows | B/F. authorization 취소와 capture 후 refund를 구분, 실제 캡처액·이미 환불액·상태 검증; 현3주문 `paid_total=0`으로 환불완료 입증 불가 |
| 반품 | 설치 `POST /store/returns` → `createAndCompleteReturnOrderWorkflow`; Admin 수령·관리 | B(기본 Core 존재), D(권한 제한), F(우리 데이터에서 실행 성공 여부). UI 없음이 API 비활성을 뜻하지 않음 |
| 교환 | Admin exchange/return/order change workflows | B/F. 고객 UI·정책·상품/재고/가격 차이·승인 연결 없음; 첫 AI P0에 전체운영을 추가하지 않음 |
| CS 문의 | UI 도움말 안내만, 프로젝트 티켓/상담 데이터 없음 | E 또는 외부 연결 F. 첫 P1은 허용된 주문/정책 설명부터; 채팅 UI가 상담센터 운영을 뜻하지 않음 |

**우선 권한 공백:** 설치 `dist/api/store/returns/route.js:6`은 의도적 비인증이며 middleware는 body/query 검증만 한다. 프로젝트 `src/api/middlewares.ts`는 주문 GET만 보호한다. [공식 반품 접근 제한 안내](https://docs.medusajs.com/resources/commerce-modules/order/secure-return-creation)는 valid publishable key와 order ID를 접근 근거로 쓰며, 인증만 추가해도 소유권은 별도 검사해야 한다고 명시한다. `receive_now`도 고객이 즉시 수령 상태를 요청할 수 있어 프로젝트 운영 정책에 맞는 제한이 필요하다. 이번에는 POST를 실행하지 않았으므로 실제 exploit/반품 생성 성공은 F다. 소스와 공식 동작을 근거로 확인한 권한 설계 공백은 P0 보호 항목이며, 반품 서비스 전체 구축은 후속이다.

상세 상품의 배송·교환·환불 약속뿐 아니라 `storefront/src/app/[countryCode]/(main)/account/@dashboard/orders/page.tsx:28`에도 반품·교환 요청 가능 문구가 남아 있다. 도움말의 미제공 안내와 모두 정합성을 맞춰야 한다. API의 존재를 고객 운영 정책 완료와 혼동하지 않는다.

취소 정책의 차이도 중요하다. 설치 Core `order/workflows/cancel-order.js:36~54`는 이미 취소/완료된 주문을 거절하고, 남아 있는 fulfillment가 있으면 그 fulfillment들이 먼저 취소돼야 한다. 따라서 '발송 전'이라는 한 조건만으로 Core cancel 성공을 보장하지 않는다. 같은 workflow는 uncaptured payment 취소와 captured payment 환불을 처리하므로 프로젝트가 별도 환불 엔진을 복제할 필요가 없다. 정책 조회/승인/최신상태 재검증을 추가하고 실제 Core 결과를 설명한다. 과거 제안의 REQUESTED→시뮬레이터→REFUNDED 다단계 상태는 현재 계약이 아니며, 접수 대기가 필요한지부터 결정한다.

**기존 Tool 설계에서 재사용할 원칙과 계약 차이:** ID·권한·현재 가격재고·근거·변경 결과 확인 원칙은 유지한다. 그러나 설계의 12개 논리 테이블을 새 Commerce DB로 만들지 않는다. 실제 Order model에는 `version: model.number().default(1)`이 존재한다(`@medusajs/order/dist/models/order.js:34`). 이것이 설계의 Cart/Product/Variant expected-version, 승인 토큰, 별도 action_requests 원자 기록과 같은 계약이라는 증거는 없다. Core version/workflow transaction·locking을 먼저 대조해 최소 충돌·중복 대응을 정한다. 단순 transactionId가 모든 Cart/승인 재시도 안전성을 보증한다고도 가정하지 않는다. 현재 fulfillment는 shipped_at/delivered_at 및 labels가 원천이며, 참고 설계의 events[]/ETA가 자동 제공되는 것은 아니다. Store order의 `fulfillments.labels` nested projection이 그대로 허용되는지는 F로 남긴다.

## 5. 핵심 GAP 목록

표의 `신규`는 향후 코드가 필요한지이며 이번에 작성했다는 뜻은 아니다. D/E가 같이 있으면 공식 확장 지점에 최소 프로젝트 로직을 추가하는 경우다.

| ID | 기능·데이터 / 시나리오 | 현재 상태·Medusa 지원 / 근거 | 부족한 부분 | 최소 해결 방향 / 신규 여부 | 우선순위 / 선행 조건 |
|---|---|---|---|---|---|
| SB-01 | 구조 스펙·variant 유효 속성 / A,B | C/D: 설명·옵션만, `seed-korean-catalog-data.ts:89,503` | 수치·단위·enum·unknown·상품/옵션별 차이 불명 | Product/Variant metadata의 작은 규격, 사람이 검수한 필드·출처. 검색 투영만 확장 / 데이터+최소 코드 | P0 / 대표 모니터 범위·필수 조건 |
| SB-02 | 상품-linked 리뷰·별점 / B | E/D/F: 현 리뷰 테이블·모델·조회 경로 미확인/미구현, 03 상세 | 실제 리뷰 원문·출처·시간·ID·평점 없음 | 허용된 읽기 데이터부터 확보, synthetic 구분, 읽기 조회·인덱스 최소 추가. 리뷰 작성 전체 UI 불필요 / 신규 최소 읽기 | P0 가능성 검증, 고도화 P1 / 권리·exact 상품 매핑 |
| SB-03 | 조건 기반 검색 / A,B | A+C/D: `/store/search` 가격·카테고리·옵션, 구조 specs 필드 없음 | 한국어 질의·스펙 필터·조건 충족 판정 | 기존 search baseline + typed 조건/스펙 projection; 벡터는 평가 후 / 기존 확장 | P0 / SB-01·정답 질의셋 |
| SB-04 | 검색 가격·재고 최신성 / A,B,C | C: 검색은 정적문서; `product.ts:125~129` 이벤트 TODO | 기간 세일·일부 가격/채널 변경 동기화 누락 가능, inventory 없음 | 추천·실행 전 Core region/customer별 variant 재조회, 갱신/삭제 전략 결정 / 최소 Adapter 코드 | P0 / Medusa DTO·observed_at |
| SB-05 | 자연어 의도·추천·비교 근거 / A,B | E: Agent/RAG 없음 | 조건 추출·질문·reason/evidence·근거부족·실패 분기 | 작은 Orchestration+Tool Adapter, 결과를 실제 ID/출처에 묶기 / 신규 | P0 / SB-01~04·LLM 선택 |
| SB-06 | 대화 결과 선택·Cart 쓰기 경계 / C,F | Cart A, AI 승인/맥락 E | '두 번째' result-set과 exact variant 연결, 세션·의도·중복 처리 | 후보 ID 보존, ambiguous 질문, 최신 재검증, Core Cart만 호출·재조회 / 신규 Adapter·최소 UI | P0 / SB-05·권한 계약 |
| SB-07 | 채팅·카드·비교·근거·결과 UI / A~F | E: Commerce 화면은 A, AI 화면 없음 | 진입·비교표·출처·pending/error/result/context | 기존 카드·링크·Dialog·테마 재사용, 필요한 AI 연결 컴포넌트 / 신규 최소 | P0 / typed 답변·Tool 계약, UX 문서 |
| SB-08 | 배송/교환/반품 약속 불일치 / D,E | C/B: 상세 `product-tabs:88~110`은 3~5일/교환/환불 약속, order help:9은 미제공 | 실제 배송·반품 운영 없음, 추천/CS가 잘못 인용할 위험 | 지원 범위 문구 정합성부터. 정책 확정 전 사실로 쓰지 않음 / 기존 문구 최소 수정 제안 | P0 문구, 기능 P1 / 정책·실제 활성 기능 |
| SB-09 | 소유 주문의 배송 이해 / D | 주문 A, 배송 사건 B/C/F | tracking/출고/ETA 데이터·허용 필드 투영·오류 처리 | 기존 orders/fulfillment 조회, 없는 정보는 NO_INFORMATION; 자체 tracking DB부터 만들지 않음 / 조회 Adapter·UI | P1 / 인증·field 계약·배송 데이터 |
| SB-10 | 승인 취소·환불 / E | Core B, 고객 경계 D/E/F; 기존 주문 paid_total0 | 정책·customer safe endpoint·승인·capture/void/refund·출고경합·중복 | 공식 cancel/refund workflow 호출 앞에 최소 정책/권한/승인 검증. Admin credential은 LLM/브라우저에 제공하지 않음 / 최소 신규 | P1 / SB-09·모의 결제 정책 |
| SB-11 | 저장 선호·검색 로그·장기 메모리 / A,F | E/F: 현 채팅 원천 없음 | consent/tenant/보존/삭제/정정·상품 식별 | P0 현재 대화만, P1 opt-in 선호, P2 허용 이력. 구매 원천은 기존 주문 / 신규 선택적 | P1/P2 / 데이터 정책·평가 효과 |
| SB-12 | AI 평가·동시성 / 전체 | E/F: Commerce 단일51/51, 병렬48/51 미해결 | 검색 정답·근거·조건·Tool 안전성/성능 평가 없음 | 기존 E2E fixtures 재사용 + AI 질의/negative/근거 평가. 운영 동시성 원인 규명 / QA 최소 추가 | P0 안전성·평가 / 버전 고정 데이터, 운영 전 동시성 |
| SB-13 | 미연결 구매후 API 권한 / D,E | B+D/F: Core `POST /store/returns` 존재·기본 비인증, 현재 GET 소유권 가드 적용안됨 | 주문 ID만으로 요청·receive_now 기본허용, AI 안전경계 밖의 직접호출 | 공식 middleware 확장으로 customer인증+body.order_id 소유권+정책/receive_now 제한. Core route 복제 불필요 / 최소보호코드 | P0 보호, 반품기능 P1/P2 / §4.2·정책·익명/타인negative |

## 6. 데이터 준비도 판단

현재 14상품/27variants는 구매 시나리오와 작은 조건 검색의 기능 검증에 유용하다. 알고리즘의 일반적 우열, 실제 사용자 리뷰 기반 추천, 장기 개인화를 입증할 규모나 다양성은 아니다. 자세한 필드·분포·품질·확보 후보는 [DATA_READINESS_ANALYSIS.md](DATA_READINESS_ANALYSIS.md)를 따른다.

최소 상품 규격 제안: 기존 `product_id`, `variant_id`, `category_id`, SKU, 제목, 설명, 상품/옵션별 검수된 `specs`(수치+단위/enum/unknown), `schema_version`, 근거 문서/출처/확인일. 브랜드를 만들거나 설명에서 추출한 값을 자동 확정하지 않는다. Product.weight 같은 물류 무게를 상품 실사용 무게로 잘못 쓰지 않는다.

최소 리뷰 규격 제안: `review_id`, 정확한 `product_id`, 확인 가능한 경우 `variant_id`, 원문/제목, `rating`와 scale, 작성일(unknown 허용), 언어, `source_kind`(실제/합성), `source_ref`, 수집·확인일, 이용조건 참조, 실제 구매 여부(근거 없으면 unknown). 평균 별점·수는 검증된 집계로 제공하고 무리뷰를 0점으로 표시하지 않는다. 옵션별 리뷰를 상품 전체 평가처럼 섞지 않는다.

외부 리뷰의 ASIN/외부 ID가 현재 합성 `T3D-*` SKU에 매핑된다는 근거는 없다. 별도 외부 코퍼스의 검색 성능 평가는 가능하지만 현재 구매 가능한 상품 추천·담기와 동일한 평가로 합치지 않는다. 첫 리뷰 실험은 현재 데모 상품에 의도적으로 연결한 명시적 합성 fixtures 또는 권리·상품 동일성이 확인된 실제 소량 데이터 중 사용자가 선택한다. 합성 결과를 실제 고객의 경험으로 설명하면 실패다.

공식 후보 대조에서 Amazon Reviews 2023(ASIN/parent_asin)과 AI Hub 속성감정 데이터(71603)는 코퍼스 후보지만 현재 데모 상품 매핑·저장/AI 활용/재배포 권리는 F다. 기존 네이버 쇼핑 검색 API는 [개발자센터 종료 공지](https://developers.naver.com/notice/article/32530)에서 2026-07-31 종료와 API HUB 이관 제외를 명시하므로 가용 후보에서 제외했다. PA-API5 문서는 [Amazon Creators API deprecation 안내](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation)로 연결되며, 새 가입·데이터 권리·가용성은 미확정이다. 상세 수치·언어·갱신·품질 한계는 데이터 문서를 따른다. 공개 다운로드 가능성과 서비스 적재 권리를 동일시하지 않는다.

## 7. RAG 검색 후보와 인터페이스

### 7.1 현재 검색의 정확한 상태

설치된 `@medusajs/search-postgres@2.21.2` README: native는 GIN+`ts_rank`+`pg_trgm`, vector query는 거절한다. Lakebase engine의 BM25/ANN/RRF는 **설치 package README와 구현 코드에 대한 확인**이며, 아래 공식 비교 페이지가 그 세부를 모두 설명한다고 해석하지 않는다. 현재 로컬 PostgreSQL에는 적용되지 않는다. `dist/services/postgres-search.js:24~25` 기본값은 `language=english`, `engine=native`. 이번 DB에서도 `medusa_search_english`, `pg_trgm`, `unaccent`를 확인했고 `vector`/Lakebase 확장과 검색 벡터 필드는 없다. [공식 Provider 비교](https://docs.medusajs.com/cloud/search/postgres)와 [Search Module](https://docs.medusajs.com/resources/infrastructure-modules/search)은 현재 native Provider의 full-text/필터/벡터 미지원 경계에 대한 보조 근거다. 문서와 설치 버전 세부가 다르면 설치 코드를 우선하고 갱신 여부는 F로 남긴다.

현재 title/description/option_values는 검색 가능하고 category/labels/option_values/가격은 filter/facet에 쓸 수 있다. metadata 전체가 자동 검색되는 것은 아니다. 상품 범위는 `configureStoreSearch({allowed_indexes:{product:true}})`와 published/sales-channel 필터로 제한한다. 설치 Store search handler는 hit를 graph로 hydrate하지 않으므로 variant/재고를 요청 필드만 늘려 얻는 계약이 아니다. 후보 product ID로 기존 products API를 다시 호출한다. 현재 인덱스의 category는 이름 배열이며 AI 계약의 category_id와 연결표가 필요하다.

| 방식 | 공식/OSS 근거 | 한국어·조건 검색 준비 | 현재 통합·인프라 비용 | 지연·규모·평가 판단 |
|---|---|---|---|---|
| 기존 Medusa Search | 위 설치 Provider·공식 문서 | 한글 기본 검색 증거 있음. 형태소/띄어쓰기/동의어 품질은 F; 숫자 필터는 구조 필드 필요 | 가장 적은 변경, 현재 PostgreSQL 그대로 | baseline으로 먼저 측정. DB검색시간과 hydrate/API시간을 분리; 지금14상품으로 품질 일반화 불가 |
| BM25 keyword | [Elasticsearch BM25](https://www.elastic.co/docs/reference/elasticsearch/index-settings/similarity) | [Nori](https://www.elastic.co/docs/reference/elasticsearch/plugins/analysis-nori)는 한국어 형태소 분석 지원; 분석기·정규화 선택과 평가 필요 | 별도 engine/provider 또는 작은 실험용 라이브러리. 서버·인덱스 운영은 현재 없는 비용; 공식 확장 가능성 검토 | 가중치/문서길이·용어 정확 검색 평가. 현재 FTS를 BM25라고 부르지 않음. 엔진 선택에 따른 실측 전 ms 추정 금지 |
| Vector | [pgvector](https://github.com/pgvector/pgvector) | 한국어 포함 모델·숫자/부정/스펙 hard filter·검수 코퍼스 필요 | 같은 PG 확장 후보도 가능하지만 현 native Provider에 설치만으로 연결되지 않음; 임베딩·재색인·Adapter 필요 | 모델 encode+DB검색+APIhydrate 지연/비용 측정. 14개면 exact search 실험 가능; ANN 필수 아님 |
| Hybrid | [pgvector hybrid](https://github.com/pgvector/pgvector#hybrid-search) | 같은 product/review 필터·동일 ID·조건검증을 양쪽에 적용 | lexical+vector 두 결과와 일관된 provenance 계약 필요; 별도 DB 의무 아님 | 동시/순차 조회 및 병합 지연을 실제 측정. 더 정확하다는 선결론 없음 |
| RRF | [공식 RRF 설명](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reciprocal-rank-fusion) | 검색기가 아니라 순위 융합. 정확 ID로 중복 제거, 리스트 범위·top-k·rank constant 실험 | 이미 두 검색 결과가 있을 때 작은 결합 로직; 별도 서비스 의무 없음 | 후보 recall 누락을 복구할 수 없음. raw 점수를 서로 더하는 방식과 구분, 한국어 효과 F |
| Reranking | [Sentence Transformers retrieve/rerank](https://sbert.net/examples/sentence_transformer/applications/retrieve_rerank/README.html) | 한국어 검증 모델·질의/근거 정답·필수조건 필터 후 후보만 | 모델/API추론·CPU/GPU/메모리·권리 및 라이선스 검토 추가 | 후보별 추론이 지연/비용 증가 가능. baseline 오류 분석에서 필요성이 입증될 때 도입; 현재14상품에 자동 필수화하지 않음 |

모든 비용은 상대적인 변경·운영 비용이며 가격 견적이 아니다. 검색/추천 품질, P50/P95, 처리량은 이번에 측정하지 않았다. 같은 한국어 정답셋·snapshot으로 기존 검색→BM25/Vector→Hybrid/RRF→필요한 reranker를 비교한 뒤 선택한다. 리뷰가 없으면 리뷰 retriever 평가도 아직 불가능하다.

### 7.2 논리적 분리와 최소 반환 계약

상품 검색과 리뷰 검색은 대상·평가·권한을 논리적으로 나눈다. 서버/DB/벡터 저장소/카테고리별 RAG를 물리적으로 분리할지는 후속 측정으로 결정한다. 리뷰 검색에 product_id/category_id/variant scope/source_kind/language/time 필터를 전달하면 카테고리마다 별도 RAG를 만들 필요가 없다.

제안 인터페이스(아직 미구현):

- 상품 검색 입력: 질의·정규화된 조건·category_id·가격 상한·region/sales-channel context·take/skip. 인증 주체는 서버 context다. 필수/선호 조건을 구분한다.
- 상품 검색 출력: product_id와 일치 variant 후보, 충족/미확인 조건, 근거 field/source, ranking metadata, 반환/전체 수, observed_at. 품절/가격 불명·무결과를 별도 상태로 표현한다.
- 리뷰 검색 입력: 후보 product IDs, variant scope, 경험 질의, source_kind/언어/기간, top-k. 출력: review_id/product_id/variant_id·원문 구간/출처·시각·rating·매칭/반환 수. 일부 리뷰로 전체의 합의를 선언하지 않는다.
- 비교/추천 출력: result_set_id와 안정적인 item ID, 조건/상품·리뷰 근거, 선택 가능한 variant, 현재 가격·재고 관찰시각, 부족한 데이터. 같은 순위의 화면 텍스트만으로 쓰기 대상을 정하지 않는다.
- 가격·재고·배송비는 검색/LLM/embedding에 보존한 값을 결제 원천으로 쓰지 않고, 기존 Medusa 계산을 재조회한다. variant 수준 조건과 min price가 같은 옵션에서 성립하는지 확인한다.

문서 분할은 상품 스펙+설명, 리뷰 원문 단위부터 시작한다. 긴 리뷰 분할 시 review ID/상품·옵션/offset/원문 연결을 유지한다. 가격처럼 자주 바뀌는 필드는 임베딩 근거와 거래 검증을 구분한다. 갱신/삭제/출처 폐기 때 인덱스에서도 제거할 전략이 필요하다.

## 8. Agent·언어·권한 최소 방향

예상 흐름은 질문 → 목적/조건 확인 → 상품 검색 → 해당 상품 리뷰 검색 → 비교 → Medusa 현재 variant 가격·재고·가능한 배송비 조회 → 근거 답변 → 명확한 사용자 선택/승인 → 허용된 Cart Tool → Cart 재조회다. LangGraph를 선택하더라도 전체 Commerce를 그래프로 재작성하지 않는다.

P0에는 새 AI Orchestration/Tool Adapter와 답변 연결 UI가 필요하다. 상품·Cart·Order 모델과 기존 API는 재사용한다. 검색 결과/리뷰는 비신뢰 콘텐츠로 취급하고 그 안의 문장을 Tool 실행 지시로 쓰지 않는다. LLM이 user_id·가격·재고·취소 가능 여부·승인 Boolean을 임의 생성해 서버 검사를 통과할 수 없어야 한다. 읽기 Tool에서 주소·이메일 등 필요 없는 개인정보를 줄인다.

| 후보 | 장점 | 추가 부담 / 결정 조건 | 제안 |
|---|---|---|---|
| TypeScript Agent/RAG | Next/Medusa와 언어·DTO·SDK 재사용, 단일 추가 실행 환경; LangChainJS/LangGraphJS 공식 지원 | LLM/embedding/model 한국어 품질·라이선스, timeout/tracing/evaluation 필요 | 우선 평가 후보, 서비스 생성/최종 확정 아님 |
| TS Agent + Python RAG | Python 전용 모델 실험·학습·Sentence Transformers reranker 등이 필요한 경우 실익 | 별도 Python deps/runtime·서비스/계약/배포·중복 DTO·네트워크지연·운영 관측 | TS 경로 대비 필요한 모델/라이브러리·측정 이점이 입증될 때만 |

05가 대조한 [LangChain JS](https://docs.langchain.com/oss/javascript/langchain/overview), [LangGraph JS persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence), [JS PGVectorStore](https://docs.langchain.com/oss/javascript/integrations/vectorstores/pgvector)는 TS 경로가 공식 지원됨을 보여준다. 현재 프로젝트에 설치·연동됐다는 뜻은 아니다. 체크포인트가 필요한 중단/재개를 택할 때 영속 저장·보존/삭제 정책이 추가된다. [Medusa 사용자 정의 routes](https://docs.medusajs.com/learn/fundamentals/api-routes)와 [protected routes](https://docs.medusajs.com/learn/fundamentals/api-routes/protected-routes)의 공식 확장 경계를 우선하며, 고객별 대화/실행 라우트는 `authenticate("customer", ["session", "bearer"])`를 명시하고 서버 auth_context에서 주체를 얻는다. `/store/ai` 같은 이름만으로 자동 보호된다고 가정하지 않는다. 서버 내 모듈과 별도 TS 서비스의 물리 배치도 아직 결정하지 않는다.

별도 Python 서비스·외부 벡터DB·새 Provider 계층을 관성으로 먼저 만들지 않는다. 상품/리뷰 RAG를 같은 PG에 두면 Commerce와 CPU/메모리/IO를 공유하므로 운영 부하를 측정해야 한다. 개발용 로컬 event bus/locking/cache를 운영용 준비 완료로 취급하지 않는다. LLM/embedding 제공자 선택 시 학습 활용·로그·보존·지역·삭제 조건은 해당 공식 정책을 확인한다. 아직 공급자를 지정하지 않았다.

Cart는 low-risk지만 명확한 사용자 요청, 대상/옵션/수량 검증이 필요하다. 추천만으로 쓰기 호출 금지. 전송 유실 시 현재 Cart와 operation 결과를 확인하고 무조건 재추가하지 않는다. '두 번째'가 모호하거나 가격/옵션이 달라졌다면 사용자 재확인. P1 취소는 서버가 인증·소유권·유효한 승인·최신 정책/상태·중복방지를 확인한 후 공식 workflow를 호출한다. 승인 UI만 추가하고 신뢰 경계를 생략하지 않는다.

## 9. 검증 격차와 향후 수용 기준

기존 51건은 17개 Commerce 테스트 × desktop/light·desktop/dark·mobile이며 AI 시나리오 51개가 아니다. 기존 tests/config·DB대조는 보존하고, 새로운 AI 단계에서 필요한 부분만 확장한다. 최종 개발 통합 때 핵심 E2E/빌드는 재검증하되 이번 분석에서는 실행하지 않는다.

| 평가 대상 | 제안 수용 기준(미실행) |
|---|---|
| 필수 조건 | 검수 스펙 기준 불일치/unknown 상품을 충족으로 추천0; 배송 포함 여부 명시 |
| 검색 | query별 relevant/excluded IDs 및 이유, Recall@k/nDCG@k/MRR(해당 질의에 적합한 것 선택), 무결과/오탈자/동의어/부정/단위 검사 |
| 근거 | 주장별 상품 field 또는 review source ID, exact상품/옵션 연결, 근거 없는 리뷰/별점/구매후기 주장0; 합성 명시 |
| Cart 실행 | 명시 의도 없이 변경0, 다른 후보/옵션/수량 담기0, 재고·가격변동·유실/중복 후 상태 정확히 설명 |
| 권한 | 익명/타고객 주문정보 노출0·변경0; 데이터에 삽입된 실행지시 무시 |
| 주문/취소 | 출고/환불데이터 없으면 unknown, 미승인/만료/상태변경 시 취소0; 접수·취소·환불 구분 |
| Context | 직전 result set·product/variant 식별 보존, 계정 간 대화 격리, 이전대화 접근 허용 범위 |
| UX·운영 | loading/empty/error/partial/outcome_unknown·재시도·근거열기 확인; 검색/LLM/API/총처리 P50/P95 및 비용 분리 측정 |

초기 소량 정답 질의셋은 모델 선택용 탐색 결과이며 일반 품질 증명이 아니다. 데이터/규칙/모델 version을 기록하고 development/test 질의를 분리한다. 정확 임계치·지연 목표·질의 수는 사용자의 MVP 평가 기준과 실측을 통해 확정한다. 근거 없는 기존51/51의 확대 적용을 금지한다.

04는 첫 회귀/탐색용 30~50개 질의·Recall@5/Precision@3·top3정답포함80% 등을 제안했다. 이는 확정 수용 기준이 아니다. `metadata.scenario`는 테스트 분류이며 사용자 적합성 정답으로 자동 쓰지 않는다. 스펙 검수 후 relevant/excluded ID와 근거를 사람이 라벨링한다. 병렬 실패를 커머스 로직이 배제된 RSC 원인으로 단정하지 않고 관측된 정착지연·원인미확정을 유지한다. DB3건의 `paid_total=0`을 전체 주문 또는 System provider의 capture 영구불가로 확대하지 않는다. 계약/negative는 모의 Tool로, 실제 제공자 end-to-end는 별도 작은 평가로 나눠 비용과 의존 장애를 통제한다.

## 10. 최소 개발 순서와 의사결정

| 순서 | 선행 결과 / 담당 제안 | 다음 단계 진입 기준 |
|---|---|---|
| 0 사용자 검토 | 이 세 분석 문서, 첫 범위는 A/B/C와 세션 F 제안 | 리뷰 없는 스펙 MVP vs 명시적 합성/실제 리뷰 실험, 대표 모니터 범위 승인 |
| 1 원천 경계·데이터 정규화 | 01: 미연결 returns 권한/receive_now·문구 정합성 최소 보호; 03+01: Product/Variant metadata 스펙·단위·unknown·출처, exact ID 연결 | 익명/타인 보호 negative; 검수된 조건 정답표; 리뷰 확보 권리/합성 표기 |
| 2 검색 baseline·계약 | 01+03+04: 기존 Medusa search/상품 조회 Adapter, 한국어 질의셋 | 필수조건·variant-price동시충족·출처·freshness 평가. 성능 미달 원인이 있을 때 검색 후보 확대 |
| 3 읽기 추천·비교 | SOL+05+02: TS 우선 후보 평가, 의도/근거 답변·최소 UI·세션맥락 | A/B/F 정답/근거부족/무리뷰/실패·오류 분기 확인, 언어/모델 선택 근거 |
| 4 사용자 선택 Cart | 01+02+04: allowlist Tool/권한/의도/옵션·가격재검증, 기존 Cart 호출 | C exactID/variant/qty·중복/유실/가격재고변동 검증; core Commerce 회귀 |
| 5 P0 통합 | SOL+04+05 | 변경 후 핵심 E2E·build·AI평가. 동시접속은 기존48/51 원인과별도검증 필요 |
| 6 P1 주문·취소 | 01+02+04: 실제 상태투영, 정책/승인/캡처·void/refund·출고경합 | 고객 safe workflow 경계·negative검사 후 도입; 실제 PG·택배는 별도 의사결정 |
| 7 P2 개인화 확대 | 선호 opt-in 효과와 데이터 권리·충분성 평가 | 장기기억/구매이력/외부상품/이미지 필요성·보존/삭제·운영 비용 검증 |

결정이 남은 항목: 첫 카테고리와 필수 조건, 리뷰 코퍼스·권리·진짜/합성 범위, 예산의 배송비 포함 여부, Chat 보존/선호 동의·삭제, Cart 쓰기의 확인 방식/중복 결과 기록 범위, 언어·LLM/embedding·search/reranker 평가 기준, 데이터 갱신 주기, latency/cost 목표, P1 모의 취소/환불 상태 정책과 관리자 권한 경계, returns의 게스트/소유권/receive_now 정책, 운영 동시성 검증 조건. 기술을 확정하거나 서비스 생성 전 다음 단계에서 결정한다.

## 11. 분석 완료 질문 10개에 대한 답

| 질문 | 결론 / 근거 위치 |
|---|---|
| 1 현재 구현 기능은? | 한국 상품·옵션·KRW·재고·검색·Cart·주소배송·System 모의 주문·고객별 조회·테마/반응형. §2, §4, 기존 실행 문서 |
| 2 토스 흐름 대비 주요 차이는? | 리뷰/평점/스펙비교·AI 연결·상태별 주문이후 액션/CS 없음. 세부 관찰은 UX 문서; 쿠폰/포인트/대규모프로모션 복제는 첫AI목표 밖 |
| 3 추천 상품 데이터 충분한가? | 구매·기능실험용 충분, 구조조건/리뷰기반·검색성능 일반화 부족. §6와 데이터 문서 |
| 4 리뷰·별점·스펙은? | 설명/옵션 일부, 정규화 specs 없음; 리뷰/별점 집계 준비 안 됨. 데이터 문서와 SB-01/02 |
| 5 어디서 확보 가능한가? | 현재 demo의 검수 metadata/명시적합성 또는 동일상품 권리확인 데이터. 외부공개 코퍼스/상품API는 데이터 문서 후보; 바로 구매상품 매핑 불가 |
| 6 AI가 API로 무엇을 할 수 있나? | 상품/검색/인증 context의 Cart·소유주문 읽기 재사용. 사용자선택 Cart writes는 신규안전 Adapter 후. Admin 취소/환불 직접 권한 제공 금지. §4,8 |
| 7 구매 후 어디까지 지원인가? | shipping method/Order 원천은 작동. 실tracking·고객취소환불·반품교환CS는 연결·정책·데이터/확장 필요, Core 미지원으로 단정 안 함. §4.2, SB-08~10 |
| 8 RAG 규격/인터페이스는? | product/variant/category ID, typed specs+unknown, exactlinked review source/time/kind, filtered pagination/evidence/freshness 반환. 상품/리뷰 논리분리. §6~7 |
| 9 가장 먼저 보완할 P0는? | 스펙/근거데이터·권리·정답질의, baseline+최신variant조회, 읽기추천/비교UI, 안전Cart. §10 |
| 10 최소화/신규 개발은? | Commerce DB/API/계산/checkout/인증 재사용. 신규는 최소 AI Orchestration·Tool Adapter·AI연결UI·스펙검색투영 및 필요한 리뷰읽기/평가. §5,8,10 |

## 12. Worker 결과 회수 및 최종 확인

| Worker | 회수한 분석 / 검토 반영 |
|---|---|
| 01 Commerce Core | 현재 설치 Store/Admin API·workflow·권한 대조. Core 취소/환불 재사용, returns 권한 공백, tracking nested projection F. Order.version 부재라는 초기 보고는 설치 모델 대조 후 정정 반영 |
| 02 Storefront UI | 현재 홈/목록/상세/기존Cart/로그인 화면을 읽기 확인, 기존 최종 캡처·토스 대표8캡처·코드 대조. 정상 저장 후 SOL 전문 검토 완료. 과거 T3 P0를 최신 요청의 P1로 보정, 참고 빈본문을 미구현 확정으로 해석하지 않도록 정정, Core Cart 재사용과 신규 안전 Adapter를 분리 |
| 03 Catalog & Data | READ ONLY 카탈로그 18/14/27 및 스펙·리뷰·출처·외부후보 분석. 상품 물류 weight/스펙·리뷰 범위·수치필드·metadata 검색 경계·수용 우선순위를 통합 보정 |
| 04 E2E QA | 기존51/51과48/51, DB3주문·paid_total0, A~F시나리오 negative·검색평가 공백. 단일QA 통과와 동시성 원인·실환불을 구분 |
| 05 Infra & Review | TS/Python·공식 routes/PGVectorStore·운영 비용/권한 검토. 지정 DB 결과와 설치 README 직접 대조, 보완된 권한/Order.version/QA 해석에 심각한 잔여누락 없다고 보고 |

재사용 결론: Product/Variant/Category/Pricing/Inventory/Customer/Auth/Cart/Checkout/Order와 취소·환불·반품·교환 Core를 보존한다. 신규는 필요한 데이터 정규화·리뷰 읽기, 작은 AI Orchestration/Tool 경계/화면 연결/평가다. 검색기·언어·서비스 배치·DB 분리는 아직 결정하지 않았다. 이번 결과의 완료 기준은 세 분석 문서와 10개 질문 답변이며 다음 개발은 사용자 검토 뒤다.

최종 검증: 세 문서의 본문·상대 링크·증거 구분·변경 범위·기존 비밀값 미포함을 검사했다. Git HEAD는 `a65dfbf`로 유지하며 기존 추적 파일 변경은 없다. 새 파일은 이 분석 문서3개뿐이다(미커밋). 현재 Backend `/health`·Storefront `/kr` HTTP200을 읽기 확인했다. 이번 Goal에서 Commerce 테스트·빌드·seed·주문 생성·DB 쓰기를 실행하지 않았다. 기존 Commerce Gate 0~6 기록은 유지하고, Shopping Brain 구현 착수는 사용자 검토를 기다린다.
