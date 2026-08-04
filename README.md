# CGV IMAX 예매 오픈 모니터

CGV 용산아이파크몰 IMAX 관 예매 오픈을 자동으로 감지하고 **텔레그램**으로 실시간 알림을 받는 시스템입니다.

> ⚠️ **로컬(Windows) 전용입니다.** CGV는 Cloudflare로 데이터센터/클라우드 IP(GitHub Actions 등)의 API 접근을 차단합니다.
> 가정용 인터넷 IP에서만 정상 동작하므로, 이 프로젝트는 Windows 작업 스케줄러로 **PC가 켜져 있을 때** 실행됩니다.

## 📋 시스템 요구사항

- **Windows 10/11**
- **Node.js 16 이상**
- **인터넷 연결** (가정용 IP — VPN/프록시/클라우드 서버 불가)

## ⚡ 원클릭 설치 (권장)

**관리자 권한** PowerShell에서 한 줄 실행:

```powershell
irm https://raw.githubusercontent.com/Henryshin/cgv-imax-monitor/main/install.ps1 | iex
```

`C:\side_PJT\CGV`에 설치 → 텔레그램 토큰/chat_id 입력 → 연결 테스트 → 작업 스케줄러 등록 → 즉시 가동까지 자동으로 진행됩니다. 텔레그램 봇이 아직 없다면 아래 2단계의 BotFather 가이드를 먼저 따라 토큰과 chat_id를 준비해주세요.

