// K-Clock 1.4.5-1 시험 (PND-0412·PND-0332) — 맥에서 실제 dist/index.html 을 크로미움으로 띄워 잰다.
// 실행: node tests/kclock_1451.test.cjs [사진 폴더]
// 타우리(window.__TAURI__)가 없는 브라우저라 창 크기·화면 읽기·알람 소리는 빠진다 — 화면·논리만 본다.
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/Users/openclaw-mini/.openclaw/workspace/node_modules/playwright');

const DIST = path.join(__dirname, '..', 'dist', 'index.html');
const SHOT_DIR = process.argv[2] || null;
let pass = 0, fail = 0;
const results = [];
function ok(cond, name, extra) {
  if (cond) { pass++; results.push('PASS ' + name + (extra ? ' — ' + extra : '')); }
  else { fail++; results.push('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

// ── 1) 순수 함수: 소스에서 그대로 떼어 실행 ──
const src = fs.readFileSync(DIST, 'utf8').replace(/\r\n/g, '\n');
function grab(re, name) { const m = src.match(re); if (!m) throw new Error('못 찾음: ' + name); return m[0]; }
const code = [
  grab(/const CD_UP_MAX=[^\n]*\n/, 'CD_UP_MAX'),
  grab(/function cdPlanStart\(st, inputSec\)\{[\s\S]*?\n\}\n/, 'cdPlanStart'),
  grab(/function cdStep\(mode, remain, elapsed\)\{[\s\S]*?\n\}\n/, 'cdStep'),
  grab(/function cdFmt\(sec\)\{[\s\S]*?\n\}\n/, 'cdFmt'),
  grab(/function clockLevels\(b\)\{[\s\S]*?\n\}\n/, 'clockLevels'),
].join('\n');
const L = new Function(code + '\nreturn {CD_UP_MAX,cdPlanStart,cdStep,cdFmt,clockLevels};')();

ok(L.CD_UP_MAX === 359999, '위로 세기 상한 = 99:59:59', L.cdFmt(L.CD_UP_MAX));
let p = L.cdPlanStart({ running: false, mode: 'down', remain: 0, elapsed: 0 }, 0);
ok(p.run && p.mode === 'up' && p.elapsed === 0, '00:00:00 에서 시작 → 위로 세기');
p = L.cdPlanStart({ running: false, mode: 'down', remain: 0, elapsed: 0 }, 90);
ok(p.run && p.mode === 'down' && p.remain === 90, '시간 넣고 시작 → 거꾸로 세기(그대로)');
p = L.cdPlanStart({ running: false, mode: 'up', remain: 0, elapsed: 42 }, 0);
ok(p.run && p.mode === 'up' && p.elapsed === 42, '위로 세다 멈춘 것 이어 세기');
p = L.cdPlanStart({ running: false, mode: 'up', remain: 0, elapsed: 42 }, 90);
ok(p.mode === 'up' && p.elapsed === 42, '위로 세다 멈춘 뒤 입력칸이 바뀌어도 이어 세기(초기화로만 바뀜)');
p = L.cdPlanStart({ running: false, mode: 'down', remain: 30, elapsed: 0 }, 90);
ok(p.mode === 'down' && p.remain === 30, '거꾸로 세다 멈춘 것 이어 세기(그대로)');
p = L.cdPlanStart({ running: true, mode: 'up', remain: 0, elapsed: 5 }, 0);
ok(!p.run, '도는 중 시작 다시 눌러도 그대로');
let st = L.cdStep('up', 0, 0);
ok(st.elapsed === 1 && !st.done && !st.alarm, '위로 1초');
st = L.cdStep('up', 0, L.CD_UP_MAX - 1);
ok(st.elapsed === L.CD_UP_MAX && st.done && !st.alarm, '상한에서 멈춤, 알람 없음');
st = L.cdStep('down', 1, 0);
ok(st.remain === 0 && !st.done, '거꾸로 1→0 (알람은 다음 박자, 예전과 같음)');
st = L.cdStep('down', 0, 0);
ok(st.done && st.alarm, '거꾸로 0 → 알람');
// ㉡ 밝기
const lv = (b) => { const r = L.clockLevels(b); return r.light + '/' + r.dark; };
ok(lv(220) === '220/35', '밝기 220 → 220/35 (그대로)');
ok(lv(35) === '220/35', '밝기 35 → 220/35 (그대로)');
ok(lv(128) === '170/85', '밝기 128 → 170/85 (예전 220/35, PND-0332 ㉡)', lv(128));
ok(lv(100) === '170/85' && lv(169) === '170/85' && lv(170) === '170/85', '86~169 구간은 170/85');
ok(lv(NaN) === '220/35', '이상값 → 220/35');

// ── 2) 화면 ──
function lum(c) { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); }
function ratio(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
// 패널 50% 를 바탕화면(어두움 #303746 / 밝음 #c4c9d0) 위에 얹은 합성 바탕 — 시안과 같은 기준
const BG = { dark: [24, 28, 35], light: [226, 228, 232] };
const DESK = { dark: '#303746', light: '#c4c9d0' };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 340, height: 520 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    const now = Date.now();
    localStorage.setItem('alarms', JSON.stringify([
      { id: 1, t: '07:00', name: '기상', enabled: true, repeat: true, days: [1, 2, 3, 4, 5], sound: 'sounds/happy_bells.wav' },
      { id: 2, t: '16:29', name: '알람', enabled: false, repeat: false, days: [], sound: 'sounds/happy_bells.wav' },
      { id: 3, t: '23:30', name: '정리', enabled: true, repeat: true, days: [0, 1, 2, 3, 4, 5, 6], sound: 'sounds/happy_bells.wav' },
    ]));
  });
  await page.clock.install();
  await page.goto('file://' + DIST);
  await page.evaluate(() => document.fonts.ready);
  ok(errors.length === 0, '페이지 오류 없음', errors.join(' | '));

  async function setDesk(mode) {
    await page.evaluate(([m, c]) => {
      document.documentElement.style.background = c;
      document.body.style.background = c;
      changePanelColor(m === 'light' ? 'white' : 'black');
      // 글자색 자동이 고를 시계 밝기(밝은 바탕 → 어두운 글자)
      setClockAuto(false);   // 브라우저엔 화면 읽기가 없으니 자동이 고를 값을 손으로 넣는다
      changeBrightness(m === 'light' ? 35 : 220);
    }, [mode, DESK[mode]]);
    await page.waitForTimeout(900);   // 색 전환(실제 시간 0.6초)이 끝난 뒤 잰다
  }
  async function shot(name, sel) {
    if (!SHOT_DIR) return;
    const el = await page.$(sel);
    const bb = await el.boundingBox();
    await page.screenshot({ path: path.join(SHOT_DIR, name), clip: { x: 0, y: 0, width: 340, height: Math.ceil(bb.y + bb.height + 14) } });
  }

  await page.evaluate(() => openPanel('alarm'));
  await page.clock.runFor(50);

  // 글꼴
  const font = await page.evaluate(() => ({
    fam: getComputedStyle(document.querySelector('#alarm-list .alarm-item .al-t')).fontFamily,
    w: getComputedStyle(document.querySelector('#alarm-list .alarm-item .al-t')).fontWeight,
    nw: getComputedStyle(document.querySelector('#alarm-list .alarm-item .al-n')).fontWeight,
    tnum: getComputedStyle(document.querySelector('#alarm-list .alarm-item .al-t')).fontVariantNumeric,
    loaded: document.fonts.check('700 13px "Pretendard KR"') && document.fonts.check('400 13px "Pretendard KR"'),
    sel: getComputedStyle(document.querySelector('#alarm-list .alarm-item')).userSelect,
  }));
  ok(/Pretendard KR/.test(font.fam) && font.w === '700' && font.nw === '400' && /tabular-nums/.test(font.tnum), '알람 글꼴 = 시안 A(Pretendard 시간 700 tnum·이름 400)', JSON.stringify(font));
  ok(font.loaded, 'Pretendard 글꼴 파일 읽힘');
  ok(font.sel === 'none', '알람 줄 글씨 선택 안 됨');

  for (const mode of ['dark', 'light']) {
    await setDesk(mode);
    await page.clock.runFor(800);
    const vals = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('#alarm-list .alarm-item').forEach((it) => {
        const st = it.classList.contains('on') ? 'on' : 'off';
        for (const [n, sel] of [['시간', '.al-t'], ['이름', '.al-n'], ['요일', '.alarm-days-tag']]) {
          const e = it.querySelector(sel); const cs = getComputedStyle(e);
          out.push({ st, n, color: cs.color, bg: cs.backgroundColor });
        }
      });
      return out;
    });
    const parse = (s) => s.match(/[\d.]+/g).map(Number);
    const min = {};
    for (const v of vals) {
      const c = parse(v.color); const b = parse(v.bg);
      const base = BG[mode];
      const back = (b.length >= 4 && b[3] === 0) ? base : [0, 1, 2].map((i) => b[i] * (b[3] ?? 1) + base[i] * (1 - (b[3] ?? 1)));
      const r = ratio(c, back); const k = v.st + '·' + v.n;
      min[k] = Math.min(min[k] ?? 99, r);
    }
    const fmt = Object.entries(min).map(([k, r]) => k + ' ' + r.toFixed(2)).join(', ');
    ok(['on·시간', 'on·이름', 'on·요일'].every((k) => min[k] >= 7), `켜짐 대비 ≥ 7 (${mode})`, fmt);
    // 1.4.5-2 2차(형 46110 «해제된 알람은 좀 더 연하게»): 꺼진 줄은 일부러 가라앉힘 — 읽을 수 있는 선(3.0 이상)·켜짐(4.5 이상)보다 확실히 낮게(켜짐의 1/3 이하)
    ok(['off·시간', 'off·이름', 'off·요일'].every((k) => min[k] >= 3.0 && min[k] < 4.0 && min[k] * 3 <= min['on·시간']), `꺼짐 대비 3.0~4.0(읽히되 켜짐과 확실히 구분) (${mode})`, fmt);
    const diff = vals.find((v) => v.st === 'on' && v.n === '이름').color !== vals.find((v) => v.st === 'off' && v.n === '이름').color;
    ok(diff, `켜짐·꺼짐 글씨색이 다름 (${mode}) — 예전엔 같았음`);
    await shot(`app_alarm_${mode}_v2.png`, '#panel-alarm');
  }

  // 스위치: 그 자리에서 바뀌고(목록 다시 안 그림), 동그라미가 미끄러진다
  await setDesk('dark');
  const before = await page.evaluate(() => {
    const b = document.querySelector('#alarm-list .alarm-toggle[data-id="2"]');
    window.__swNode = b;
    return { left: getComputedStyle(b.querySelector('.kn')).left, aria: b.getAttribute('aria-checked') };
  });
  await page.click('#alarm-list .alarm-toggle[data-id="2"]');
  // CSS 움직임은 가짜 시계가 아니라 실제 시간으로 돈다 → 실제로 기다린다
  await page.waitForTimeout(150);
  const mid = await page.evaluate(() => getComputedStyle(document.querySelector('#alarm-list .alarm-toggle[data-id="2"] .kn')).left);
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => {
    const b = document.querySelector('#alarm-list .alarm-toggle[data-id="2"]');
    return { same: b === window.__swNode, left: getComputedStyle(b.querySelector('.kn')).left, tr: getComputedStyle(b.querySelector('.kn')).transform, aria: b.getAttribute('aria-checked'),
      row: b.closest('.alarm-item').className, saved: JSON.parse(localStorage.getItem('alarms')).find((a) => a.id === 2).enabled };
  });
  ok(after.same, '스위치 누르면 그 줄만 바뀜(같은 요소 — 움직임이 보임)');
  ok(parseFloat(before.left) === 5 && parseFloat(after.left) === 21 && after.aria === 'true' && /\bon\b/.test(after.row) && after.saved === true, '꺼짐→켜짐: 동그라미 5px→21px(홈 3+여백 2 → 3+30−10−2)·aria·줄 클래스·저장', `${before.left}→${mid}→${after.left}`);
  // rotate(220deg) = matrix(cos220, sin220, -sin220, cos220, 0, 0) ≈ (-0.766, -0.643, 0.643, -0.766)
  const m = (after.tr.match(/-?[\d.]+/g) || []).map(Number);
  ok(m.length >= 4 && Math.abs(m[0] + 0.766) < 0.01 && Math.abs(m[1] + 0.643) < 0.01, '켜짐 동그라미 220도 회전 적용', after.tr);
  ok(parseFloat(mid) > 5 && parseFloat(mid) < 21, '0.15초 때 동그라미가 가는 중(미끄러짐)', mid);
  // 누를 때마다 정확히 한 번(5번)
  let flips = 0, prev = after.aria;
  for (let i = 0; i < 5; i++) {
    await page.click('#alarm-list .alarm-toggle[data-id="2"]');
    await page.clock.runFor(350); await page.waitForTimeout(30);
    const a = await page.evaluate(() => document.querySelector('#alarm-list .alarm-toggle[data-id="2"]').getAttribute('aria-checked'));
    if (a !== prev) flips++; prev = a;
  }
  ok(flips === 5, '스위치 5번 눌러 5번 바뀜', String(flips));
  // 키보드: Tab 으로 가면 테두리(포커스 링), Space 로 바뀜
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); document.querySelector('#alarm-list .alarm-label').setAttribute('tabindex', '-1'); });
  await page.focus('#alarm-list .alarm-toggle[data-id="1"]');
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
  const fv = await page.evaluate(() => { const b = document.querySelector('#alarm-list .alarm-toggle[data-id="1"]'); return { fv: b.matches(':focus-visible'), sh: getComputedStyle(b).boxShadow }; });
  ok(fv.fv && /0px 0px 0px 2px/.test(fv.sh), '키보드 포커스에 금색 테두리', fv.sh.slice(0, 80));
  const a1 = await page.evaluate(() => document.querySelector('#alarm-list .alarm-toggle[data-id="1"]').getAttribute('aria-checked'));
  await page.keyboard.press('Space');
  await page.clock.runFor(350); await page.waitForTimeout(30);
  const a2 = await page.evaluate(() => document.querySelector('#alarm-list .alarm-toggle[data-id="1"]').getAttribute('aria-checked'));
  ok(a1 !== a2, 'Space 로 스위치 켜고 끄기');
  await page.keyboard.press('Space'); await page.clock.runFor(350); await page.waitForTimeout(30);
  // 마우스로 누른 뒤엔 테두리 없음
  await page.click('#alarm-list .alarm-toggle[data-id="3"]'); await page.clock.runFor(350); await page.waitForTimeout(30);
  const mfv = await page.evaluate(() => document.querySelector('#alarm-list .alarm-toggle[data-id="3"]').matches(':focus-visible'));
  ok(!mfv, '마우스로 누른 뒤 포커스 테두리 없음');
  await page.click('#alarm-list .alarm-toggle[data-id="3"]'); await page.clock.runFor(350); await page.waitForTimeout(30);

  // ㉢ 이름 칸 Enter 누르고 있기
  const n0 = await page.evaluate(() => alarms.length);
  await page.evaluate(() => {
    const inp = document.getElementById('alarm-name'); inp.value = '반복';
    const fire = (rep) => inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: rep, bubbles: true, cancelable: true }));
    fire(false); for (let i = 0; i < 20; i++) fire(true);
  });
  const n1 = await page.evaluate(() => alarms.length);
  ok(n1 - n0 === 1, 'Enter 누르고 있어도 알람 한 개만 추가(PND-0332 ㉢)', `${n1 - n0}개`);
  await page.evaluate(() => { alarms.pop(); saveAlarms(); renderAlarms(); });

  // ── 카운트 ──
  const names = await page.evaluate(() => ({
    title: document.querySelector('#panel-countdown .panel-title').textContent,
    menu: [...document.querySelectorAll('#ctx-menu .menu-item')].map((m) => m.textContent.trim()),
    any: document.body.innerHTML.includes('카운트다운</div>'),
  }));
  ok(names.title === '카운트' && names.menu.includes('카운트') && !names.any, '이름 «카운트»(창 제목·메뉴)', JSON.stringify(names.menu));
  await page.evaluate(() => openPanel('countdown'));
  await page.evaluate(() => { cdReset(); ['cd-h', 'cd-m', 'cd-s'].forEach((id) => document.getElementById(id).value = ''); });
  await page.click('#panel-countdown .cd-btns button:nth-child(1)');
  await page.clock.runFor(7000);
  let d = await page.textContent('#cd-display');
  ok(d === '00:00:07', '00:00:00 에서 시작 → 7초 뒤 00:00:07', d);
  for (const mode of ['dark', 'light']) { await setDesk(mode); await page.clock.runFor(700); await shot(`app_count_${mode}_v2.png`, '#panel-countdown'); }
  await page.click('#panel-countdown .cd-btns button:nth-child(2)'); // 일시정지
  const paused = await page.textContent('#cd-display');
  await page.clock.runFor(3000);
  d = await page.textContent('#cd-display');
  ok(d === paused, '일시정지하면 멈춤', paused + ' → ' + d);
  await page.click('#panel-countdown .cd-btns button:nth-child(1)'); // 이어하기
  await page.clock.runFor(2000);
  d = await page.textContent('#cd-display');
  const secOf = (t) => t.split(':').reduce((a, b) => a * 60 + Number(b), 0);
  ok(secOf(d) === secOf(paused) + 2, '다시 시작하면 이어서 위로', paused + ' → ' + d);
  await page.click('#panel-countdown .cd-btns button:nth-child(3)'); // 초기화
  d = await page.textContent('#cd-display');
  const flash0 = await page.evaluate(() => document.getElementById('clock-area').classList.contains('flashing'));
  ok(d === '00:00:00' && !flash0, '초기화 → 00:00:00', d);
  // 상한
  await page.evaluate(() => { cdMode = 'up'; cdElapsed = CD_UP_MAX - 2; renderCd(); });
  await page.click('#panel-countdown .cd-btns button:nth-child(1)');
  await page.clock.runFor(5000);
  const cap = await page.evaluate(() => ({ d: document.getElementById('cd-display').textContent, run: cdRunning, fl: document.getElementById('clock-area').classList.contains('flashing') }));
  ok(cap.d === '99:59:59' && !cap.run && !cap.fl, '위로 세기 99:59:59 에서 멈춤·알람 없음', JSON.stringify(cap));
  await page.click('#panel-countdown .cd-btns button:nth-child(3)');
  // 거꾸로(예전 기능)
  await page.fill('#cd-s', '3');
  await page.click('#panel-countdown .cd-btns button:nth-child(1)');
  await page.clock.runFor(3000);
  d = await page.textContent('#cd-display');
  await page.clock.runFor(1000);
  const fl = await page.evaluate(() => document.getElementById('clock-area').classList.contains('flashing'));
  ok(d === '00:00:00' && fl, '시간 넣고 시작 → 거꾸로 3초 뒤 알람(예전과 같음)', d);
  await page.evaluate(() => stopAlarm());
  // 프리셋은 그대로
  const pres = await page.evaluate(() => document.querySelectorAll('#cd-preset-row .cd-preset').length);
  ok(pres === 4, '프리셋 4칸 그대로', String(pres));


  // ── 3) 스위치 여백·대칭(형 46053)·무채색 그림자(형 46056) — 배율 1 / 1.25 / 1.5 / 2 ──
  // 켜짐 동그라미는 220도 돌아 있어 상자 크기가 커진다 → 가운데(회전해도 그대로)와 계산된 지름으로 잰다.
  const MARGIN_LOG = [];
  function sat(rgb) { const [r, g, b] = rgb.map((v) => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (mx + mn) / 2; if (mx === mn) return 0; return l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn); }
  for (const dpr of [1, 1.25, 1.5, 2]) {
    const ctx = await browser.newContext({ viewport: { width: 340, height: 520 }, deviceScaleFactor: dpr });
    const pg = await ctx.newPage();
    await pg.addInitScript(() => {
      localStorage.setItem('alarms', JSON.stringify([
        { id: 1, t: '07:00', name: '기상', enabled: true, repeat: true, days: [1, 2, 3, 4, 5], sound: 'sounds/happy_bells.wav' },
        { id: 2, t: '16:29', name: '알람', enabled: false, repeat: false, days: [], sound: 'sounds/happy_bells.wav' },
      ]));
    });
    await pg.goto('file://' + DIST);
    await pg.evaluate(() => document.fonts.ready);
    for (const mode of ['dark', 'light']) {
      await pg.evaluate(([m, c]) => { document.body.style.background = c; changePanelColor(m === 'light' ? 'white' : 'black'); openPanel('alarm'); }, [mode, DESK[mode]]);
      await pg.waitForTimeout(900);
      const r = await pg.evaluate(() => {
        const out = {};
        for (const [st, id] of [['on', 1], ['off', 2]]) {
          const b = document.querySelector(`#alarm-list .alarm-toggle[data-id="${id}"]`);
          const g = b.querySelector('.gv').getBoundingClientRect();
          const kEl = b.querySelector('.kn'), k = kEl.getBoundingClientRect(), d = parseFloat(getComputedStyle(kEl).width);
          const cx = k.left + k.width / 2, cy = k.top + k.height / 2;
          out[st] = { L: cx - d / 2 - g.left, R: g.right - (cx + d / 2), T: cy - d / 2 - g.top, B: g.bottom - (cy + d / 2), d };
        }
        const b = document.querySelector('#alarm-list .alarm-toggle[data-id="2"]');
        out.sh = getComputedStyle(b).boxShadow + ' | ' + getComputedStyle(b.querySelector('.gv')).boxShadow;
        const bw = (e) => ['Top', 'Right', 'Bottom', 'Left'].map((k) => parseFloat(getComputedStyle(e)['border' + k + 'Width']) || 0).reduce((x, y) => x + y, 0);
        out.border = bw(b) + bw(b.querySelector('.gv'));
        // 그림자마다 번짐(blur) 값: "rgb(..) x y blur [spread] [inset]"
        const blurs = (txt) => txt.split(/,(?![^(]*\))/).map((one) => { const n = one.replace(/rgba?\([^)]*\)/, '').match(/-?[\d.]+px/g) || []; return parseFloat(n[2] || '0'); });
        out.bodyBlur = Math.min(...blurs(getComputedStyle(b).boxShadow));
        out.gvBlur = Math.min(...blurs(getComputedStyle(b.querySelector('.gv')).boxShadow));
        return out;
      });
      const f = (v) => v.toFixed(3);
      for (const st of ['off', 'on']) { const m = r[st]; MARGIN_LOG.push(`배율 ${dpr} ${mode} ${st}: 왼 ${f(m.L)} 오 ${f(m.R)} 위 ${f(m.T)} 아래 ${f(m.B)} (CSS px, 지름 ${f(m.d)})`); }
      const tag = `배율 ${dpr} ${mode}`;
      ok(Math.abs(r.off.L - r.on.R) <= 0.5, `${tag}: 꺼짐 왼쪽 여백 = 켜짐 오른쪽 여백`, `${f(r.off.L)} / ${f(r.on.R)}`);
      ok(Math.abs(r.off.T - r.off.B) <= 0.5 && Math.abs(r.on.T - r.on.B) <= 0.5, `${tag}: 위 여백 = 아래 여백(꺼짐·켜짐)`, `꺼짐 ${f(r.off.T)}/${f(r.off.B)} 켜짐 ${f(r.on.T)}/${f(r.on.B)}`);
      ok(Math.abs(r.off.L - r.off.T) <= 0.5 && Math.abs(r.on.R - r.on.T) <= 0.5 && r.off.T >= 1.5, `${tag}: 사방 같은 여백(약 2px)`, `꺼짐 왼 ${f(r.off.L)} 위 ${f(r.off.T)} · 켜짐 오 ${f(r.on.R)} 위 ${f(r.on.T)}`);
      const cols = (r.sh.match(/rgba?\([^)]*\)/g) || []).map((c) => c.match(/[\d.]+/g).slice(0, 3).map(Number));
      const maxS = Math.max(...cols.map(sat));
      ok(r.border === 0, `${tag}: 스위치 몸통·홈 테두리선 없음`, String(r.border));
      ok(r.bodyBlur >= 8 && r.gvBlur >= 4, `${tag}: 그림자는 넓게 번짐(몸통 ≥ 8px·홈 ≥ 4px, 딱딱한 테 없음)`, `몸통 최소 ${r.bodyBlur}px · 홈 최소 ${r.gvBlur}px`);
      ok(cols.length >= 4 && maxS <= 0.05, `${tag}: 스위치 몸통·홈 그림자 무채색(채도 ≤ 0.05)`, `${cols.length}색, 최대 채도 ${maxS.toFixed(3)}`);
    }
    await ctx.close();
  }
  if (SHOT_DIR) {
    fs.writeFileSync(path.join(SHOT_DIR, 'switch_margin_v2.txt'), MARGIN_LOG.join('\n') + '\n');
    // 4배 확대 사진 재료: 배율 4 로 스위치 칸만 찍는다(어두움·밝음)
    const ctx = await browser.newContext({ viewport: { width: 340, height: 520 }, deviceScaleFactor: 4 });
    const pg = await ctx.newPage();
    await pg.addInitScript(() => {
      localStorage.setItem('alarms', JSON.stringify([
        { id: 1, t: '07:00', name: '기상', enabled: true, repeat: true, days: [1, 2, 3, 4, 5], sound: 'sounds/happy_bells.wav' },
        { id: 2, t: '16:29', name: '알람', enabled: false, repeat: false, days: [], sound: 'sounds/happy_bells.wav' },
        { id: 3, t: '23:30', name: '정리', enabled: true, repeat: true, days: [0, 1, 2, 3, 4, 5, 6], sound: 'sounds/happy_bells.wav' },
      ]));
    });
    await pg.goto('file://' + DIST);
    await pg.evaluate(() => document.fonts.ready);
    for (const mode of ['dark', 'light']) {
      await pg.evaluate(([m, c]) => { document.documentElement.style.background = c; document.body.style.background = c; changePanelColor(m === 'light' ? 'white' : 'black'); setClockAuto(false); changeBrightness(m === 'light' ? 35 : 220); openPanel('alarm'); }, [mode, DESK[mode]]);
      await pg.waitForTimeout(900);
      const bb = await pg.evaluate(() => { const rs = [1, 2, 3].map((i) => document.querySelector(`#alarm-list .alarm-toggle[data-id="${i}"]`).closest('.alarm-item').getBoundingClientRect()); const t = rs[0].top - 2, bt = rs[2].bottom + 2, right = rs[0].right; return { x: right - 130, y: t, w: 130, h: bt - t }; });
      await pg.screenshot({ path: path.join(SHOT_DIR, `crop_v2_${mode}.png`), clip: { x: bb.x, y: bb.y, width: bb.w, height: bb.h } });
    }
    await ctx.close();
  }
  await browser.close();
  console.log(results.join('\n'));
  console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
