# UX_FLOW_GAP_ANALYSIS — 토스쇼핑 참고자료 대비 현재 Storefront 격차

작성: 02 Storefront UI · 기준: `commerce` main `a65dfbf` · 분석일 2026-10-14

SOL 통합 검토: 우선순위는 최신 GAP Analysis 요청을 따른다. 과거 `CORE_TASK_SCOPE`의 T1~T3 동시 P0를 그대로 적용하지 않는다. 첫 P0는 추천·조건 비교·근거 검증·사용자 선택 Cart·현재 대화 맥락이며, 주문/배송/취소는 P1이다. 전체 리뷰 UI·별점·ETA는 무조건 P0가 아니다. 자세한 Core/권한은 [통합 분석](SHOPPING_BRAIN_GAP_ANALYSIS.md), 스펙·리뷰 원천은 [데이터 분석](DATA_READINESS_ANALYSIS.md)을 따른다.

## 0. 방법·근거·한계

- 대상 코드: `apps/storefront/src`(main a65dfbf). 오래된 `.worktrees` 사본은 사용하지 않았다.
- 실제 화면: 인앱 브라우저로 `http://localhost:8000/kr` 읽기 전용 확인 — 홈, `/store`, 상품 상세(`toss3days-monitor-27-limited`), 장바구니(기존 2개 항목), `/account`(로그인 화면). 담기·수량·주문·로그인 등 쓰기는 실행하지 않았다.
- 추가 시각 근거: `.local/bootstrap/final-{360,768,1440}-{light,dark}-{home,catalog,product}.png`(Gate3 시점 정식 캡처).
- 참고자료: `준비 자료` ① 화면 인벤토리·UI 패턴, ② 캡처 중 대표 8장(home·search·product-detail·reviews·cart·orders·cs)을 직접 확인, ③ SHOPPING_FLOW, ⑤ 화면·인터랙션 명세·CORE_TASK_SCOPE, ⑧ 누락 체크리스트·Fidelity Gap.
- 참고자료 문서 상당수는 구형 프로젝트(codyssey_final 프로토타입) 대상 분석이다. 그 프로젝트의 구현 완료 주장은 현재 구현 증거로 취급하지 않았다.
- 주의: 참고 캡처의 빈 화면(예: `120_v3_price_comparison_empty_body.png` 가격 비교 빈 본문)은 토스 실서비스의 기능 완료 증거가 아니다. SHOPPING_FLOW의 `Not Observed`·`표시만` 판정을 그대로 존중했다.

## 1. 분류 기준

| 분류 | 의미 |
|---|---|
| A | Medusa 기본 지원 + 현재 화면에서 사용 가능(검증됨) |
| B | Medusa 기본 지원이나 설정·UI 연결 필요 |
| C | 화면/API는 있으나 실제 데이터 부족 |
| D | Medusa 공식 확장·모듈로 해결 가능 |
| E | 최소 신규 개발 필요 |
| F | 존재 여부 미검증(이번 Goal의 읽기 범위로 확정 불가) |

## 2. 현재 Storefront 실제 인벤토리(관찰됨)

실제로 존재하는 사용자 흐름(코드 + 라이브 읽기 확인):

