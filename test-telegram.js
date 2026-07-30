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

function sendTestMessage() {
  return new Promise((resolve, reject) => {
    if (!BOT_TOKEN || !CHAT_ID) {
      console.error('❌ 텔레그램 설정 누락');
      console.error('   .env 파일에 다음을 입력해주세요:');
      console.error('   TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN');
      console.error('   TELEGRAM_CHAT_ID=YOUR_CHAT_ID');
      process.exit(1);
    }

    const message = JSON.stringify({
      chat_id: CHAT_ID,
      text: '🤖 CGV IMAX 모니터 테스트 메시지\n\n설정이 정상적으로 완료되었습니다.',
      parse_mode: 'HTML'
    });

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(message)
      }
    };

    console.log('📤 테스트 메시지 전송 중...\n');

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.ok) {
            console.log('✅ 전송 성공!\n');
            console.log('텔레그램에서 메시지를 확인해주세요.');
            resolve();
          } else {
            console.error('❌ 전송 실패');
            console.error('오류:', parsed.description);
            reject(new Error(parsed.description));
          }
        } catch (error) {
          console.error('❌ 응답 처리 오류:', error.message);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ 네트워크 오류:', error.message);
      reject(error);
    });

    req.setTimeout(10000);
    req.write(message);
    req.end();
  });
}

sendTestMessage().catch(() => process.exit(1));
