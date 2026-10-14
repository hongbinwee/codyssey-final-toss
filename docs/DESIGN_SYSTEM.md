# 토스 3days Storefront 디자인 기준

기준: 프로젝트 루트의 PROJECT_MASTER_PLAN.md §5·§13. 기존 Next.js Storefront, Medusa SDK, Tailwind와 공통 컴포넌트를 재사용한다. 새 UI 프레임워크나 디자인 패키지는 만들지 않는다.

## 근거와 방향

- [Observed] 다크 테마 캡처의 가격 중심 정보 위계, 모바일 2열 상품 카드, 옵션 선택, 둥근 CTA, 배송·주문 요약을 참고한다.
- [Inferred] 캡처의 880×1920 픽셀을 CSS px로 직접 복제하지 않는다. 기존 문서의 크기·간격 환산은 시작 가이드다.
- [Project] 모바일 우선, 데스크톱에는 기존 Starter의 넓은 그리드·Cart/Checkout 요약 배치를 유지한다. 상품·가격·다음 구매 행동을 명확히 한다.
- [Project] 서비스 표시명은 '3days 쇼핑'. 토스 로고·전용 폰트·브랜드 캠페인·캡처 상품 이미지·개인정보를 포함하지 않는다. 실제 구현·API 값만 표시하고 리뷰·할인·배송 약속을 만들어내지 않는다.
- [Project] 참고자료는 저장소 밖 로컬 '준비 자료'에만 유지한다. 과거 프로젝트의 구현 결정은 이번 구현 사실로 취급하지 않는다.

## 색상 토큰

라이트는 기존 문서의 공개 TDS 참고값을 채택한 [Project], 다크는 캡처 분석 근사값을 채택한 [Project]다. 토스의 공식 최신 토큰이라는 주장은 하지 않는다.

| 역할 | Light | Dark |
|---|---|---|
| Primary | #3182F6 | #2975F4 |
| Primary hover | #2272EB | #1F64D8 |
| Primary weak | #E8F3FF | #22345C |
| Background | #F4F6F8 | #171619 |
| Surface | #FFFFFF | #202024 |
| Input | #F2F4F6 | #24252A |
| Border | #E5E8EB | #2E2E33 |
| Text primary | #191F28 | #F0F0F2 |
| Text secondary | #4E5968 | #B0B4BD |
| Muted | #6B7684 | #8B95A1 |
| Discount / Error | #D92D3A | #FF6B78 |
| Success | #07834A | #4BD69B |

[Project] 에러·할인·성공은 작은 텍스트의 대비를 위해 참고값에서 조정했다. 링크·선택·포커스는 Primary, CTA는 흰 글자와 충분한 대비로 구현하며 브라우저에서 확인한다. 배경·텍스트·입력·모달 모두 테마를 따른다.

## Typography / Space / Radius

- [Project] Pretendard 우선. 배포 시 OFL 라이선스를 확인하고 유지한다. 시스템 fallback: -apple-system, BlinkMacSystemFont, 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif.
- [Project] 페이지 제목 24~28px/700, 섹션 18~20px/700, 상품명·본문 14~16px/400~600, 가격 20~22px/700, 보조 12~13px, 버튼 16~17px/600. 한글 word-break: keep-all, 본문 line-height 1.5.
- [Inferred → Project] 간격 4/8/12/16/20/24/32px, 모바일 좌우 16px, 상품 그리드 gap 12~16px, 카드 내부 16px.
- [Project] 카드 radius 16px, 버튼·입력 12px, 시트 상단 20px. 터치 영역 최소 44px, 구매 CTA 높이 52px. 포커스 링 유지, reduced-motion 존중.

## 테마와 반응형