이미 저장소를 받아둔 경우:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\side_PJT\CGV\install.ps1"
```

## 🚀 수동 설치

### 1단계 — 환경 설정

`.env.example`을 복사해 `.env` 파일을 만듭니다:

```powershell
copy .env.example .env
```

### 2단계 — 텔레그램 봇 생성 (BotFather)

<details>
<summary><b>자세한 가이드</b></summary>

#### 1️⃣ BotFather 찾기
1. 텔레그램 앱 검색 → `@BotFather` (파란 체크 표시 있는 공식 계정)
2. "시작" 버튼 클릭

#### 2️⃣ 봇 생성
```
/newbot
```
- 표시 이름: `CGV IMAX 알리미`
- 봇 아이디: `yongsan_imax_alert_bot` (끝이 `_bot`이고 전 세계 유일해야 함)

#### 3️⃣ 토큰 복사
응답에 나오는 토큰을 복사합니다:
```
Use this token to access the HTTP API:
8123456789:AAHk3l-Xq7...
```

#### 4️⃣ chat_id 알아내기
1. BotFather 메시지의 `t.me/여러분의봇아이디` 링크 클릭
2. "시작" 누르고 아무 메시지나 전송
3. 브라우저 주소창에 입력 (토큰 전체 복사):
   ```
   https://api.telegram.org/bot{YOUR_TOKEN}/getUpdates
   ```
4. JSON에서 `"chat":{"id":987654321` 부분의 숫자가 **TELEGRAM_CHAT_ID**

**팁**: `@userinfobot` 검색해서 START만 눌러도 ID 확인 가능

</details>

### 3단계 — .env 파일 설정

텍스트 에디터에서 `.env` 파일을 열어 입력합니다 (**따옴표 없이**):

```env
TELEGRAM_BOT_TOKEN=8123456789:AAHk3l-Xq7...
TELEGRAM_CHAT_ID=987654321
SITE_NO=0013
SCREEN_KEYWORD=IMAX
CHECK_INTERVAL_MINUTES=5
```

| 항목 | 설명 |
|------|------|
| `TELEGRAM_BOT_TOKEN` | BotFather에서 받은 토큰 |
| `TELEGRAM_CHAT_ID` | 내 chat_id 숫자 |
| `SITE_NO` | CGV 극장 코드 (용산=0013) |
| `SCREEN_KEYWORD` | 감시할 상영관 (IMAX/4DX/ScreenX) |
| `CHECK_INTERVAL_MINUTES` | 체크 간격 (분) |

### 4단계 — 설정 테스트

```powershell
node test-telegram.js
```

성공 시 텔레그램에 테스트 메시지가 옵니다.

수동으로 모니터/보고를 한 번 실행해볼 수도 있습니다:

```powershell
node monitor.js          # 신규 회차 탐지
node monitor.js report   # 현황 보고
```

### 5단계 — 자동 실행 설정 (Windows 작업 스케줄러)

**관리자 권한** PowerShell에서:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\side_PJT\CGV\setup_task.ps1"
```

두 개의 예약 작업이 등록됩니다:

| 작업 이름 | 주기 | 역할 |
|-----------|------|------|
| `CGV-IMAX-Monitor` | 5분마다 | 신규 회차 감지 시 알림 |
| `CGV-IMAX-DailyReport` | 매일 09:00 | 현재 오픈된 예매 현황 요약 |

> PC가 꺼져 있거나 절전 상태면 실행되지 않습니다. 작업 스케줄러에서 언제든 확인/수정할 수 있습니다.

---

## 📁 파일 구조

```
CGV/
├── monitor.js              # 메인 모니터링 스크립트
├── test-telegram.js        # 텔레그램 테스트
├── setup_task.ps1          # Windows 스케줄러 등록 (모니터 + 일일보고)
├── package.json            # Node.js 메타데이터
├── .env.example             # 환경변수 템플릿
├── .env                     # 실제 환경변수 (git 제외)
├── state.json               # 상태 저장 (자동 생성)
├── README.md                # 이 파일
└── .git/                    # Git 저장소
```

## 🔍 동작 원리

1. **날짜 목록 조회**: `cgv.co.kr/api/v1/booking/searchSiteScnscYmdListBySite`로 예매 가능한 날짜 목록 조회
2. **일자별 스케줄 조회**: 각 날짜마다 `cgv.co.kr/api/v1/booking/searchMovScnInfo`로 전 상영관 스케줄 조회
3. **필터링**: IMAX 상영관만 추출
4. **신규 감지**: 이전 실행(`state.json`) 대비 새 회차 감지
5. **알림**: 신규 회차가 있으면 텔레그램 발송, `state.json` 갱신
6. **일일 보고**: 매일 09:00 현재 오픈된 전체 IMAX 예매 현황을 요약해서 발송

## 📊 텔레그램 알림 예시

**신규 오픈 알림**
```
[CGV] CGV 용산아이파크몰 IMAX 신규 예매 오픈 2건

2026-07-29 16:00~18:35
  스파이더맨 - 브랜드 뉴 유니버스
  IMAX관 · IMAX LASER 2D · 잔여 5/624석

2026-07-29 18:45~20:30
  인사이드 아웃 2
  IMAX관 · IMAX 2D · 잔여 12/624석

CGV 예매 바로가기
```

**일일 현황 보고 (매일 09:00)**
```
📋 [CGV 현황 보고] 2026.7.31
현재 오픈 예매: 23건

2026-07-31
  14:00 스파이더맨-브랜드 뉴 데이
  잔여 5/624석
  ...
```

## 🐛 문제 해결

| 증상 | 해결 |
|------|------|
| "텔레그램 설정 누락" | `.env`에 토큰과 chat_id 입력 |
| "chat not found" | chat_id 숫자 확인 또는 봇과 대화 시작 |
| `JSON 파싱 오류: Unexpected token <` | CGV의 Cloudflare가 요청을 차단한 것. VPN/사내망이 아닌 일반 가정용 인터넷에서 실행 중인지 확인 |
| 작업 스케줄러 등록 실패 | 관리자 권한으로 PowerShell 실행 |
| PC를 꺼두면 알림이 안 옴 | 정상입니다. 이 프로젝트는 로컬 실행 전용입니다 (위 안내 참고) |

## 🚀 고급 설정

### 다른 극장 감시
```env
SITE_NO=0001  # 강남
SITE_NO=0002  # 명동
```

### 다른 상영관
```env
SCREEN_KEYWORD=4DX
SCREEN_KEYWORD=ScreenX
```

### 체크 간격 변경
작업 스케줄러 → `CGV-IMAX-Monitor` → 속성 → 트리거 편집

### 일일 보고 시간 변경
작업 스케줄러 → `CGV-IMAX-DailyReport` → 속성 → 트리거 편집

## 📝 라이선스

MIT License

---

**최신 업데이트**: 2026년 7월 31일
