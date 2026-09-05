/* ══════════════════════════════════════════════════════════════════════════
   K-Clock — 배포판 소스 보호 빌드 (PND-0113)

   ⚠ 이 앱은 다른 K-앱과 구조가 다르다. 먼저 이것부터 읽을 것.
     K-Clock 은 Electron 이 아니라 Tauri 다. 화면(프런트엔드)은 `dist/` 폴더 하나이고,
     `src-tauri/tauri.conf.json` 의 `build.frontendDist` 가 그 폴더를 그대로 가리킨다.
     즉 `dist/` 는 "빌드 결과물"이 아니라 **손으로 쓴 원본 소스이면서 동시에 배포에
     그대로 실리는 파일**이다(중간 번들러가 없다). 그래서 "소스는 두고 빌드에서만
     지운다"를 하려면 폴더를 하나 더 만드는 수밖에 없다.

   무엇을 하는가
     ① `dist/` 를 읽어 `dist-protected/` 로 다시 쓴다(원본은 한 글자도 안 건드린다).
        · <style>  → 주석만 없앤다(값·순서·바이트는 그대로).
        · <script> → 주석을 없애고 **함수 안쪽 이름만** 바꾼다.
                     ⚠ 최상위(전역) 이름은 일부러 남긴다 — 아래 "왜 전역은 안 바꾸나".
        · HTML     → <!-- 주석 --> 을 파서로 없앤다(정규식 아님).
        · fonts/ · sounds/ → 그대로 나른다.
     ② `--build` 를 주면 이어서
        `tauri build --config src-tauri/tauri.protected.conf.json` 을 돌린다.
        그 설정 파일이 `frontendDist` 를 `../dist-protected` 로 바꿔 끼운다.

   ⚠ 정규식으로 주석을 지우지 않는다. 문자열 안의 "//"(주소 등)나 정규식 리터럴을
     주석으로 오인해 코드를 깨뜨리기 때문이다. JS 는 terser(진짜 파서), HTML 은
     html-minifier-terser(진짜 파서), CSS 는 아래의 상태기계 렉서를 쓴다.

   ── 왜 index.html 의 전역 이름은 안 바꾸나 ────────────────────────────────
   이 앱의 화면 코드는 별도 .js 파일이 아니라 index.html · about.html 안에 통째로
   들어 있고, 버튼이 `onclick="openPanel('alarm')"` 처럼 HTML 속성으로 전역 함수를
   부른다. 게다가 알람 목록·카운트다운 프리셋은 그 onclick 이 든 HTML 을 자바스크립트
   문자열(`` `...onclick="removeAlarm(${a.id})"...` ``)로 만들어 꽂는다.
   전역 이름을 바꾸면 그 문자열 속 이름은 같이 안 바뀌므로 **버튼이 조용히 죽는다.**
   "조용히 안 도는 것"이 가장 위험하므로 전역은 남기고 함수 안쪽만 바꾼다.
   ⇒ 없어지는 것: 주석 전부(설계 판단·형 요청 원문). 남는 것: 전역 함수 이름.

   ── K-Clock 특유의 주의점 (여기 틀리면 형 설정·알람이 날아간다) ───────────
     · mangle.properties 를 절대 쓰지 않는다. 저장 키(`clockSize`·`clockBrightness`·
       `alarms`·`cdPresets` …)와 Rust 커맨드 이름(`set_window_rect` …)은 전부
       **문자열**이고 terser 는 문자열을 건드리지 않지만, 속성 이름 바꾸기를 켜면
       `localStorage.setItem` 같은 접근 경로가 깨질 수 있다.
     · 저장 키는 `const LS_SIZE='clockSize'` 처럼 변수에 담겨 있다. 변수 **이름**이
       바뀌어도 담긴 **값**은 그대로라 저장된 설정은 그대로 읽힌다.
     · 이 앱은 eval / new Function / Function.name 을 한 곳도 쓰지 않는다
       (2026-09-05 전수 확인) — 이름을 바꿔도 참조가 깨질 다른 통로가 없다.

   ── 소스맵 ────────────────────────────────────────────────────────────────
     `sourcemaps/<버전>/` 에 남긴다. **`dist/` 안에 두면 안 된다** — 그 폴더가 통째로
     배포에 실려서 보호가 무의미해진다. `.gitignore` 로 저장소에서도 뺀다.

   사용법
     node build/protect.js            # dist-protected/ 만 만든다(검증용)
     node build/protect.js --build    # 만들고 tauri build 까지 돌린다
     npm run build:protected          # 위와 같음 (형에게 나가는 빌드는 반드시 이것)
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { minify: terserMinify } = require('terser');
const { minify: htmlMinify } = require('html-minifier-terser');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'dist-protected');
const CONF = path.join(ROOT, 'src-tauri', 'tauri.conf.json');
const PROT_CONF = path.join(ROOT, 'src-tauri', 'tauri.protected.conf.json');

/* <script>/<style> 를 안에 품은 파일 (전역 이름은 남긴다) */
const HTML_FILES = ['index.html', 'about.html'];
/* 그대로 나르는 것 */
const COPY_DIRS = ['fonts', 'sounds'];

