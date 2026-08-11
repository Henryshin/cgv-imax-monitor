// CGV 접근 가능 여부만 확인하는 최소 스크립트 (요청 1회)
// 차단 중인지 확인할 때 사용합니다:  node check.js
const https = require('https');

const env = {};
try {
  require('fs').readFileSync(require('path').join(__dirname, '.env'), 'utf8')
    .split('\n').forEach(l => {
      const [k, v] = l.trim().split('=').map(s => s && s.trim());
      if (k && !k.startsWith('#')) env[k] = v;
    });
} catch (e) { /* .env 없어도 됨 */ }

const SITE_NO = env.SITE_NO || '0013';
const CO_CD = env.COMPANY_CD || 'A420';

const req = https.request({
  hostname: 'cgv.co.kr',
  path: `/api/v1/booking/searchSiteScnscYmdListBySite?coCd=${CO_CD}&siteNo=${SITE_NO}`,
  method: 'GET',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    'Accept': 'application/json'
  }
}, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    if (data.trim().startsWith('{')) {
      const dates = (JSON.parse(data).data || []).length;
      console.log(`✅ 정상 (HTTP ${res.statusCode}) — 예매 가능 날짜 ${dates}일 조회됨`);
      console.log('   모니터가 정상 작동할 수 있는 상태입니다.');
    } else {
      console.log(`❌ 차단 중 (HTTP ${res.statusCode})`);
      console.log('   CGV가 이 IP를 일시 차단했습니다. 10~30분 뒤 다시 확인해보세요.');
      console.log('   그 사이에는 요청을 더 보내지 마세요 — 차단이 길어집니다.');
    }
  });
});

req.on('error', e => console.log('❌ 네트워크 오류:', e.message));
req.setTimeout(15000, () => { req.destroy(); console.log('❌ 시간 초과'); });
req.end();
