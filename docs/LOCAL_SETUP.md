# 토스 3days 로컬 실행

공식 Medusa DTC Starter의 기존 Backend·Storefront·PostgreSQL 구조를 사용한다. 현재 Gate 상태와 검증 결과는 `EXECUTION_STATUS.md`, 화면 기준은 `DESIGN_SYSTEM.md`에 기록한다.

## 준비

- Node.js 22.22 이상. 현재 검증 환경은 Node.js 24.15.0이다.
- 루트 `packageManager`에 지정된 pnpm 10.11.1. 전역 pnpm 버전이나 전역 인증을 변경하지 않는다.
- PostgreSQL 15 이상과 프로젝트 전용 데이터베이스. 기존 프로젝트 DB를 공유하지 않는다.

저장소 루트에서 `pnpm install --frozen-lockfile`을 실행한다. 환경 파일은 아래 위치에 로컬로만 준비한다.

- `apps/backend/.env`: `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECRET`, Store/Admin/Auth CORS.
- `apps/storefront/.env.local`: Backend URL, 해당 Store의 Publishable API Key, 기본 Region.

Backend의 JWT·쿠키 비밀값은 직접 생성한 값을 사용한다. `.env.template`의 예제 문자열을 실제 인증값으로 재사용하지 않는다. 환경 파일·인증값·고객 데이터·DB 파일·브라우저 세션은 Git에 포함하지 않는다.

## 초기 구동

Backend 디렉터리에서 다음을 실행한다.

```powershell
pnpm exec medusa db:migrate
pnpm exec medusa user -e "YOUR_LOCAL_EMAIL" -p "YOUR_GENERATED_PASSWORD"
pnpm dev
```

관리자 생성 명령의 두 예제 문자열은 자신의 로컬 값으로 교체한다. 공식 초기 데이터 migration 이후 Admin의 Settings에서 해당 Sales Channel에 연결된 Publishable API Key를 확인하고 Storefront 환경에 설정한다. 관리자 비밀번호는 공개 문서나 공유 로그에 남기지 않는다.

다른 터미널의 Storefront 디렉터리에서 실행한다.

```powershell
pnpm dev
```

- Backend: `http://localhost:9000/health`
- Admin: `http://localhost:9000/app`
- Storefront: `http://localhost:8000`

한국 Region과 상품 seed는 구현·순차 실행·재실행 검증을 마쳤다. Backend 디렉터리에서 아래 순서로 실행한다. 동일 DB에 seed나 migration을 동시에 실행하지 않는다.

```powershell
pnpm exec medusa exec ./src/scripts/seed-korea.ts
pnpm exec medusa exec ./src/scripts/seed-korean-catalog.ts
```

한국 설정은 기존 통화를 보존하고 KRW Region·한국 창고·일반배송 3,000원·무료배송을 추가한다. Catalog는 14개 한국어 데모 상품과 27개 Variant, 품절·한정 재고·실제 할인 목록을 만든다. 기존 상품·재고 수준을 찾으면 건너뛰므로 주문으로 소진된 재고를 자동 복구하지 않는다.

Storefront의 `NEXT_PUBLIC_DEFAULT_REGION=kr`을 설정하고 서버를 재시작한다. 상품 이미지의 기본 원본 주소는 `http://localhost:8000/demo-products`이다. 포트를 바꾸는 경우 Catalog seed 실행 전에 `STOREFRONT_URL`을 설정해야 한다. 현재 한국어 UI·주문 권한 통합 검증은 진행 중이다.

## 검증

현재 원본 기반 Backend의 Medusa 권장 lint와 Storefront의 별도 타입 검사는 통과했다. 최종 한국어 커머스 완료 여부는 통합 후 실제 구매·고객별 주문 격리·PostgreSQL 저장·테마·반응형 검증으로 결정한다.

Storefront 디렉터리:

```powershell
pnpm exec tsc --noEmit --incremental false
pnpm build
```

Backend 디렉터리:

```powershell
pnpm exec eslint src medusa-config.ts
pnpm build
```

Playwright 실행 방법은 QA 설정 통합 후 확정한다. 테스트 수집 성공은 실제 E2E 통과를 의미하지 않는다.

## 현재 범위

결제는 Medusa의 Manual/System 모의 결제를 사용한다. 실제 PG·외부 상품 API·AI Shopping Brain·외부 배포는 현재 P0 범위 밖이다. 로컬 기본 event bus·locking·cache 구성을 운영 환경 완료로 간주하지 않는다.

## 재사용한 Store API

아래는 원본 기반 로컬 구매 검증에서 사용한 경로다. 상품·Cart·Order를 위한 자체 DB 모델이나 별도 커머스 API는 추가하지 않는다. Store 요청은 해당 Sales Channel의 Publishable API Key, 고객 요청은 해당 고객의 인증을 사용한다.

| 기능 | 기존 경로 |
|---|---|
| 상품·지역 | `GET /store/products`, `GET /store/regions` |
| 기존 검색 | `POST /store/search` |
| 고객 인증·등록 | `POST /auth/customer/emailpass/register`, `POST /auth/customer/emailpass`, `POST /store/customers` |
| Cart 생성·조회·주소 수정 | `POST /store/carts`, `GET /store/carts/:id`, `POST /store/carts/:id` |
| 품목 추가·수량 수정·삭제 | `POST /store/carts/:id/line-items`, `POST` / `DELETE /store/carts/:id/line-items/:line_id` |
| 배송 | `GET /store/shipping-options?cart_id=...`, `POST /store/carts/:id/shipping-methods` |
| 모의 결제 | `GET /store/payment-providers?region_id=...`, `POST /store/payment-collections`, `POST /store/payment-collections/:id/payment-sessions` |
| 주문 완료·조회 | `POST /store/carts/:id/complete`, `GET /store/orders`, `GET /store/orders/:id` |

현재 원본의 주문 상세는 비로그인·다른 고객 조회 차단 테스트에서 실패했다. 인증과 소유권 검사 통합 전에는 고객별 접근 제한을 완료로 간주하지 않는다.
