// 일자별 스케줄 API(searchMovScnInfo) 전용 진단
// 날짜 목록은 되는데 스케줄 조회만 403일 때, 어떤 조건이 필요한지 찾습니다.
//   node diagnose-schedule.js
const https = require('https');

const SITE_NO = '0013';
const CO_CD = 'A420';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const MINIMAL = { 'User-Agent': UA, 'Accept': 'application/json' };

function request(path, headers) {
  return new Promise((resolve) => {
    const req = https.request({ hostname: 'cgv.co.kr', path, method: 'GET', headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', e => resolve({ status: 0, body: 'ERROR: ' + e.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ status: 0, body: 'ERROR: timeout' }); });
    req.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('=== 스케줄 API 진단 ===\n');

  // 먼저 날짜 목록에서 실제 날짜 하나를 가져온다.
  const dateRes = await request(`/api/v1/booking/searchSiteScnscYmdListBySite?coCd=${CO_CD}&siteNo=${SITE_NO}`, MINIMAL);
  if (!dateRes.body.trim().startsWith('{')) {
    console.log(`❌ 날짜 목록조차 실패 (HTTP ${dateRes.status}) — IP 전체가 차단된 상태입니다.`);
    console.log('   30분 뒤 다시 시도해주세요.');
    return;
  }
  const dates = JSON.parse(dateRes.body).data.map(d => d.scnYmd);
  const ymd = dates[0];
  console.log(`✅ 날짜 목록 정상 — ${dates.length}일 (테스트 날짜: ${ymd})\n`);

  const base = `/api/v1/booking/searchMovScnInfo?coCd=${CO_CD}&siteNo=${SITE_NO}&scnYmd=${ymd}`;

  const TESTS = [
    { name: 'A. 현재 방식 (rtctlScopCd=08)', path: `${base}&rtctlScopCd=08`, headers: MINIMAL },
    { name: 'B. rtctlScopCd 없이', path: base, headers: MINIMAL },
    { name: 'C. rtctlScopCd=01', path: `${base}&rtctlScopCd=01`, headers: MINIMAL },
    { name: 'D. Referer 추가', path: `${base}&rtctlScopCd=08`,
      headers: { ...MINIMAL, 'Referer': 'https://cgv.co.kr/cnm/movieBook/ticket' } },
    { name: 'E. 파라미터 순서 변경', path:
      `/api/v1/booking/searchMovScnInfo?siteNo=${SITE_NO}&coCd=${CO_CD}&scnYmd=${ymd}&rtctlScopCd=08`, headers: MINIMAL },
    { name: 'F. 날짜 목록 재확인 (차단 진행 여부)', path:
      `/api/v1/booking/searchSiteScnscYmdListBySite?coCd=${CO_CD}&siteNo=${SITE_NO}`, headers: MINIMAL }
  ];

  for (const t of TESTS) {
    await sleep(2000);
    const r = await request(t.path, t.headers);
    const ok = r.body.trim().startsWith('{');
    let detail = r.body.trim().slice(0, 120).replace(/\s+/g, ' ');
    if (ok) {
      const j = JSON.parse(r.body);
      detail = `statusCode=${j.statusCode} "${j.statusMessage}" 상영정보 ${(j.data || []).length}건`;
    }
    console.log(`${t.name}`);
    console.log(`   HTTP ${r.status} | ${ok ? '✅ JSON' : '❌ HTML/차단'}`);
    console.log(`   ${detail}\n`);
  }

  console.log('=== 진단 끝 — 위 내용을 그대로 복사해서 알려주세요 ===');
})();
