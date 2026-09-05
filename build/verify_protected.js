/* ══════════════════════════════════════════════════════════════════════════
   K-Clock — 보호 빌드 검사 (PND-0113)

   `dist-protected/` 가 ⓐ개발 흔적을 정말 다 걷어냈는지 ⓑ앱을 깨뜨리지 않았는지
   기계로 대조한다. 사람이 눈으로 훑는 대신 스크립트가 대조하게 하는 것이 원칙이다.

   실행:  npm run verify:protected      (먼저 npm run protect 로 만들어 둘 것)

   ⚠ 이 검사가 전부 통과해도 "윈도우 실기에서 잘 돈다"는 뜻은 아니다.
     이름 뭉개기는 잘못돼도 조용히 안 돌기 때문에 형 실기 확인이 마지막 관문이다.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'dist-protected');
const HTML_FILES = ['index.html', 'about.html'];

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? '\n       ' + detail : ''}`); }
}

/* protect.js 의 렉서를 그대로 빌려 쓴다 — 두 벌로 나뉘면 서로 어긋난다 */
const { stripCssComments, findBlocks } = require('./protect.js');

if (!fs.existsSync(OUT)) {
  console.error('dist-protected/ 가 없습니다 — 먼저 `npm run protect` 를 실행하세요.');
  process.exit(1);
}