- 공통: 상단 Nav(메뉴·로고·검색 drawer·테마 선택·내 쇼핑·장바구니 배지), 모바일 하단 4탭(홈/상품/장바구니/내 쇼핑), Footer(카테고리·Medusa 링크), Light/Dark/System 테마.
- 홈 `/kr`: Hero 카피 + "상품 둘러보기" CTA, 컬렉션 레일(컬렉션 존재 시), "지금 판매 중인 상품" 그리드. 조회 limit와 실제 KRW 가격 필터 후 표시 개수는 구분한다.
- 상품 목록 `/kr/store`: InstantSearch 기반 — 검색창, 정렬(관련도/최신/낮은·높은 가격/가나다·역순), 패싯(옵션 값 그룹·가격 범위·세일 토글·카테고리·라벨), 적용 필터 표시, 페이지네이션, 4열 그리드.
- 검색 진입: Nav 검색 버튼 → 우측 drawer, 250ms 디바운스 실시간 hit 리스트(최대 12), 빈/로딩/에러 상태, hit → 상품 상세 이동.
- 상품 상세 `/kr/products/[handle]`: 이미지 갤러리(썸네일 나열), 상품명·설명, 옵션 버튼 그리드(variant 가격·재고 연동, URL `v_id` 동기화), 모바일 하단 고정 CTA + 옵션 시트, 상품 정보 탭(소재/제조국/유형/무게/크기), 배송·반품 안내 탭, "함께 보면 좋은 상품" 관련 상품, 온보딩 CTA.
- 장바구니 `/kr/cart`: 비로그인 시 로그인 유도, 항목 테이블(이미지·상품명·옵션·수량 select 1~10·단가·합계·삭제), 주문 요약(할인코드 입력·합계), 주문하기 → `/checkout?step={address|delivery|payment}` 자동 단계 판정.
- 체크아웃 `/kr/checkout`: 주소 → 배송 방법 → 결제(pp_system_default 모의 결제) → 검토 단계 아코디언, 주문 완료 `/order/[id]/confirmed`.
- 계정 `/kr/account`: 로그인/회원가입(parallel route), 대시보드(프로필·주소·최근 주문 요약), 주문 목록, 주문 상세(상태·품목·배송·금액 합계·도움말). 상세 template에는 PaymentDetails가 연결되지 않아 주문 완료 화면의 결제수단 상세와 구분한다.
- 주문 이전: `/order/[id]/transfer` accept/decline 플로우 존재.

## 3. 화면·흐름별 격차 분석

### 3.1 상품 탐색

| 기능 | 토스쇼핑 참고 | 현재 Storefront | 분류 | Backend 연관 | AI 연관 | 부족한 점 | 최소 보완 | 우선순위 | 근거 |
|---|---|---|---|---|---|---|---|---|---|
| 홈 구조 | 상단 탭(쇼핑홈/뷰티/OASIS/카테고리/특가), 배너 캐러셀(3/3 표시), 리워드 아이콘 행, "OO님을 위한 추천 상품" + AI/광고 배지 | 텍스트 Hero + CTA, 컬렉션 레일, 상품 그리드 | E(섹션형 홈) | 목록 API로 충분 | 추천 섹션이 AI 추천의 자연스러운 배치 위치 | 개인화 추천·탭 내비·배너 캐러셀 없음 | 홈에 "AI 추천" 섹션 슬롯 추가(기존 ProductPreview 재사용) | P1 | `app/[countryCode]/(main)/page.tsx`, `home/components/hero`, ref `home/01`, 캡처 `final-360-dark-home.png` |
| 카테고리 탐색 | 대분류 탭 + 하위 분류 + 카테고리별 홈 | `/categories/[...category]`·`/collections/[handle]` 페이지는 존재; Footer에 영어 seed 카테고리 잔존(§4-2) | B | Medusa Category/Collection | 카테고리 필터 근거 | 카테고리 랜딩의 정보 구조 단순 | 기존 카테고리 페이지에 하위 목록 연결 수준 | P2 | `app/.../categories`, 라이브 Footer 확인 |
| 검색 진입 | 전체 화면 검색 + 최근 검색어 + 자동완성 목록 | Nav 버튼 → 우측 drawer, 실시간 hit(12) 리스트 | C | Medusa Search(InstantSearch) | AI 검색 Tool의 UI 대응면 | 최근/인기 검색어·자동완성 없음 | 최근 검색어는 로컬 저장 신규(E), 자동완성은 search 응답 재가용(B) | P1 | `layout/components/search/index.tsx`·`drawer.tsx`, ref `search/101~102` |
| 검색 결과 화면 | 전용 결과 페이지 + 패싯 칩 행 + 필터/정렬 bottom sheet + skeleton + 결과 카운트 | drawer 미리보기 → `/store`가 실제 결과·필터 화면(사이드바형) | B | 동일 Search API | AI가 조건 검색 결과를 `/store` 딥링크로 여는 구조 가능 | 칩형 조건 행·sheet UX 없음(기능적 등가는 확보) | `/store`를 결과 화면으로 유지, 필터 파라미터 URL 계약 정리 | P1 | `store/templates/index.tsx`(`routing` 사용), ref `search/103~115` |
| 필터/정렬 | 가격·분류 등 패싯 + 추천순/가격순 + "필터 n개" 상태 유지·초기화 | 정렬 6종, 옵션 패싯(색상/스위치/패널/구성/손 방향 등 실제 값), 가격 범위, 세일 토글, 카테고리/라벨, 적용 필터 칩 | A | InstantSearch facets(이미 동작) | AI 조건→attribute/numeric filter 매핑 가능 | 별점·리뷰 기반 정렬/필터 불가(데이터 부재) | 리뷰 데이터 확보 시 facet 추가 | P0(데이터 의존) | `store-refinements/*`·`attributes.ts`, 캡처 `final-1440-dark-catalog.png` |
| 상품 카드 | 이미지+%특가 배지, 단위가격(100g당), 평점·리뷰 수, 적립 예상, 도착 예정, 카트 담기 아이콘 | 이미지+제목+가격(세일 시 %와 원가)만 | C | 필드 부족은 데이터 문제 | 추천 카드·비교 결과의 표시 단위 | 평점/리뷰/단가/배송 ETA 표시 없음 | 카드 확장은 데이터 확보 후(03 의존) | P0(연동 대상) | `product-preview/index.tsx`·`price.tsx`, ref `search/103` |