/* ── CSS 주석 제거 (상태기계 렉서 — 정규식 아님) ───────────────────────
   CSS 에는 정규식 리터럴이 없으므로 신경 쓸 상태는 ' " 문자열과 주석뿐이다. */
function stripCssComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'") {
      const q = c;
      out += c; i++;
      while (i < n) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] || ''); i += 2; continue; }
        out += src[i];
        if (src[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      /* 주석 안의 줄바꿈 수는 유지한다 — 줄 번호가 밀리면 나중에 문제 위치를 못 찾는다 */
      const nl = src.slice(i, stop).split('\n').length - 1;
      out += '\n'.repeat(nl);
      i = stop;
      continue;
    }
    out += c; i++;
  }
  return out;
}

/* ── <tag> ... </tag> 블록을 순서대로 찾는다 (src= 가 붙은 <script> 는 건너뛴다) */
function findBlocks(src, tag) {
  const blocks = [];
  const openRe = new RegExp(`<${tag}(\\s[^>]*)?>`, 'gi');
  let m;
  while ((m = openRe.exec(src))) {
    const attrs = m[1] || '';
    const bodyStart = m.index + m[0].length;
    const closeIdx = src.toLowerCase().indexOf(`</${tag}>`, bodyStart);
    if (closeIdx < 0) continue;
    if (/\ssrc\s*=/i.test(attrs)) { openRe.lastIndex = closeIdx; continue; }
    blocks.push({ start: bodyStart, end: closeIdx, body: src.slice(bodyStart, closeIdx) });
    openRe.lastIndex = closeIdx;
  }
  return blocks;
}

