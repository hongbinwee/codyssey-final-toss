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

Storefront의 `NEXT_PUBLIC_DEFAULT_REGION=kr`을 설정하고 서버를 재시작한다. 상품 이미지의 기본 원본 주소는 `http://localhost:8000/demo-products`이다. 포트를 바꾸는 경우 Catalog seed 실행 전에 `STOREFRONT_URL`을 설정해야 한다.

초기 EUR/USD 검색 인덱스가 이미 있는 DB에 한국 설정을 추가한 경우, Backend 디렉터리에서 아래 공식 검색 migration을 실행하고 Backend를 재시작한다. `--execute-safe-search`는 선언되지 않은 인덱스의 삭제를 건너뛴다. 기동 시 Medusa가 새 인덱스를 채우고 활성 버전을 전환한다. 상품 seed 재실행으로 검색 필터 스키마를 갱신하려고 하지 않는다.

```powershell
pnpm exec medusa db:migrate:search --execute-safe-search
```

초기 상품·리전을 추가하기 전에 Storefront를 실행했다면 이전 Next fetch 캐시가 남을 수 있다. 서버를 멈추고 프로젝트 안의 생성 캐시 `apps/storefront/.next/cache/fetch-cache`를 로컬 백업 폴더로 이동한 뒤 재시작한다. DB·소스·원본 상품을 삭제하지 않는다.

## 검증

한국 Commerce API 검증22개와 최종 브라우저 E2E51개(단일 QA Worker)는 모두 통과했다. 라이트·다크·모바일에서 UI로 만든 같은 KRW 주문3건을 PostgreSQL에서 고객·통화·번호·총액까지 대조했다. Next·Medusa·Admin 생산 빌드도 통과했다.

Backend 실행 상태에서 Backend 디렉터리의 검증 스크립트를 실행할 수 있다. 합성 고객·실제 모의 주문을 생성하며 비밀번호는 실행 시 무작위 생성한다. 필수 검사 실패나 미실행이 있으면 종료 코드가 0이 아니다.

```powershell
pnpm exec medusa exec ./src/scripts/verify-commerce.ts
```

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

Backend와 Storefront를 켜둔 상태에서 저장소 루트의 브라우저 테스트를 실행한다. 최초 Chromium 설치만 필요하며, 프로젝트 공용 캐시가 있으면 config가 자동으로 찾는다.

```powershell
pnpm exec playwright install chromium
pnpm test:e2e
```

기본값은 QA Worker1개다. 동일 로컬 생산 서버에서2개 병렬 실행은 Cart 삭제·주문 상세 이동의 RSC 요청 종료 지연으로48/51이었고,1개 실행은51/51이었다. 원인은 확정되지 않았다. 재시도·skip·콘솔 오류 무시로 통과시키지 않으며, 동시 접속 안정성은 별도 후속 검증으로 남긴다. 개발 Worker별 병렬 작업과 브라우저 테스트 실행 개수는 별개다.

51개 테스트가 desktop 1440×900 Light, desktop-dark 1440×900, mobile 390×844에서 실행된다. 게스트 Cart 로그인 복귀·상품 탐색·전체 옵션별 가격·할인·품절·수량 변경·삭제·배송·System 모의 주문·새 세션 주문 조회·고객별 주문 격리·한국어·KRW·실제 테마 컨트롤을 확인한다. UI로 생성한 주문의 비밀정보 없는 식별자·고객 ID·통화·총액은 `order-diagnostic` JSON attachment로 남긴다. 같은 ID를 전용 PostgreSQL의 `order`와 `order_summary`에서 대조한다. 테스트 수집만으로 실제 E2E 통과를 선언하지 않는다.

Windows에서 Backend unit 테스트를 직접 실행할 경우 POSIX 환경 변수 접두사 대신 `$env:TEST_TYPE='unit'`을 설정하고 `pnpm exec jest --runInBand --forceExit`를 사용한다.

## 생산 빌드 실행

Storefront는 `pnpm build` 성공 후 같은 디렉터리에서 `pnpm start`로 실행한다. Backend는 `pnpm build` 성공 후 생성된 `apps/backend/.medusa/server`를 실행 디렉터리로 사용한다. 원본 Backend 디렉터리에서 `medusa start`를 실행하면 빌드된 Admin 경로를 찾지 못할 수 있다.

현재 Windows 로컬 생산 Backend는 기존 환경 파일을 출력·복사하지 않고 설치된 dotenv 로더를 사용해 실행한다. Backend 디렉터리에서 아래를 실행한다.

```powershell
$backendEnvPath = (Resolve-Path -LiteralPath '.env').Path
$dotenvLoaderPath = node -p "require.resolve('dotenv/config', { paths: [require.resolve('@medusajs/cli')] })"
Push-Location -LiteralPath '.medusa/server'
$env:DOTENV_CONFIG_PATH = $backendEnvPath
node -r $dotenvLoaderPath ../../node_modules/@medusajs/cli/cli.js start
Pop-Location
Remove-Item Env:\DOTENV_CONFIG_PATH
```

Backend가 종료된 뒤 마지막 두 줄로 디렉터리와 환경 변수 경로를 복구한다. 동일 포트의 기존 서버를 중복 실행하지 않는다. `http://localhost:9000/health`와 `/app` 응답을 확인한 후 Storefront를 시작한다.

## 현재 범위

결제는 Medusa의 Manual/System 모의 결제를 사용한다. 실제 PG·외부 상품 API·AI Shopping Brain·외부 배포는 현재 P0 범위 밖이다. 고객센터·정책 문서·반품·교환·배송 추적과 이메일 발송은 제공하지 않는다. 합성 상품의 자체 SVG를 사용하며 실물 상품 사진이 아니다. Pretendard는 CDN 로드 실패 시 한국어 시스템 폰트로 대체된다. 로컬 기본 event bus·locking·cache 구성을 운영 환경 완료로 간주하지 않는다.

Storefront는 로그인한 고객의 Cart만 주문 완료 액션에 전달하며, 액션은 현재 고객 인증과 Cart 소유자를 매번 `no-store`로 확인한다. 기존 Medusa Store API의 직접 게스트 주문 완료 기능은 유지한다. 전 API에서 게스트 주문을 금지하는 정책은 후속 Backend 인증 설정 범위다. 모든 브라우저 저장소 접근을 차단하면 원본 SDK의 locale 초기화 오류가 날 수 있으며, 프로젝트 테마 저장 키의 접근 실패는 처리한다.

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

원본의 주문 ID 기반 비인증 조회에 고객 인증·소유권 middleware를 추가했다. 실제 조회 결과 본인200·비로그인401·다른 고객404를 확인했다. 따라서 주문 확인과 계정 상세를 보려면 해당 주문 고객으로 로그인해야 한다. 한국어 UI의 로그인 필수 구매 흐름과 함께 검증한다.