### 3.2 상품 상세

| 기능 | 토스쇼핑 참고 | 현재 Storefront | 분류 | Backend 연관 | AI 연관 | 부족한 점 | 최소 보완 | 우선순위 | 근거 |
|---|---|---|---|---|---|---|---|---|---|
| 이미지 | 번호 인디케이터(1/4), 비슷한 상품 스트립, 전체화면 갤러리 | 썸네일 나열 갤러리, 확대 뷰어 없음 | B(기본)/E(뷰어) | 없음(프론트) | 낮음 | 전체화면·스와이프 인디케이터 없음 | 기존 ImageGallery에 인디케이터 수준 | P2 | `products/components/image-gallery`, ref `product-detail/04,071` |
| 상품명·설명 | 제목+규격 요약+원산지 행 | title+description 표시. seed의 `subtitle` 필드는 데이터엔 있으나 화면 미표시 | C | Product subtitle | 스펙 요약의 표시 위치 | subtitle 미표시, 원산지 등 고정 필드 대부분 "-" | subtitle 한 줄 노출(최소) | P1 | `product-info/index.tsx`, seed `seed-korean-catalog-data.ts:90` |
| 옵션 선택 | 바텀 시트 옵션, 옵션별 가격·판매자·리뷰 갱신, 옵션 전체보기 | 인라인 버튼 그리드(데스크톱)/모바일 시트, variant 가격·재고 연동, `v_id` URL 동기화 | A | Store variants API | AI가 `v_id` 링크로 정확한 옵션 지정 가능 | 옵션 전체보기·구매 한도 모달 없음 | 현 구조 유지. 선택 후보와 exact variant 연결 검증 | P0(링크 계약) | `product-actions/index.tsx`·`option-select.tsx`·`mobile-actions.tsx` |
| 가격·할인 | 원가 취소선+할인율+"최대할인가" 드롭다운, 100g당 단가, 가격 비교하기(참고자료상 빈 본문) | % 배지+할인가+원가, "최저" 라벨 | A(표시)/C(확장) | calculated_price | 가격 근거 표시 | 단위가격·할인 내역 펼침 없음 | 할인 상세는 promotion 데이터 의존(F) | P2 | `product-preview/price.tsx`·`product-price`, ref `product-detail/04,092` |
| 배송 정보 | 예정일(날짜+카운트다운), 배송비, 배송정보 시트 | 탭에 정적 문구만(§4-1 불일치) | C/E | shipping_options 조회 API 존재 | 도착 예정·배송비 답변 근거 | 실제 배송비·예정일 계산 없음 | cart 기준 shipping option 금액 표시(B) + ETA는 정책 정의 후 | P1 | `product-tabs/index.tsx` ShippingInfoTab, ref `shipping/093` |
| 상품 스펙 | 상세 정보 탭 + 긴 설명 이미지 | "상품 정보" 탭 = 소재/제조국/유형/무게/크기 6필드(대부분 "-"). 실제 스펙(해상도·주사율·DPI 등)은 description 텍스트에만 존재 | C | Product metadata/속성 | 조건 필터링·비교의 핵심 입력 — 구조화 없으면 AI가 텍스트 파싱에 의존 | 구조화 스펙 없음(03 데이터 영역과 공동 과제) | metadata/option 기반 스펙 표 정의 후 탭 확장 | P0(데이터 의존) | `product-tabs/index.tsx` ProductInfoTab, seed 데이터 |
| 별점·리뷰 | 평점 4.8(1,123) 요약, 인라인 후기, 전체 리뷰 화면, 정렬(추천/최신/별점), 사진 모아보기, 도움됐어요, 판매자·옵션 표기 | 현재 상품 리뷰 모델·API·UI 없음 | E/D | 기존 Product ID와 읽기 리뷰 연결, 공식 확장 활용 여부 검토 | 경험 근거에 유용. 리뷰가 모든 추천의 필수 조건은 아님 | 리뷰 원문/출처·평점 데이터 부족 | P0는 리뷰 근거 가능성 검증과 필요한 인용/원문 표시. 전체 리스트·평점 집계·사진·작성 UI는 후순위 | P0 가능성 검증 / P1 확장 | rg 검색 결과 없음, ref `reviews/19,127~130`, DATA 문서 |
| 관련 상품 | "비슷한 상품" 스트립 | "함께 보면 좋은 상품" 그리드 | A | listProducts(컬렉션 기반) | 추천 후보 fallback으로 재사용 | 추천 근거(왜 비슷한지) 표시 없음 | 유지. AI 추천은 별도 카드 | P2 | `products/components/related-products` |
| 상품 비교 | 가격 비교 화면(본문 빈 상태로 관찰됨) | 없음 | E | Product/Variant 원천 재사용 | 조건 비교 출력의 직접 대응 화면 | 현재 비교 결과 없음. 참고자료의 빈 본문은 구현 여부를 확정하지 못함 | AI 비교 결과용 최소 표 컴포넌트 신규 | P0(AI 출력) | ref `product-detail/120`(빈 본문 주의) |
| 구매 CTA | 찜+장바구니+0원뽑기+구매하기 4분할 | 담기 CTA 1종(모바일 하단 고정). 직접 구매 없음 | B | cart→checkout 경유 | "바로 구매"는 카트+checkout 진입으로 대체 가능 | 찜·즉시구매 없음 | 즉시구매는 카트 담기+checkout 이동 조합 | P2 | `product-actions`, ref `product-detail/04` |