- [Project] Light/Dark/System 세 선택을 제공하고 localStorage에 선택만 보존한다. 기본 System, 시스템 변경 즉시 반영, 초기 렌더 깜빡임과 hydration 오류 방지.
- [Project] 기존 Tailwind darkMode: class를 재사용한다. 새 테마 의존성은 필요 없다.
- [Project] 모바일 2열, 태블릿 3열, 데스크톱 4열을 기본으로 기존 breakpoints를 재사용한다. 360×640·390×844·768×1024·1440×900에서 가로 넘침·텍스트·CTA 가림을 검증한다.
- [Project] 모바일 구매·장바구니·결제 CTA는 safe-area를 고려한다. 데스크톱은 기존 헤더와 요약 패널, 모바일은 홈/상품/장바구니/내 쇼핑의 동작하는 내비게이션을 사용한다. 지원하지 않는 혜택·증권 탭을 만들지 않는다.

## 컴포넌트와 동작

| 구성 | 기준 |
|---|---|
| Header / Navigation | 기존 nav·링크 재사용. 검색·상품·카트·계정·테마 접근. 한국어 접근성 라벨 |
| Product card | [Observed] 정사각 이미지·상품명·굵은 가격. [Project] 데모 자체 이미지, 실제 할인 계산이 있을 때만 할인율·취소선 |
| Detail / Variant | [Observed] 이미지 → 상품명 → 옵션 → 가격 → 배송 → 구매. 기존 product-actions와 SDK 그대로; 옵션 변경 시 실제 가격·재고 반영 |
| Price | 기존 money helper로 KRW 0자리, ko-KR 표시. 단위 변환·합계는 서버 계약 유지 |
| Cart | 기존 item·quantity·remove·totals 재사용. 추가/변경 pending·실패·품절 표시, 배송비 명확화 |
| Button / Input | loading·disabled·focus·error 상태. 모든 입력에 라벨, validation 오류를 입력 가까이 표시 |
| Checkout | 기존 addresses → delivery → payment → review 흐름 유지. 한국 주소·배송 선택·'모의 결제' 안내·최종 금액 포함 CTA |
| Orders / Status | 기존 고객·order API 사용. 결제 수단은 모의 결제임을 명시. 저장된 주문번호·실제 상태 표시, 타인 주문 차단 |
| Modal / Sheet | 기존 accessible dialog 재사용. 선택·닫기·키보드·포커스 복귀 보장 |
| Empty / Loading / Error | 기존 skeleton 사용, 빈 상태 설명+관련 이동, 서버 오류의 한국어 안내+가능한 재시도. 실패를 성공으로 표시하지 않음 |

## 기본 한국어 문구

[Observed] 구조 참고: '상품을 검색해보세요', '구매하기', '장바구니', '배송지', '주문 금액', '주문 상세 내역'. [Project] 우리 서비스: '상품 보기', '장바구니에 담기', '주문하기', '모의 결제하기', '주문이 접수됐어요', '내 쇼핑', '담긴 상품이 없어요', '다시 시도해주세요'. 실제 PG 승인·실제 배송을 의미하는 과장된 문구는 쓰지 않는다.

## 검증

실제 브라우저 구매 흐름·옵션·수량·품절·배송비·주문 조회, 한국어, KRW, 모바일/데스크톱과 Light/Dark/System을 확인한다. 새 테이블·금액 계산·자체 주문 API 추가 없이 기존 Storefront를 변경한다.

## 구현 메모

- [Project] 폰트 출처: Pretendard Variable v1.3.9 (SIL OFL 1.1, orioncactus/pretendard), jsdelivr CDN dynamic-subset을 root layout의 <link>로 로드한다. 시스템 스택 fallback은 tailwind.config.js에 있다.
- [Project] 테마 저장 키는 `3days-theme`(light|dark|system)이며, 첫 페인트 전 적용하는 인라인 스크립트와 ThemeSelect 컴포넌트가 공유한다. localStorage 접근은 try/catch로 감싼다.
- [Project] KRW는 `convertToLocale`에서 ko-KR·0자리로 "12,000원" 형태로 표기한다. 다른 통화는 기존 형식을 유지한다.
- [Project] 지역 통화의 `calculated_price`가 없는 상품(예: /kr에서 EUR 전용 시드 상품)은 구매 불가로 간주해 홈·관련 상품·카테고리/컬렉션 목록·검색 결과에서 제외한다. 상품 자체는 삭제하지 않는다.
