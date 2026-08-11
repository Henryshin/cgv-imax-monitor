// CGV API 진단 스크립트
// 여러 요청 방식을 순서대로 시도해서 어떤 것이 JSON을 돌려주는지 확인합니다.
//   node diagnose.js
const https = require('https');

const SITE_NO = '0013';
const CO_CD = 'A420';

const MINIMAL = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'Accept': 'application/json'
};

const BROWSER = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': 'https://cgv.co.kr/cnm/movieBook/ticket',
  'Origin': 'https://cgv.co.kr',
  'X-Requested-With': 'XMLHttpRequest',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'Connection': 'keep-alive'
};

const HTML_LIKE = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9'
};

function request(hostname, path, headers) {
  return new Promise((resolve) => {
    const req = https.request({ hostname, path, method: 'GET', headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({
        status: res.statusCode,
        type: res.headers['content-type'] || '',
        body: data
      }));
    });
    req.on('error', (e) => resolve({ status: 0, type: '', body: 'ERROR: ' + e.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ status: 0, type: '', body: 'ERROR: timeout' }); });
    req.end();
  });
}

const TESTS = [
  { name: '1. 날짜목록 / 기존 헤더', host: 'cgv.co.kr',
    path: `/api/v1/booking/searchSiteScnscYmdListBySite?coCd=${CO_CD}&siteNo=${SITE_NO}`, headers: MINIMAL },
  { name: '2. 날짜목록 / 브라우저 헤더', host: 'cgv.co.kr',
    path: `/api/v1/booking/searchSiteScnscYmdListBySite?coCd=${CO_CD}&siteNo=${SITE_NO}`, headers: BROWSER },
  { name: '3. 날짜목록 / www 도메인', host: 'www.cgv.co.kr',
    path: `/api/v1/booking/searchSiteScnscYmdListBySite?coCd=${CO_CD}&siteNo=${SITE_NO}`, headers: BROWSER },
  { name: '4. 예매 페이지 접근 가능?', host: 'cgv.co.kr',
    path: '/cnm/movieBook/ticket', headers: HTML_LIKE },
  { name: '5. 극장목록 API', host: 'cgv.co.kr',
    path: `/api/v1/theater/searchTheaterList?coCd=${CO_CD}`, headers: BROWSER }
];

(async () => {
  console.log('=== CGV API 진단 ===\n');
  for (const t of TESTS) {
    const r = await request(t.host, t.path, t.headers);
    const head = r.body.trim().slice(0, 160).replace(/\s+/g, ' ');
    const isJson = r.body.trim().startsWith('{') || r.body.trim().startsWith('[');
    console.log(`${t.name}`);
    console.log(`   https://${t.host}${t.path.split('?')[0]}`);
    console.log(`   HTTP ${r.status} | ${r.type.split(';')[0]} | ${isJson ? '✅ JSON' : '❌ JSON 아님'}`);
    console.log(`   ${head}\n`);
  }
  console.log('=== 진단 끝 — 위 내용을 그대로 복사해서 알려주세요 ===');
})();