### 3.3 구매 흐름(장바구니→주문)

| 기능 | 토스쇼핑 참고 | 현재 Storefront | 분류 | Backend 연관 | AI 연관 | 부족한 점 | 최소 보완 | 우선순위 | 근거 |
|---|---|---|---|---|---|---|---|---|---|
| 장바구니 항목 | 항목 체크박스, 판매자 그룹, 무료배송 진행바, 개별 품절 표시, 배송 도착 예정 | 테이블(이미지·옵션·수량1~10·단가·합계·삭제) | A(기본)/E(확장) | cart line items | `get_cart`·`update_cart_quantity`·`remove_cart_item` Tool의 화면 대응 | 선택 주문·그룹핑·진행바·ETA 없음 | MVP는 전체 주문 유지, 선택 주문은 별도 결정 | P1 | `cart/components/item`·`templates/items.tsx`, 라이브 `/kr/cart` |
| 삭제·복구 | 삭제 후 "다시 담기" 스낵바 복구 | 삭제 즉시 제거(복구 없음) | E | 재추가 API로 가능 | 삭제 실수 방지·AI 삭제 실행 후 안내 | Undo 없음 | 삭제 전 확인 또는 재담기 안내 | P2 | delete-button, ref `cart/12,16`·SHOPPING_FLOW |
| 장바구니 탭 | 장바구니/최근 본/찜 3탭 | 단일 목록 | E | 최근 본·찜 저장소 없음 | 선호·관심 신호 | 찜·최근 본 없음 | localStorage 최소 구현 또는 후순위 | P2 | 라이브 확인, ref `cart/10` |
| 체크아웃 단계 | 주소 선택/배송 요청/결제수단/쿠폰·포인트/최종 금액 | 주소→배송 방법(일반배송/무료배송)→결제(pp_system_default)→검토 아코디언. 할인코드 필드 존재 | A(핵심)/C(부가) | cart.shipping/payment | AI는 결제 실행 권한 없음(사용자 확인 필수 구조와 일치) | 배송 메모·결제수단 선택·포인트 없음. 할인코드 실동작 미검증(F) | 핵심 흐름 유지. 메모는 metadata 활용 가능 | P0 유지 / 나머지 P2 | `checkout/templates/checkout-form`, components(addresses/shipping/payment/review/discount-code) |
| 주문 완료 | "결제했어요" + 주문 상세 보기 | `/order/[id]/confirmed` 완료 화면 | A | order 조회 | 실행 결과 확인 화면 | — | 유지 | — | `order/templates/order-completed-template.tsx` |
| 내 주문 목록 | 내 쇼핑 대시보드(포인트/쿠폰/찜/최근 본) + 상태 필터 목록 | 계정 대시보드(프로필/주소/최근 주문) + 주문 목록 카드(썸네일·일자·상태·금액) | A(목록)/E(대시보드 부가) | `/store/orders` 본인 조회 | `list_orders` Tool 화면 대응 | 상태 필터·대시보드 위젯 없음 | 상태 표시만으로 T2 최소 충족 | P1 | `account/components/order-overview`·`order-card`, ref `orders/078~079` |
| 주문 상세 | 영수증 보기, 도착 예정일, 취소하기/문의하기 버튼, 배송지+배송메모, 결제 내역(상품금액/할인 상세) | 주문 상태(한글 매핑)·품목·배송지/연락처/방법·금액 요약·도움말 | A(조회)/E(액션) | order 상세 API | `get_order` 화면 대응, 취소 진입점 | 취소/문의/영수증/도착 예정 없음 | 상태 한글 매핑은 이미 있음. 취소 CTA는 아래 3.4 | P1(주문·취소) | `order/templates/order-details-template.tsx`·`order-details/index.tsx`, 코드+기존 E2E 확인 |

