# CGV IMAX 예매 오픈 모니터

CGV 용산아이파크몰 IMAX 관 예매 오픈을 자동으로 감지하고 **텔레그램**으로 실시간 알림을 받는 시스템입니다.

## 📋 시스템 요구사항

- **Windows 10/11** (로컬 실행) 또는 **GitHub Actions** (자동 클라우드 실행)
- **Node.js 16 이상**
- **인터넷 연결**

## 🚀 빠른 시작 (로컬 설정)

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

### 5단계 — 자동 실행 설정 (Windows)

**관리자 권한** PowerShell에서:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\side_PJT\CGV\setup_task.ps1"
```

작업 스케줄러가 5분마다 자동 실행하도록 등록됩니다.

---

## 🌐 클라우드 자동 실행 (GitHub Actions)

GitHub에 repo를 만들면 5분마다 자동으로 모니터링합니다.

### GitHub 업로드 방법

1. **GitHub에서 새 repository 생성** (Public 또는 Private)

2. **로컬에서 업로드**:
   ```powershell
   cd C:\side_PJT\CGV
   git remote add origin https://github.com/YOUR_USERNAME/cgv-monitor.git
   git branch -M main
   git push -u origin main
   ```

3. **Secrets 설정** (GitHub Web):
   - 저장소 Settings → Secrets and variables → Actions
   - `TELEGRAM_BOT_TOKEN` 추가
   - `TELEGRAM_CHAT_ID` 추가

4. **Actions 활성화**:
   - "Actions" 탭 → "I understand my workflows, go ahead and enable them"

이제 자동으로 5분마다 모니터링하고 새로운 예약이 오픈되면 텔레그램으로 알림을 보냅니다!

---

## 📁 파일 구조

```
CGV/
├── monitor.js              # 메인 모니터링 스크립트
├── test-telegram.js        # 텔레그램 테스트
├── setup_task.ps1          # Windows 스케줄러 등록
├── package.json            # Node.js 메타데이터
├── .env.example            # 환경변수 템플릿
├── .env                    # 실제 환경변수 (git 제외)
├── state.json              # 상태 저장 (자동 생성)
├── .github/workflows/      
│   └── monitor.yml         # GitHub Actions 설정
├── README.md               # 이 파일
└── .git/                   # Git 저장소
```

## 🔍 동작 원리

1. **API 조회**: CGV 공개 API에서 22일치 상영 일정 조회
2. **필터링**: IMAX 상영관만 추출
3. **신규 감지**: 이전 실행 대비 새 회차 감지
4. **알림**: 신규 회차가 있으면 텔레그램 발송
5. **상태**: `state.json`에 현재 회차 저장

## 📊 텔레그램 알림 예시

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

## 🐛 문제 해결

| 증상 | 해결 |
|------|------|
| "텔레그램 설정 누락" | `.env`에 토큰과 chat_id 입력 |
| "chat not found" | chat_id 숫자 확인 또는 봇과 대화 시작 |
| getUpdates가 빈 배열 | 내 봇 대화창에서 아무 메시지나 보내기 |
| 작업 스케줄러 등록 실패 | 관리자 권한으로 PowerShell 실행 |

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
```env
CHECK_INTERVAL_MINUTES=3
```

작업 스케줄러에서도 조정 가능: 작업 스케줄러 → CGV-IMAX-Monitor → 속성 → 트리거 편집

## 📝 라이선스

MIT License

---

**최신 업데이트**: 2026년 7월 30일