/* 찾은 블록들을 뒤에서부터 갈아끼운다(앞에서 하면 인덱스가 밀린다) */
function replaceBlocks(src, blocks, newBodies) {
  let out = src;
  for (let i = blocks.length - 1; i >= 0; i--) {
    out = out.slice(0, blocks[i].start) + newBodies[i] + out.slice(blocks[i].end);
  }
  return out;
}

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }
function ensure(p) { fs.mkdirSync(p, { recursive: true }); }

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  ensure(to);
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.name === '.DS_Store') continue;
    const s = path.join(from, e.name);
    const d = path.join(to, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

async function main() {
  const doBuild = process.argv.includes('--build');
  const conf = JSON.parse(fs.readFileSync(CONF, 'utf8'));
  const mapOut = path.join(ROOT, 'sourcemaps', conf.version);

  console.log('[protect] 원본  =', SRC);
  console.log('[protect] 산출물 =', OUT);
  rmrf(OUT); ensure(OUT);
  rmrf(mapOut); ensure(mapOut);

  /* ── dist/ 안에 우리가 모르는 파일이 새로 생겼는지 확인 ──
     이 스크립트는 처리 목록을 못 박는 구조라, 새 파일이 생기면 조용히 빠진다.
     (K-Memo 에서 실제로 지적된 함정) 그래서 목록에 없는 것이 보이면 멈춘다. */
  const known = new Set([...HTML_FILES, ...COPY_DIRS, '.DS_Store']);
  const unknown = fs.readdirSync(SRC).filter((n) => !known.has(n));
  if (unknown.length) {
    throw new Error(
      `dist/ 에 처리 목록에 없는 항목이 있습니다: ${unknown.join(', ')}\n` +
      `→ build/protect.js 의 HTML_FILES 또는 COPY_DIRS 에 넣지 않으면 배포판에서 조용히 빠집니다.`);
  }

  /* ① HTML — 안의 <style>/<script> 를 먼저 손보고, 마지막에 HTML 주석 제거 */
  for (const rel of HTML_FILES) {
    const src = fs.readFileSync(path.join(SRC, rel), 'utf8');

    /* <style> — 주석만 제거 */
    const styles = findBlocks(src, 'style');
    let out = replaceBlocks(src, styles, styles.map((b) => stripCssComments(b.body)));

    /* <script> — 주석 제거 + 함수 안쪽 이름만 변경 */
    const scripts = findBlocks(out, 'script');
    const newScripts = [];
    for (let i = 0; i < scripts.length; i++) {
      const name = `${rel}#${i}`;
      const res = await terserMinify({ [name]: scripts[i].body }, {
        ecma: 2020,
        module: false,
        /* compress 는 하되 toplevel 은 손대지 않는다 — 안 쓰이는 것처럼 보이는
           전역 함수(실제로는 HTML 의 onclick 이 부른다)를 지워버리면 안 된다. */
        compress: { passes: 2, drop_debugger: true, toplevel: false },
        /* ⚠ toplevel: false — 위 "왜 전역은 안 바꾸나" 참고 */
        mangle: { toplevel: false },
        /* 속성 이름(mangle.properties)은 절대 건드리지 않는다 — 저장 키·Rust 커맨드 */
        format: { comments: false },
        sourceMap: { filename: name, url: false },
      });
      if (res.error) throw res.error;
      newScripts.push('\n' + res.code + '\n');
      fs.writeFileSync(path.join(mapOut, `${rel}.script${i}.map`), res.map, 'utf8');
      const b = Buffer.byteLength(scripts[i].body), a = Buffer.byteLength(res.code);
      console.log(`[protect] js   ${(rel + ' <script#' + i + '>').padEnd(26)} ${b} → ${a} (${(a / b * 100).toFixed(0)}%)`);
    }
    out = replaceBlocks(out, scripts, newScripts);

    /* HTML 주석 — 파서 기반 제거. 레이아웃에 영향 줄 수 있는 옵션은 전부 끈다. */
    out = await htmlMinify(out, {
      removeComments: true,
      collapseWhitespace: false,
      conservativeCollapse: false,
      minifyJS: false,
      minifyCSS: false,
      caseSensitive: true,
      keepClosingSlash: true,
      html5: true,
      /* 이 옵션이 없으면 파서가 disabled → disabled="disabled" 로 다시 써 버린다. */
      collapseBooleanAttributes: true,
      removeAttributeQuotes: false,
      removeEmptyAttributes: false,
      removeRedundantAttributes: false,
      sortAttributes: false,
      sortClassName: false,
    });

    fs.writeFileSync(path.join(OUT, rel), out, 'utf8');
    console.log(`[protect] html ${rel.padEnd(26)} ${Buffer.byteLength(src)} → ${Buffer.byteLength(out)}`);
  }

  /* ② 그대로 나르는 것 */
  for (const rel of COPY_DIRS) copyDir(path.join(SRC, rel), path.join(OUT, rel));

  console.log('[protect] 소스맵 보관 =', mapOut);
  console.log('[protect] dist-protected 준비 완료');

  if (doBuild) {
    if (!fs.existsSync(PROT_CONF)) throw new Error(`보호빌드 설정이 없습니다: ${PROT_CONF}`);

    /* 검사를 먼저 통과해야 빌드가 시작된다 — 검사를 깜빡하고 내보내는 일을 막는다.
       실패하면 여기서 예외가 나서 tauri build 까지 못 간다. */
    console.log('\n[protect] 보호 검사 실행…');
    execFileSync(process.execPath, [path.join(__dirname, 'verify_protected.js')],
      { cwd: ROOT, stdio: 'inherit' });

    /* 윈도우에서는 node_modules/.bin 의 실행 파일이 tauri.cmd 다 —
       확장자 없이 부르면 "명령을 찾을 수 없음"으로 CI 가 깨진다. */
    const bin = path.join(ROOT, 'node_modules', '.bin',
      process.platform === 'win32' ? 'tauri.cmd' : 'tauri');
    const extra = process.argv.slice(2).filter((a) => a !== '--build');
    console.log('\n[protect] tauri build 시작…', extra.join(' '));
    execFileSync(bin, ['build', '--config', PROT_CONF, ...extra],
      { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  }
}

/* 검사 스크립트(verify_protected.js)가 같은 렉서를 쓰도록 내보낸다 —
   두 벌로 나뉘면 "검사는 통과했는데 실제 산출물은 다른" 상황이 생긴다. */
module.exports = { stripCssComments, findBlocks, replaceBlocks, HTML_FILES, COPY_DIRS, SRC, OUT };

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