### 3.4 구매 후 흐름(취소·환불·CS)

| 기능 | 토스쇼핑 참고 | 현재 Storefront | 분류 | Backend 연관 | AI 연관 | 부족한 점 | 최소 보완 | 우선순위 | 근거 |
|---|---|---|---|---|---|---|---|---|---|
| 배송 단계·추적 | 도착 예정일, 실제 추적은 참고자료도 Not Observed | fulfillment_status 한글 매핑(출고 준비/발송/배송 완료/취소) + 결제 상태 매핑 | A(상태 표시)/E(타임라인) | order.fulfillment_status | T2 "배송 어디까지"의 기반 데이터 | 배송 사건 이력·예정일 없음 | 상태 매핑으로 단계 설명 우선. 추적은 외부 연동(P2) | P1 | `order-details/index.tsx` statusMap |
| 주문 취소 | 사유 선택→예상 환불액→요청→접수 상태 표시 | UI 없음 | B/D/E | Admin cancelOrderWorkflow 재사용, 고객 인증·소유권·정책·승인 경계 신규 필요 | 자격·금액·확인·처리결과 | 고객 취소 흐름 없음 | Core에 맞는 최소 확인/결과 화면. 별도 요청큐 상태를 자동 복제하지 않음 | P1 | 통합 §4.2, ref `orders/085~091` |
| 환불·반품·교환 | 예상 환불액·접수(참고자료도 신청 완료 미관찰) | 고객 UI 없음 | B(Core)/D(권한)/E(UI)/F(실행) | refund/exchange Admin 경로, 반품 POST /store/returns도 존재 | AI 답변의 지원 범위 경계 | 고객 화면·운영 정책·returns 소유권 보호 부족 | 미지원 문구 정합성과 기존 API 권한 보호 우선, 운영 화면은 후속 | 보호 P0 / 기능 P1~P2 | 통합 SB-13, product-tabs vs help 불일치(§4-1) |
| 고객센터·문의 | 문의 분류 시트→하위 질문→조건별 주문 조회→상담 채널(채팅 skeleton) | 없음 — 계정 레이아웃에 "고객센터 안내는 현재 제공하지 않습니다" 명시 | E | 없음(문의 시스템 자체 부재) | AI 채팅이 CS 진입을 자연스럽게 대체 가능 | 전부 | AI 채팅을 CS 진입으로 설계하면 신규 화면 수를 줄일 수 있음 | P1 | `account/templates/account-layout.tsx`, 라이브 `/account`, ref `cs/057~067` |

