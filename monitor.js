const https = require('https');
const fs = require('fs');
const path = require('path');

// Load .env file manually (no external dependencies)
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  const env = { ...process.env };

  try {
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, value] = trimmed.split('=').map(s => s.trim());
          if (key) {
            env[key] = value;
          }
        }
      });
    }
  } catch (error) {
    console.error('Warning: Could not load .env file:', error.message);
  }

  return env;
}

const env = loadEnv();
const BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = env.TELEGRAM_CHAT_ID;
const SITE_NO = env.SITE_NO || '0013';
const COMPANY_CD = env.COMPANY_CD || 'A420';
const SCREEN_KEYWORD = env.SCREEN_KEYWORD || 'IMAX';
const STATE_FILE = path.join(__dirname, 'state.json');
const LOG_FILE = path.join(__dirname, 'monitor.log');

// 콘솔 출력을 monitor.log에도 기록 (스케줄러 실행은 콘솔이 안 보이므로 사후 진단용)
function teeToLogFile(original, level) {
  return (...args) => {
    original(...args);
    try {
      const line = `[${new Date().toISOString()}] [${level}] ${args.join(' ')}\n`;
      fs.appendFileSync(LOG_FILE, line, 'utf8');
      // 로그가 1MB를 넘으면 최근 절반만 유지
      const stats = fs.statSync(LOG_FILE);
      if (stats.size > 1024 * 1024) {
        const content = fs.readFileSync(LOG_FILE, 'utf8');
        fs.writeFileSync(LOG_FILE, content.slice(content.length / 2), 'utf8');
      }
    } catch (e) { /* 로깅 실패는 무시 */ }
  };
}
console.log = teeToLogFile(console.log.bind(console), 'INFO');
console.error = teeToLogFile(console.error.bind(console), 'ERROR');

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('State 파일 읽기 오류:', error.message);
  }
  return {};
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (error) {
    console.error('State 파일 저장 오류:', error.message);
  }
}

function fetchCGVJson(cgvPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'cgv.co.kr',
      path: cgvPath,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (error) {
          reject(new Error('JSON 파싱 오류: ' + error.message));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000);
    req.end();
  });
}

// 텔레그램 HTML parse_mode에서 &, <, > 가 포함된 영화 제목이 있으면
// 메시지 전체가 거부되므로 반드시 이스케이프해야 한다.
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDate(scnYmd) {
  return `${scnYmd.slice(0, 4)}-${scnYmd.slice(4, 6)}-${scnYmd.slice(6, 8)}`;
}

function formatTime(hhmm) {
  if (!hhmm || hhmm.length !== 4) return hhmm || '';
  return `${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}`;
}

async function fetchScheduleDates() {
  const result = await fetchCGVJson(
    `/api/v1/booking/searchSiteScnscYmdListBySite?coCd=${COMPANY_CD}&siteNo=${SITE_NO}`
  );
  if (!result || result.statusCode !== 0 || !result.data) {
    throw new Error(`날짜 목록 조회 실패: ${result && result.statusMessage}`);
  }
  return result.data.map(d => d.scnYmd);
}

async function fetchIMAXSessionsForDate(scnYmd) {
  const result = await fetchCGVJson(
    `/api/v1/booking/searchMovScnInfo?coCd=${COMPANY_CD}&siteNo=${SITE_NO}&scnYmd=${scnYmd}&rtctlScopCd=08`
  );
  if (!result || result.statusCode !== 0 || !result.data) {
    return [];
  }

  return result.data
    .filter(s => (s.scnsNm && s.scnsNm.includes(SCREEN_KEYWORD)) || (s.expoScnsNm && s.expoScnsNm.includes(SCREEN_KEYWORD)))
    .map(s => ({
      key: `${s.scnYmd}_${s.scnsNo}_${s.scnSseq}`,
      date: formatDate(s.scnYmd),
      screen: s.expoScnsNm || s.scnsNm,
      movie: s.expoProdNm || s.movNm || 'Unknown',
      startTime: formatTime(s.scnsrtTm),
      endTime: formatTime(s.scnendTm),
      availableSeats: parseInt(s.frSeatCnt, 10) || 0,
      totalSeats: parseInt(s.cpSeatCnt, 10) || parseInt(s.stcnt, 10) || 0,
      format: s.movkndDsplNm || ''
    }));
}

async function fetchAllIMAXSessions() {
  const dates = await fetchScheduleDates();
  const sessions = [];

  for (const scnYmd of dates) {
    const daySessions = await fetchIMAXSessionsForDate(scnYmd);
    sessions.push(...daySessions);
  }

  return sessions;
}

function sendTelegramMessage(message) {
  return new Promise((resolve, reject) => {
    if (!BOT_TOKEN || !CHAT_ID) {
      reject(new Error('텔레그램 설정 누락: TELEGRAM_BOT_TOKEN 또는 TELEGRAM_CHAT_ID를 .env에 입력해주세요.'));
      return;
    }

    const body = JSON.stringify({
      chat_id: CHAT_ID,
      text: message,
      parse_mode: 'HTML'
    });

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.ok) {
            resolve({ success: true, messageId: parsed.result.message_id });
          } else {
            reject(new Error(`텔레그램 오류: ${parsed.description}`));
          }
        } catch (error) {
          reject(new Error('응답 파싱 오류: ' + error.message));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000);
    req.write(body);
    req.end();
  });
}