const srcAll = HTML_FILES.map((f) => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n');
const outAll = HTML_FILES.map((f) => fs.readFileSync(path.join(OUT, f), 'utf8')).join('\n');

console.log('\n── ① 개발 흔적이 남았는가 ──');

/* '형' 은 낱말로도 쓰인다(상주형·설치형·도형…). 호칭·인용만 걸러낸다. */
const HYUNG = /형(?:이|은|의|님|:)|형\s(?:요청|지시|원문|실기|실측|피드백|확인|발견|지적)/g;
check("개발 주석 속 '형' 호칭·인용", !HYUNG.test(outAll),
  (outAll.match(HYUNG) || []).slice(0, 5).join(' / '));

for (const [name, re] of [
  ['보류항목 번호(PND-)', /PND-\d/g],
  ['소스맵 링크(sourceMappingURL)', /sourceMappingURL/g],
  ['블록 주석 /* */', /\/\*/g],
  ['한글 줄 주석 // …', /^[ \t]*\/\/[^\n]*[가-힣]/gm],
]) {
  const hit = outAll.match(re) || [];
  check(name + ' 0건', hit.length === 0, hit.slice(0, 3).join(' / '));
}

/* 날짜 메모는 사용자에게 보여주는 변경 내역 날짜(UPDATE_NOTES)만 남아야 한다 */
const dates = [...outAll.matchAll(/20\d\d-\d\d-\d\d/g)].map((m) => m[0]);
const noteDates = [...srcAll.matchAll(/date\s*:\s*'(20\d\d-\d\d-\d\d)'/g)].map((m) => m[1]);
check(`날짜 메모는 변경 내역 날짜만 (${dates.length}건)`,
  dates.every((d) => noteDates.includes(d)),
  dates.filter((d) => !noteDates.includes(d)).join(' / '));

console.log('\n── ② 이름을 실제로 뭉갰는가 ──');
for (const f of HTML_FILES) {
  const o = fs.readFileSync(path.join(SRC, f), 'utf8');
  const p = fs.readFileSync(path.join(OUT, f), 'utf8');
  const os = findBlocks(o, 'script'), ps = findBlocks(p, 'script');
  const ob = os.map((b) => b.body).join('\n'), pb = ps.map((b) => b.body).join('\n');
  check(`${f} <script> 가 줄어듦 (${Buffer.byteLength(ob)} → ${Buffer.byteLength(pb)})`,
    Buffer.byteLength(pb) < Buffer.byteLength(ob) * 0.85);
  const oLines = ob.split('\n').length, pLines = pb.split('\n').length;
  check(`${f} <script> 줄 수가 뭉개짐 (${oLines}줄 → ${pLines}줄)`, pLines < oLines / 5);
}

console.log('\n── ③ 앱을 깨뜨리지 않았는가 ──');

/* HTML 이 이름으로 부르는 전역 함수 — 하나라도 사라지면 버튼이 조용히 죽는다 */
const RESERVED = new Set(['if', 'for', 'while', 'switch', 'return', 'typeof', 'new', 'do']);
const globals = new Set(
  [...srcAll.matchAll(/on(?:click|change|input|keydown|mousedown|dblclick)=\\?["']([A-Za-z_$][\w$]*)\(/g)]
    .map((m) => m[1]).filter((n) => !RESERVED.has(n)));
const deadGlobals = [...globals].filter(
  (n) => !new RegExp(`(?:function\\s+${n}\\b|\\b${n}\\s*=)`).test(outAll));
check(`HTML 이 부르는 전역 함수 ${globals.size}개가 보호본에도 있음`,
  deadGlobals.length === 0, '사라진 것: ' + deadGlobals.join(', '));

/* Rust 커맨드 이름 — 바뀌면 창 이동·알람소리·업데이트가 통째로 죽는다 */
const inv = (s) => new Set([...s.matchAll(/invoke\(\s*['"]([a-z_]+)['"]/g)].map((m) => m[1]));
const iS = inv(srcAll), iP = inv(outAll);
check(`Rust 커맨드 이름 ${iS.size}개 그대로`,
  iS.size === iP.size && [...iS].every((k) => iP.has(k)),
  [...iS].filter((k) => !iP.has(k)).join(', '));

/* 저장 키 — 바뀌면 형이 저장해 둔 알람·설정이 통째로 날아간다 */
const keys = (s) => new Set([
  ...[...s.matchAll(/localStorage\.\w+\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
  ...[...s.matchAll(/['"](clock(?:Size|Brightness|Style|ShowSec|Tz))['"]/g)].map((m) => m[1]),
]);
const kS = keys(srcAll), kP = keys(outAll);
check(`저장 키 ${kS.size}개 그대로 (알람·프리셋·크기·밝기·폰트·초표시·시간대)`,
  [...kS].every((k) => kP.has(k)), [...kS].filter((k) => !kP.has(k)).join(', '));

/* 화면 요소 id — HTML 뼈대는 손대지 않았어야 한다.
   ⚠ `id="edit-time-${a.id}"` 처럼 자바스크립트가 그때그때 만들어 붙이는 id 는 뺀다.
      그 안의 변수 이름(`a`)은 뭉개져도 되는 것이고(같은 함수 안에서 함께 바뀐다),
      실행될 때 만들어지는 실제 id 문자열은 그대로다. */
const ids = (s) => new Set([...s.matchAll(/\sid="([^"]+)"/g)]
  .map((m) => m[1]).filter((v) => !v.includes('${')));
const dS = ids(srcAll), dP = ids(outAll);
check(`화면 요소 id ${dS.size}개 그대로`,
  dS.size === dP.size && [...dS].every((k) => dP.has(k)),
  [...dS].filter((k) => !dP.has(k)).join(', '));

/* <style> 은 '주석만 뺀 원본' 과 완전히 같아야 한다 */
for (const f of HTML_FILES) {
  const o = findBlocks(fs.readFileSync(path.join(SRC, f), 'utf8'), 'style');
  const p = findBlocks(fs.readFileSync(path.join(OUT, f), 'utf8'), 'style');
  const norm = (s) => s.replace(/\n+/g, '\n').trim();
  check(`${f} <style> 은 주석만 뺀 원본과 완전 동일`,
    o.length === p.length && o.every((b, i) => norm(stripCssComments(b.body)) === norm(p[i].body)));
}

/* 나르기로 한 것이 다 있는가 */
for (const d of ['fonts', 'sounds']) {
  const a = fs.existsSync(path.join(SRC, d)) ? fs.readdirSync(path.join(SRC, d)).length : -1;
  const b = fs.existsSync(path.join(OUT, d)) ? fs.readdirSync(path.join(OUT, d)).length : -1;
  check(`${d}/ 파일 ${a}개 그대로 실림`, a === b && a > 0);
}

console.log(`\n결과: ${pass}건 통과 / ${fail}건 실패`);
if (fail) {
  console.log('⚠ 실패가 있으면 이 빌드는 형에게 보내지 않는다.');
  process.exit(1);
}
console.log('⚠ 통과했어도 윈도우 실기 확인 전에는 정식배포하지 않는다.');