### 3.5 AI Shopping Brain 연동 관점

현재 AI UI는 전무하다(채팅 진입·패널·결과 표시 모두 없음). 아래는 필요 화면과 재사용 가능 자산이다 — 설계 제안이며 관찰 사실이 아니다.

| 필요 화면/동작 | 현재 상태 | 재사용 가능 자산 | 최소 신규 | 우선순위 |
|---|---|---|---|---|
| AI 채팅 진입 위치 | 없음 | Nav 우측 영역 또는 하단 nav 5번째 탭 후보(설계 제안), SearchDrawer와 유사한 drawer 패턴 존재(headlessui Dialog) | 진입 버튼 + 패널 컨테이너 | P0 |
| 대화 패널·메시지 | 없음 | ui 토큰(bg-ui-*, text-ui-fg-*), Button/Input, modal-context, drawer 전환 패턴 | 메시지 리스트·입력·전송 상태 | P0 |
| 추천 상품 카드 | 없음 | ProductPreview/ProductHit 카드(이미지+제목+가격) 재사용 가능 | "추천 이유"·근거 배지 슬롯 | P0 |
| 비교 결과 표 | 없음 | Table 컴포넌트(@modules/common) | 스펙 비교 표(데이터 의존) | P0(최소형) |
| 리뷰 근거·출처 표시 | 없음 | 없음 — 리뷰 데이터 자체가 선행(03) | 인용 카드/원문 링크 | P0(데이터 후) |
| Tool 실행 전 사용자 확인 | 없음 | SubmitButton·ErrorMessage·Dialog 패턴 | Cart 대상/옵션/수량·명확한 의도 확인 P0. 취소 최종 승인과 서버 재검증은 P1 | P0 Cart / P1 취소 |
| 실행 결과/오류 표시 | 없음 | ErrorMessage, 검색 drawer의 loading/error 상태 패턴 | 결과 카드·재시도 안내 | P0 |
| 대화 맥락 유지 | 없음 | drawer/공통 layout 패턴 재사용 후보(단 상태 지속 구현은 미확인) | 현재 대화의 후보 result set/product/variant ID 보존 P0, 허용된 이전 대화/장기 저장은 후속 | P0 세션 / P1~P2 저장 |
| AI→상품 상세 이동 | 기존 링크 구조 | `/kr/products/[handle]?v_id=[variant]`가 옵션 지정 딥링크로 이미 동작 | 없음(A) | P0(검증만) |
| AI→장바구니 이동 | 기존 서버 액션·Core Cart | addToCart/updateLineItem/deleteLineItem 재사용(A) | 최소 Tool Adapter(E): 세션 Cart·정확 옵션·의도·가격재고·중복/유실·결과 재조회. 승인 UI만으로 안전호출 완성 아님 | P0 |

## 4. UI 문구 ↔ 실제 지원 불일치(관찰 확정)