// 텔레그램 메시지는 4096자 제한이 있어 초과분은 통째로 거부된다.
// 빈 줄 단위로 잘라 여러 개의 메시지로 나눠 보낸다 (내용 짤림 없음).
const TELEGRAM_MAX_LEN = 4000;

async function sendLongTelegramMessage(message) {
  const blocks = message.split('\n\n');
  const chunks = [];
  let current = '';

  for (const block of blocks) {
    const candidate = current ? current + '\n\n' + block : block;
    if (candidate.length > TELEGRAM_MAX_LEN && current) {
      chunks.push(current);
      current = block;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);

  const results = [];
  for (const chunk of chunks) {
    results.push(await sendTelegramMessage(chunk));
  }
  return results;
}

async function checkAndNotify() {
  const timestamp = new Date().toLocaleString('ko-KR');
  console.log(`[${timestamp}] 모니터링 시작...`);

  try {
    // 스케줄 조회
    const currentSessions = await fetchAllIMAXSessions();

    if (currentSessions.length === 0) {
      console.log('현재 사용 가능한 IMAX 회차가 없습니다.');
      return;
    }

    // 상태 로드
    const state = loadState();
    const seenKeys = new Set(Object.keys(state));
    const newKeys = new Set(currentSessions.map(s => s.key));

    // 신규 회차 감지
    const newSessions = currentSessions.filter(s => !seenKeys.has(s.key));

    if (newSessions.length > 0) {
      console.log(`\n📢 신규 회차 ${newSessions.length}개 감지!`);

      // 메시지 구성 (전체 회차 포함 — 길면 여러 메시지로 분할 전송)
      let message = `<b>[CGV] CGV 용산아이파크몰 IMAX 신규 예매 오픈 ${newSessions.length}건</b>\n\n`;

      newSessions.forEach(session => {
        message += `<b>${session.date} ${session.startTime}~${session.endTime}</b>\n`;
        message += `  ${escapeHtml(session.movie)}\n`;
        message += `  ${escapeHtml(session.screen)} · ${escapeHtml(session.format)} · 잔여 ${session.availableSeats}/${session.totalSeats}석\n\n`;
      });

      message += `<a href="https://www.cgv.co.kr/">CGV 예매 바로가기</a>`;

      // 텔레그램 발송 — 실패하면 state를 갱신하지 않고 다음 주기에 재시도한다.
      // (기존에는 실패해도 "알림 보낸 것"으로 저장되어 알림이 영원히 유실됐음)
      try {
        await sendLongTelegramMessage(message);
        console.log(`✓ 텔레그램 발송 완료 (${newSessions.length}건)`);
      } catch (error) {
        console.error('✗ 텔레그램 발송 오류:', error.message);
        console.error('  state를 갱신하지 않습니다 — 다음 실행에서 재시도합니다.');
        return;
      }
    } else {
      console.log('신규 회차 없음 (기존 회차만 존재)');
    }

    // 상태 업데이트 (현재 회차를 기준선으로)
    const newState = {};
    currentSessions.forEach(session => {
      newState[session.key] = true;
    });
    saveState(newState);

  } catch (error) {
    console.error('✗ 오류 발생:', error.message);
    // 첫 실행 오류는 무시 (상태 파일이 없을 수 있음)
    if (!fs.existsSync(STATE_FILE)) {
      console.log('첫 실행 감지 - 기준선 설정 후 대기합니다.');
    }
  }
}

async function dailyReport() {
  const timestamp = new Date().toLocaleString('ko-KR');
  console.log(`[${timestamp}] 일일 현황 보고 시작...`);

  try {
    // API 조회해서 현재 최신 정보 획득
    const currentSessions = await fetchAllIMAXSessions();

    if (currentSessions.length === 0) {
      const message = `📋 <b>[CGV 현황 보고] ${new Date().toLocaleDateString('ko-KR')}</b>\n\n현재 오픈 예매: 없음`;
      await sendTelegramMessage(message);
      console.log('현황 보고 완료 (오픈 예매 없음)');
      return;
    }

    // 날짜별로 정렬
    const sessionsByDate = {};
    currentSessions.forEach(session => {
      if (!sessionsByDate[session.date]) {
        sessionsByDate[session.date] = [];
      }
      sessionsByDate[session.date].push(session);
    });

    // 메시지 구성
    let message = `📋 <b>[CGV 현황 보고] ${new Date().toLocaleDateString('ko-KR')}</b>\n`;
    message += `현재 오픈 예매: ${currentSessions.length}건\n\n`;

    // 날짜순으로 정렬 — 전체 날짜/회차 포함 (길면 여러 메시지로 분할 전송)
    const sortedDates = Object.keys(sessionsByDate).sort();

    sortedDates.forEach(date => {
      message += `<b>${date}</b>\n`;
      sessionsByDate[date].forEach(session => {
        message += `  ${session.startTime} ${escapeHtml(session.movie)}\n`;
        message += `  잔여 ${session.availableSeats}/${session.totalSeats}석\n`;
      });
      message += '\n';
    });

    // 텔레그램 발송
    try {
      await sendLongTelegramMessage(message);
      console.log(`✓ 현황 보고 완료 (${currentSessions.length}건)`);
    } catch (error) {
      console.error('✗ 텔레그램 발송 오류:', error.message);
    }

  } catch (error) {
    console.error('✗ 오류 발생:', error.message);
  }
}

// 실행 모드 판별
const mode = process.argv[2] || 'monitor';

if (mode === 'report') {
  dailyReport();
} else {
  checkAndNotify();
}
