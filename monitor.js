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
const SCREEN_KEYWORD = env.SCREEN_KEYWORD || 'IMAX';
const STATE_FILE = path.join(__dirname, 'state.json');

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

function fetchCGVSchedule() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.cgv.co.kr',
      path: `/api/v1/theaters/${SITE_NO}/schedules?days=22`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
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

function extractIMAXSessions(schedules) {
  const newSessions = [];

  if (!schedules || !schedules.data) {
    return newSessions;
  }

  schedules.data.forEach(day => {
    if (!day.screens) return;

    day.screens.forEach(screen => {
      if (screen.screenName && screen.screenName.includes(SCREEN_KEYWORD)) {
        screen.sessions.forEach(session => {
          const key = `${day.date}_${screen.screenName}_${session.startTime}`;
          newSessions.push({
            key,
            date: day.date,
            screen: screen.screenName,
            movie: session.movieName || 'Unknown',
            startTime: session.startTime,
            endTime: session.endTime,
            availableSeats: session.availableSeats || 0,
            totalSeats: session.totalSeats || 0,
            format: screen.screenFormat || ''
          });
        });
      }
    });
  });

  return newSessions;
}

function sendTelegramMessage(message) {
  return new Promise((resolve, reject) => {
    if (!BOT_TOKEN || !CHAT_ID) {
      reject(new Error('텔레그램 설정 누락: TELEGRAM_BOT_TOKEN 또는 TELEGRAM_CHAT_ID를 .env에 입력해주세요.'));
      return;
    }

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(message)
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
    req.write(JSON.stringify({
      chat_id: CHAT_ID,
      text: message,
      parse_mode: 'HTML'
    }));
    req.end();
  });
}

async function checkAndNotify() {
  const timestamp = new Date().toLocaleString('ko-KR');
  console.log(`[${timestamp}] 모니터링 시작...`);

  try {
    // 스케줄 조회
    const schedules = await fetchCGVSchedule();
    const currentSessions = extractIMAXSessions(schedules);

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

      // 메시지 구성
      let message = `<b>[CGV] CGV 용산아이파크몰 IMAX 신규 예매 오픈 ${newSessions.length}건</b>\n\n`;

      newSessions.slice(0, 10).forEach(session => {
        message += `<b>${session.date} ${session.startTime}~${session.endTime}</b>\n`;
        message += `  ${session.movie}\n`;
        message += `  ${session.screen} · ${session.format} · 잔여 ${session.availableSeats}/${session.totalSeats}석\n\n`;
      });

      if (newSessions.length > 10) {
        message += `\n... 외 ${newSessions.length - 10}건`;
      }

      message += `\n<a href="https://www.cgv.co.kr/">CGV 예매 바로가기</a>`;

      // 텔레그램 발송
      try {
        const result = await sendTelegramMessage(message);
        console.log(`✓ 텔레그램 발송 완료 (메시지 ID: ${result.messageId})`);
      } catch (error) {
        console.error('✗ 텔레그램 발송 오류:', error.message);
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
    // 현재 상태 로드
    const state = loadState();
    const stateKeys = Object.keys(state);

    if (stateKeys.length === 0) {
      console.log('보고할 데이터가 없습니다.');
      return;
    }

    // API 재조회해서 현재 최신 정보 획득
    const schedules = await fetchCGVSchedule();
    const currentSessions = extractIMAXSessions(schedules);

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

    // 날짜순으로 정렬
    const sortedDates = Object.keys(sessionsByDate).sort();

    sortedDates.slice(0, 7).forEach(date => {
      message += `<b>${date}</b>\n`;
      sessionsByDate[date].slice(0, 5).forEach(session => {
        message += `  ${session.startTime} ${session.movie}\n`;
        message += `  잔여 ${session.availableSeats}/${session.totalSeats}석\n`;
      });
      if (sessionsByDate[date].length > 5) {
        message += `  ... 외 ${sessionsByDate[date].length - 5}건\n`;
      }
      message += '\n';
    });

    if (sortedDates.length > 7) {
      message += `... 외 ${sortedDates.length - 7}일`;
    }

    // 텔레그램 발송
    try {
      const result = await sendTelegramMessage(message);
      console.log(`✓ 현황 보고 완료 (메시지 ID: ${result.messageId})`);
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