1. **상품 상세 "배송·반품 안내" 탭이 실제 미지원 기능을 안내함** — `product-tabs/index.tsx`의 ShippingInfoTab은 "빠른 배송 영업일 3~5일", "간편한 교환 — 새 상품으로 교환", "쉬운 반품 — 환불"을 안내하지만, 실제로는 교환/반품 신청·문의 채널이 없고 배송 ETA 데이터도 없다. 반면 주문 도움말(`order/components/help/index.tsx`)과 계정 하단(`account/templates/account-layout.tsx`)은 "문의 및 반품·교환 안내는 현재 제공하지 않습니다"/"고객센터 안내는 현재 제공하지 않습니다"로 정직하게 표시한다. 구매 전 화면이 실제보다 과장된 안내를 하는 상태이며, AI 답변의 근거 데이터로도 부적합하다. 최소 수정은 스타터 문구를 실제 지원 범위(배송비 정책 기준 안내, 반품·교환 미지원 명시)로 교체하는 것이고, 반품/교환 지원을 나중에 추가하면 문구를 데이터화한다.
2. **Footer에 원본 seed 영어 카테고리 잔존** — Shirts/Sweatshirts/Pants/Merch가 한국 데모 카테고리(모니터·마우스)와 혼재한다. AI가 카테고리를 열거할 때 노이즈가 된다. 데이터 정리 영역(03)이지만 UX 표면 결함으로 기록한다.
3. **상품 `subtitle` 데이터 미표시** — seed의 "QHD · 144Hz · 패널 선택" 등 요약 필드가 화면에 나타나지 않는다(표시는 title+description뿐). 스펙 요약 노출의 즉시 가능한 후보 필드다.
4. **장바구니 요약 "배송비 0원" 표시** — 배송 방법 선택 전이라 0원으로 보이며 실제 일반배송 3,000원 정책과 다른 인상을 줄 수 있다(F: 표시 정책 의도 확인 필요).

## 5. 우선순위 요약(최신 Shopping Brain GAP 요청 기준)

**P0 — 첫 AI MVP 직결**

- 구조화 스펙 정의와 상세/비교 결과 표시 — 기존 metadata 재사용+최소 검색/표시 확장. 조건 비교 입력(03과 공동).
- 리뷰 근거 가능성·원문/출처 표시 범위 결정. 리뷰 없는 스펙 MVP라면 그 제한을 안내하고, 리뷰 실험을 포함하면 정확한 상품 연결과 합성 여부를 표시한다.
- AI 채팅 진입·패널·메시지, 기존 추천 카드+이유, 최소 비교 표, 선택 Cart 확인, 실행 결과/오류/불명 상태 표시.
- 현재 대화 후보와 exact product/variant ID를 유지, `v_id` 딥링크와 Cart 안전 Adapter 검증. Core Cart를 복제하지 않는다.
- §4의 지원 문구 불일치 정리와 미연결 returns API 보호. 실제 반품 서비스 전체 구축은 별도 후속이다.

**P1 — 다음 확장**

- 배송비/예정일 데이터 기반 안내(정적 문구 대체), 배송 단계 표시 개선, 환불·반품 상태 안내 설계.
- CS 진입을 AI 채팅으로 통합하는 설계(별도 문의 화면 대신).
- 최근 검색어·자동완성, 검색 결과 칩/시트 UX, 주문 목록 상태 필터, 내 쇼핑 대시보드 확장.
- 홈 AI 추천 섹션 슬롯.
- 주문 상세의 취소 진입·자격/환불 정보·최종 승인·실행 결과(01 Core/권한/정책 선행). 읽기 리뷰 리스트·평점 집계 확장, 동의한 선호 저장.

**P2 — 장기**

- 찜·최근 본, 쿠폰/포인트/적립, 가격 비교(외부 데이터), 이미지 확대 뷰어, 카트 선택 주문·Undo·판매자 그룹핑, 실제 배송 추적 연동, 영수증, 배송 메모.

## 6. 미확인(F)·관찰 한계

- 할인코드 실제 적용 동작(F): DiscountCode UI 존재하나 적용 가능한 promotion 코드 존재 여부·적용 검증은 이번 읽기 범위 밖.
- 체크아웃 내부·주문 완료·계정 대시보드 화면은 비로그인 상태라 라이브 확인 대신 코드와 Gate3~4 E2E 증거(단일 Worker 51/51, 실제 주문·DB 대조)에 의존. 새 검증을 주장하지 않음.
- 배송 요청 메모 필드 존재 여부(F), 결제수단 다중 선택(F — 현재 pp_system_default만 seed로 확인됨).
- 참고 캡처의 빈 화면·"표시만" 항목(가격 비교 본문, CS 문의 전송, 배송 추적, 반품/교환 접수)은 참고자료에서 결과가 미확인인 상태다. 토스의 구현 부재를 단정하거나 현재 구현의 완료 기준으로 쓰지 않는다.
- 이 문서는 새 화면·API를 구현하라는 지시가 아니라 격차 기록이다.
