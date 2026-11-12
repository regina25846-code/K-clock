// K-Clock 1.4.5-2 시험 (PND-0412) — 요일 칩 금색·설정 스위치 새 모양·글꼴 통일·글자 바탕 덜컹 없음.
// 실행: node tests/kclock_1452.test.cjs   (앞 판 시험 tests/kclock_1451.test.cjs 도 같이 돌린다)
// 맥 크로미움으로 실제 dist/index.html·about.html 을 띄워 잰다. 타우리가 없어 창 크기·화면 읽기는 빠진다.
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/Users/openclaw-mini/.openclaw/workspace/node_modules/playwright');

const DIST = path.join(__dirname, '..', 'dist');
let pass = 0, fail = 0;
const results = [];
function ok(cond, name, extra) {
  if (cond) { pass++; results.push('PASS ' + name + (extra ? ' — ' + extra : '')); }
  else { fail++; results.push('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
const DESK = { dark: '#303746', light: '#c4c9d0' };
const ALARMS = [
  { id: 1, t: '23:29', name: 'ㅇㅎ', enabled: true, repeat: true, days: [1, 2, 3, 4, 5], sound: 'sounds/happy_bells.wav' },
  { id: 2, t: '16:29', name: '아주 긴 이름을 붙인 알람 하나 둘 셋 넷', enabled: false, repeat: false, days: [], sound: 'sounds/happy_bells.wav' },
  { id: 3, t: '07:00', name: '기상', enabled: true, repeat: true, days: [0, 1, 2, 3, 4, 5, 6], sound: 'sounds/happy_bells.wav' },
];
const TEAL = ['rgb(68, 170, 153)', 'rgba(68, 170, 153, 0.14)'];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 300, height: 560 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript((al) => localStorage.setItem('alarms', JSON.stringify(al)), ALARMS);
  await page.goto('file://' + path.join(DIST, 'index.html'));
  await page.evaluate(() => document.fonts.ready);
  async function setDesk(mode, fade) {
    await page.evaluate(([m, c, f]) => {
      document.body.style.background = c;
      setClockAuto(false); changeBrightness(m === 'light' ? 35 : 220);
      panelColor = m === 'light' ? 'white' : 'black'; syncPanelColorBtns(); applyColors(f);
    }, [mode, DESK[mode], !!fade]);
    // setClockAuto 가 0.6초 색 전환 클래스를 잠깐 붙인다 — 빠질 때까지 기다린 뒤 잰다
    await page.waitForFunction(() => !document.body.classList.contains('color-fade') && !document.body.classList.contains('color-fade-fast'), null, { timeout: 3000 });
  }

  // ── 1) 요일 칩·요약·빠른 선택 켜짐 색 = 금색 계열(옛 청록 아님) ──
  for (const mode of ['dark', 'light']) {
    await setDesk(mode);
    await page.evaluate(() => { openPanel('alarm'); newDays = [1, 2, 3, 4, 5]; renderNewDays(); applyColors(false); });
    await page.waitForTimeout(900);   // 색 전환(0.2초)이 끝난 뒤
    const c = await page.evaluate(() => {
      const g = (s, p) => getComputedStyle(document.querySelector(s))[p];
      return { chip: g('#new-days .day-chip.on', 'color'), chipBr: g('#new-days .day-chip.on', 'borderTopColor'), chipBg: g('#new-days .day-chip.on', 'backgroundColor'),
        sum: g('#new-days .day-sum.rep', 'color'), quick: g('#new-days .day-quick button.on', 'color'), tag: g('#alarm-list .alarm-item.on .alarm-days-tag', 'color') };
    });
    const all = Object.values(c);
    ok(all.every((v) => !TEAL.includes(v)), `요일 칩·요약·빠른 선택 켜짐이 옛 청록(#4a9) 아님 (${mode})`, JSON.stringify(c));
    ok(c.sum === c.tag, `요일 요약 글자색 = 알람 줄 요일 글자색(금색) (${mode})`, `${c.sum} / ${c.tag}`);
    const rgb = c.chip.match(/\d+/g).map(Number);
    ok(rgb[0] > rgb[2] + 40, `요일 칩 글자 금색 계열(빨강 > 파랑) (${mode})`, c.chip);
    await page.evaluate(() => { newDays = []; renderNewDays(); });
  }
  const src = require('fs').readFileSync(path.join(DIST, 'index.html'), 'utf8');
  ok(!/#4a9\b/i.test(src) && !/68,\s*170,\s*153/.test(src), 'index.html 에 옛 청록(#4a9) 값 0건');

  // ── 2) 설정 스위치 = 알람 줄 스위치와 같은 구조·크기·움직임 ──
  await setDesk('dark');
  await page.evaluate(() => openPanel('alarm'));
  const alSize = await page.evaluate(() => { const r = document.querySelector('#alarm-list .alarm-toggle').getBoundingClientRect(); return [r.width, r.height]; });
  await page.evaluate(() => openPanel('settings'));
  await page.waitForTimeout(300);
  const st = await page.evaluate((al) => {
    al = { width: al[0], height: al[1] };
    return ['tog-auto', 'tog-pin', 'tog-sec', 'tog-autocolor'].map((id) => {
      const e = document.getElementById(id); const r = e.getBoundingClientRect();
      return { id, tag: e.tagName, role: e.getAttribute('role'), aria: e.getAttribute('aria-checked'), off: e.classList.contains('off'),
        gv: !!e.querySelector('.gv'), kn: !!e.querySelector('.kn'), w: r.width, h: r.height, aw: al.width, ah: al.height,
        sh: getComputedStyle(e).boxShadow, ash: getComputedStyle(document.querySelector('#alarm-list .alarm-toggle')).boxShadow };
    });
  }, alSize);
  for (const s of st) {
    ok(s.tag === 'BUTTON' && s.role === 'switch' && s.gv && s.kn, `설정 ${s.id}: 새 구조(button·role=switch·홈·동그라미)`, `${s.tag} ${s.role}`);
    ok(s.w === s.aw && s.h === s.ah && s.w === 36 && s.h === 18, `설정 ${s.id}: 크기 = 알람 줄 스위치(36×18)`, `${s.w}×${s.h}`);
    ok(s.sh === s.ash, `설정 ${s.id}: 몸통 그림자 = 알람 줄 스위치`);
    ok(s.aria === (s.off ? 'false' : 'true'), `설정 ${s.id}: aria-checked 가 켜짐 상태와 같음`, `${s.aria} off=${s.off}`);
  }
  // 초 표시: 누르면 동그라미가 미끄러지고 기존 동작(초 숨김) 그대로, 5번 눌러 5번
  const k0 = await page.evaluate(() => ({ left: getComputedStyle(document.querySelector('#tog-sec .kn')).left, ds: document.getElementById('ds').style.display }));
  await page.click('#tog-sec');
  await page.waitForTimeout(150);
  const kMid = await page.evaluate(() => getComputedStyle(document.querySelector('#tog-sec .kn')).left);
  await page.waitForTimeout(400);
  const k1 = await page.evaluate(() => ({ left: getComputedStyle(document.querySelector('#tog-sec .kn')).left, ds: document.getElementById('ds').style.display, aria: document.getElementById('tog-sec').getAttribute('aria-checked'), saved: localStorage.getItem('showSec') }));
  ok(parseFloat(k0.left) === 21 && parseFloat(k1.left) === 5 && parseFloat(kMid) < 21 && parseFloat(kMid) > 5, '설정 스위치 끄기: 동그라미 21→5px 미끄러짐', `${k0.left}→${kMid}→${k1.left}`);
  ok(k1.ds === 'none' && k1.aria === 'false', '초 표시 끄기 → 초 숨김(기존 동작)·aria 꺼짐', JSON.stringify(k1));
  let flips = 0, prev = k1.aria;
  for (let i = 0; i < 5; i++) {
    await page.click('#tog-sec'); await page.waitForTimeout(60);
    const a = await page.evaluate(() => document.getElementById('tog-sec').getAttribute('aria-checked'));
    if (a !== prev) flips++; prev = a;
  }
  ok(flips === 5, '설정 스위치 5번 눌러 5번 바뀜', String(flips));
  // 키보드
  await page.focus('#tog-pin'); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
  await page.waitForTimeout(50);
  const kb = await page.evaluate(() => { const b = document.getElementById('tog-pin'); return { fv: b.matches(':focus-visible'), sh: getComputedStyle(b).boxShadow, off: b.classList.contains('off') }; });
  ok(kb.fv && /0px 0px 0px 2px/.test(kb.sh), '설정 스위치 키보드 포커스에 금색 테두리', kb.sh.slice(-40));
  await page.keyboard.press('Space'); await page.waitForTimeout(50);
  const kb2 = await page.evaluate(() => document.getElementById('tog-pin').classList.contains('off'));
  ok(kb2 !== kb.off, 'Space 로 설정 스위치 켜고 끄기');
  await page.keyboard.press('Space'); await page.waitForTimeout(50);
  await page.click('#tog-auto'); await page.waitForTimeout(50);
  ok(!(await page.evaluate(() => document.getElementById('tog-auto').matches(':focus-visible'))), '마우스로 누른 뒤 설정 스위치 포커스 테두리 없음');
  await page.click('#tog-auto'); await page.waitForTimeout(50);
  // 글자색 자동: setClockAuto 경로로 .off 가 바뀌어도 aria 가 따라감
  await page.evaluate(() => setClockAuto(true)); await page.waitForTimeout(30);
  const ac = await page.evaluate(() => document.getElementById('tog-autocolor').getAttribute('aria-checked'));
  await page.evaluate(() => setClockAuto(false)); await page.waitForTimeout(30);
  const ac2 = await page.evaluate(() => document.getElementById('tog-autocolor').getAttribute('aria-checked'));
  ok(ac === 'true' && ac2 === 'false', '코드가 스위치를 바꿔도(글자색 자동) aria-checked 따라감', `${ac}/${ac2}`);

  // ── 3) 글꼴: 시계 본체만 빼고 전부 Pretendard ──
  for (const mode of ['dark', 'light']) {
    await setDesk(mode);
    const f = await page.evaluate(() => {
      const bad = [];
      let n = 0;
      for (const p of ['alarm', 'countdown', 'settings']) {
        openPanel(p);
        document.querySelectorAll('#panel-' + p + ' *, #panel-' + p).forEach((e) => {
          const hasText = [...e.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim()) || e.matches('input,button');
          if (!hasText) return;
          n++;
          const fam = getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g, '').trim();
          if (fam !== 'Pretendard KR') bad.push((e.id || e.className || e.tagName) + ':' + fam);
        });
      }
      document.querySelectorAll('#ctx-menu .menu-item').forEach((e) => { n++; const fam = getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g, ''); if (fam !== 'Pretendard KR') bad.push('menu:' + fam); });
      return { n, bad, tnum: getComputedStyle(document.getElementById('cd-display')).fontVariantNumeric, clock: getComputedStyle(document.getElementById('text-clock')).fontFamily };
    });
    ok(f.bad.length === 0 && f.n > 50, `글자 있는 화면 요소 ${f.n}개 전부 Pretendard KR (${mode})`, f.bad.slice(0, 6).join(', '));
    ok(/tabular-nums/.test(f.tnum), `카운트 숫자 폭 고정(tabular-nums) (${mode})`, f.tnum);
    ok(!/Pretendard/.test(f.clock), `시계 본체 글꼴은 그대로(Pretendard 아님) (${mode})`, f.clock);
  }
  ok(await page.evaluate(() => document.fonts.check('400 12px "Pretendard KR"') && document.fonts.check('700 12px "Pretendard KR"')), 'Pretendard 400·700 글꼴 파일 읽힘');
  // 시계 글꼴 고르기는 그대로 먹는다
  const pick = await page.evaluate(() => { const t = document.getElementById('text-clock'); const old = t.style.fontFamily; t.style.fontFamily = "'KoPubWorld Dotum Bold'"; const r = getComputedStyle(t).fontFamily; t.style.fontFamily = old; return r; });
  ok(/KoPubWorld Dotum Bold/.test(pick), '설정에서 고른 시계 글꼴은 그대로 적용', pick);

  // ── 4) 글자 바탕: 부드럽게 바뀌고 자리·크기 그대로 ──
  await setDesk('light');
  await page.evaluate(() => openPanel('alarm'));
  await page.waitForTimeout(800);
  const tr = await page.evaluate(() => { const cs = getComputedStyle(document.querySelector('#alarm-list .alarm-item.on .alarm-days-tag')); return { p: cs.transitionProperty, d: cs.transitionDuration }; });
  const durs = tr.d.split(',').map((x) => parseFloat(x));
  ok(/background-color/.test(tr.p) && /\bcolor\b/.test(tr.p) && durs.every((x) => x >= 0.15 && x <= 0.3), '글자 바탕·글자색 전환 0.15~0.3초', `${tr.p} / ${tr.d}`);
  const box = (id) => page.evaluate((i) => {
    const it = document.querySelector(`#alarm-list .alarm-toggle[data-id="${i}"]`).closest('.alarm-item');
    const r = it.querySelector('.alarm-days-tag').getBoundingClientRect(), s = it.querySelector('.alarm-toggle').getBoundingClientRect(), g = it.querySelector('.gv').getBoundingClientRect();
    const cs = getComputedStyle(it.querySelector('.alarm-days-tag'));
    return [r.x, r.y, r.width, r.height, s.x, s.y, s.width, s.height, g.width, g.height].map((v) => v.toFixed(2)).join(',') + '|' + cs.padding + '|' + cs.borderRadius;
  }, id);
  async function sampleDuring(act, ids) {
    const seen = new Set();
    for (const id of ids) seen.add(await box(id));
    const t0 = Date.now(); await act();
    while (Date.now() - t0 < 800) { for (const id of ids) seen.add(id + ':' + await box(id)); await page.waitForTimeout(25); }
    return seen;
  }
  // 바꾸기 전·중·후 상자를 모아 줄마다 한 가지 값만 나오면 «불변»
  const groupBy = (set) => { const m = {}; for (const v of set) { const [k, rest] = v.includes(':') && /^\d:/.test(v) ? [v[0], v.slice(2)] : ['pre', v]; (m[k] = m[k] || new Set()).add(rest); } return m; };
  for (const mode of ['light', 'dark']) {
    await setDesk(mode); await page.waitForTimeout(800);
    const pre = await box(1);
    const seen = await sampleDuring(() => page.click('#alarm-list .alarm-toggle[data-id="1"]'), [1]);
    const g = groupBy(seen);
    ok(g['1'] && g['1'].size === 1 && [...g['1']][0] === pre, `스위치 끄는 동안 글자 바탕·스위치 상자 자리·크기 불변 (${mode})`, `${g['1'] ? g['1'].size : 0}가지 · ${pre}`);
    const back = await sampleDuring(() => page.click('#alarm-list .alarm-toggle[data-id="1"]'), [1]);
    const gb = groupBy(back);
    ok(gb['1'] && gb['1'].size === 1 && [...gb['1']][0] === pre, `스위치 켜는 동안 글자 바탕·스위치 상자 자리·크기 불변 (${mode})`, `${gb['1'] ? gb['1'].size : 0}가지`);
  }
  // 글자 바탕 꺼질 때 바탕색이 중간값을 지나감(뚝 끊기지 않음)
  await setDesk('light'); await page.waitForTimeout(800);
  await page.click('#alarm-list .alarm-toggle[data-id="1"]');
  await page.waitForTimeout(80);
  // 1.4.5-2 2차(형 46110): 라이트 글자 바탕(금색 알약)은 없앰 → 꺼질 때 요일 글자색이 중간값을 지나가는지로 잰다
  const midFg = await page.evaluate(() => getComputedStyle(document.querySelector('#alarm-list .alarm-toggle[data-id="1"]').closest('.alarm-item').querySelector('.alarm-days-tag')).color);
  await page.waitForTimeout(500);
  const endFg = await page.evaluate(() => getComputedStyle(document.querySelector('#alarm-list .alarm-toggle[data-id="1"]').closest('.alarm-item').querySelector('.alarm-days-tag')).color);
  ok(midFg !== endFg && midFg !== 'rgb(90, 63, 14)', '요일 글자색이 0.08초 때 바뀌는 중(서서히 꺼짐)', `${midFg} → ${endFg}`);
  await page.click('#alarm-list .alarm-toggle[data-id="1"]'); await page.waitForTimeout(500);
  // 테마 전환(글자색 자동의 0.6초 전환) 동안: 상자 불변, 스위치 그림자도 서서히
  const preT = await box(1);
  const seenT = await sampleDuring(() => page.evaluate(() => { document.body.style.background = '#303746'; changeBrightness(220); panelColor = 'black'; applyColors(true); }), [1, 3]);
  const gT = groupBy(seenT);
  ok(gT['1'] && gT['1'].size === 1 && [...gT['1']][0] === preT, '라이트→다크 전환 중 글자 바탕·스위치 상자 자리·크기 불변', `${gT['1'] ? gT['1'].size : 0}가지`);
  await setDesk('light'); await page.waitForTimeout(800);
  await page.evaluate(() => { document.body.style.background = '#303746'; changeBrightness(220); panelColor = 'black'; applyColors(true); });
  await page.waitForTimeout(250);
  const shMid = await page.evaluate(() => getComputedStyle(document.querySelector('#alarm-list .alarm-toggle[data-id="1"]')).boxShadow);
  await page.waitForTimeout(700);
  const shEnd = await page.evaluate(() => getComputedStyle(document.querySelector('#alarm-list .alarm-toggle[data-id="1"]')).boxShadow);
  ok(shMid !== shEnd, '테마 전환 때 스위치 몸통 그림자도 서서히(0.25초 때 아직 중간)', shMid.slice(0, 50));
  // 글자 바탕 여백·둥글기는 켜짐·꺼짐·테마 상관없이 같음
  const pads = new Set();
  for (const mode of ['dark', 'light']) { await setDesk(mode); await page.waitForTimeout(100); for (const s of await page.evaluate(() => [...document.querySelectorAll('#alarm-list .alarm-days-tag')].map((e) => getComputedStyle(e).padding + ' ' + getComputedStyle(e).borderRadius))) pads.add(s); }
  ok(pads.size === 1, '글자 바탕 여백·둥글기 한 가지(켜짐·꺼짐·다크·라이트)', [...pads].join(' / '));

  // ── 5) 다크 스위치 몸통이 패널 바탕에 녹음 ──
  await setDesk('dark'); await page.waitForTimeout(800);
  const sw = await page.evaluate(() => { const b = document.querySelector('#alarm-list .alarm-toggle'); return getComputedStyle(b).backgroundColor; });
  const sv = sw.match(/[\d.]+/g).map(Number);
  // 1.4.5-3(형 46135 ④): 몸통을 살짝 밝게(.03→.06) — 여전히 패널 바탕이 비치는 옅은 무채색(≤ .08). 테두리는 tests/kclock_1453.test.cjs
  ok(sv.length === 4 && sv[3] <= 0.08 && Math.max(sv[0], sv[1], sv[2]) - Math.min(sv[0], sv[1], sv[2]) <= 2, '다크 스위치 몸통 = 거의 투명한 무채색(패널 바탕이 비침)', sw);

  // ── 6) 가장 작은 창(패널 300px)에서 잘림·줄바꿈 없음 ──
  for (const mode of ['dark', 'light']) {
    await setDesk(mode);
    const r = await page.evaluate(() => {
      const bad = [];
      for (const p of ['alarm', 'countdown', 'settings']) {
        openPanel(p);
        const pr = document.getElementById('panel-' + p).getBoundingClientRect();
        document.querySelectorAll('#panel-' + p + ' .setting-row, #panel-' + p + ' .alarm-item, #panel-' + p + ' .alarm-row, #panel-' + p + ' .day-foot, #panel-' + p + ' .cd-btns').forEach((row) => {
          const rr = row.getBoundingClientRect();
          if (rr.right > pr.right + 0.5 || rr.left < pr.left - 0.5) bad.push('넘침 ' + row.className);
          row.querySelectorAll('span,button,.alarm-days-tag').forEach((e) => {
            const cs = getComputedStyle(e); if (cs.display === 'none') return;
            const er = e.getBoundingClientRect();
            if (er.right > pr.right - 2 + 0.5) bad.push('오른쪽 잘림 ' + (e.id || e.className || e.textContent));
            const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
            if (e.matches('.alarm-days-tag,.setting-row > span,.day-quick button,.cd-btns button') && er.height > lh * 1.6 + 4) bad.push('두 줄 ' + e.textContent);
          });
        });
      }
      return { bad, w: innerWidth };
    });
    ok(r.bad.length === 0, `창 폭 ${r.w}px(패널 최소)에서 잘림·줄바꿈 없음 (${mode})`, r.bad.slice(0, 5).join(', '));
  }
  // ── 8) 설정 막대 3개 — 형 46102: 아이콘 없이 막대만, 채움 왼쪽부터 값만큼, 테마별 색
  //    형 46110(2차): 평소 3px → 올리면 6px(.1s). 입력칸은 16px 투명(누르는 자리 그대로), 보이는 막대는 안쪽 줄이 그림 ──
  {
    const IDS = ['size-slider', 'brightness-slider', 'panel-opacity-slider'];
    await page.mouse.move(5, 5);
    await setDesk('dark');
    await page.evaluate(() => openPanel('settings'));
    await page.waitForTimeout(500);
    const src = require('fs').readFileSync(path.join(DIST, 'index.html'), 'utf8');
    ok(!/accent-color/i.test(src), 'index.html 에 accent-color 없음(기본 막대 색 안 씀)');
    const st = await page.evaluate((ids) => { let thumbRule = {};
      let trackRule = {};
      for (const ss of document.styleSheets) for (const r of ss.cssRules) { if (r.selectorText === '.slider .level::-webkit-slider-thumb') thumbRule = r.style; if (r.selectorText === '.slider .level::-webkit-slider-runnable-track') trackRule = r.style; }
      return ids.map((id) => {
      const e = document.getElementById(id), w = e.parentElement, cs = getComputedStyle(e);
      return { id, wrap: w.className, kids: w.children.length, svg: w.querySelectorAll('svg,img,i').length, appear: cs.webkitAppearance || cs.appearance,
        h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width, rad: cs.borderRadius, ov: cs.overflow, acc: e.getAttribute('style') || '',
        tw: thumbRule.width, thh: thumbRule.height, tsh: thumbRule.boxShadow, bg: cs.backgroundColor, tr: trackRule.transition || '', trad: trackRule.borderRadius, tov: trackRule.overflow, dur: getComputedStyle(e).getPropertyValue('--level-transition-duration').trim() };
    }); }, IDS);
    for (const s of st) {
      ok(s.wrap === 'slider' && s.kids === 1 && s.svg === 0, `${s.id}: 아이콘 없이 막대만(.slider 안에 입력 하나)`, `${s.wrap}/${s.kids}/${s.svg}`);
      ok(s.appear === 'none' && !/accent/.test(s.acc), `${s.id}: 기본 모양 끔·accent-color 없음`, s.appear);
      ok(s.h === 16 && s.w === 70 && s.bg === 'rgba(0, 0, 0, 0)' && /var\(--slider-border-radius\)/.test(s.trad) && s.tov === 'hidden', `${s.id}: 입력칸 70×16 투명(누르는 자리)·보이는 막대 끝 둥글게`, `${s.w}×${s.h} ${s.bg} ${s.trad}`);
      ok(s.tw === '0px' && s.thh === '0px' && /^-200px 0(px)? 0(px)? 200px/.test(s.tsh), `${s.id}: 손잡이 0 크기·채움 그림자 -200px 0 0 200px(막대 70px ≤ 200)`, s.tsh);
      ok(/height var\(--level-transition-duration\)/.test(s.tr) && s.dur === '.1s', `${s.id}: 두께 바뀜 0.1초`, s.tr + ' / ' + s.dur);
    }
    // 마우스 올리면 두께 2배(평소 3px=6 기기 픽셀 → 6px=12), 줄 높이·옆 숫자 자리 그대로 — 두께는 화면 픽셀(세로 줄 수)로
    async function barRows(id) {
      const r = await page.evaluate((i) => { const b = document.getElementById(i).getBoundingClientRect(); return { x: b.x + 4, y: b.y, width: 1, height: b.height }; }, id);
      const buf = await page.screenshot({ clip: r });
      return page.evaluate(async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, 1, img.height).data; const top = [d[0], d[1], d[2]]; let n = 0;
        for (let y = 0; y < img.height; y++) if (Math.max(...[0, 1, 2].map((k) => Math.abs(d[y * 4 + k] - top[k]))) > 8) n++;
        return n; }, buf.toString('base64'));
    }
    for (const id of IDS) {
      const g = () => page.evaluate((i) => { const e = document.getElementById(i), r = e.getBoundingClientRect(), row = e.closest('.setting-row').getBoundingClientRect(), v = e.parentElement.nextElementSibling.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, row: row.height, rowY: row.y, vx: v.x, vy: v.y }; }, id);
      const a = await g(); const ra = await barRows(id);
      await page.mouse.move(a.x + 20, a.y + a.h / 2); await page.waitForTimeout(250);
      const b = await g(); const rb = await barRows(id);
      await page.mouse.move(5, 5); await page.waitForTimeout(250);
      const c = await g(); const rc = await barRows(id);
      ok(ra === 6 && rb === 12 && rc === 6, `${id}: 막대 평소 3px → 올리면 6px → 내리면 3px(배율 2 기기 픽셀 6→12→6)`, `${ra}→${rb}→${rc}`);
      ok(a.row === 31, `${id}: 줄 높이 31px(옛 기본 막대 때와 같음)`, String(a.row));
      ok(a.row === b.row && a.rowY === b.rowY && a.vx === b.vx && a.vy === b.vy, `${id}: 두꺼워져도 줄 높이·옆 숫자 자리 그대로`, `줄 ${a.row}→${b.row} 숫자 ${a.vx},${a.vy}→${b.vx},${b.vy}`);
    }
    // 채움색·바탕색 테마별
    const col = {};
    for (const mode of ['dark', 'light']) {
      await setDesk(mode);
      await page.waitForTimeout(400);
      const keepO = await page.$eval('#panel-opacity-slider', (e) => e.value);
      await page.$eval('#panel-opacity-slider', (e) => { e.value = 100; });
      const r = await page.evaluate(() => { const b = document.getElementById('panel-opacity-slider').getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; });
      const buf = await page.screenshot({ clip: r });
      const px = await page.evaluate(async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        const d = x.getImageData(Math.floor(img.width / 2), Math.floor(img.height / 2), 1, 1).data; return `rgb(${d[0]}, ${d[1]}, ${d[2]})`; }, buf.toString('base64'));
      await page.$eval('#panel-opacity-slider', (e, v) => { e.value = v; }, keepO);
      // 바탕색: 값 0 으로 두고 가운데 픽셀
      await page.$eval('#panel-opacity-slider', (e) => { e.value = 0; });
      const buf0 = await page.screenshot({ clip: r });
      const px0 = await page.evaluate(async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        const d = x.getImageData(Math.floor(img.width / 2), Math.floor(img.height / 2), 1, 1).data; return `rgb(${d[0]}, ${d[1]}, ${d[2]})`; }, buf0.toString('base64'));
      await page.$eval('#panel-opacity-slider', (e, v) => { e.value = v; }, keepO);
      col[mode] = { bg: px0, fill: px };
    }
    ok(col.dark.bg === 'rgb(82, 82, 82)' && col.dark.fill === 'rgb(255, 255, 255)', '다크: 바탕 rgb(82,82,82)·채움 흰색(형 값 그대로, 화면 픽셀)', `${col.dark.bg} / ${col.dark.fill}`);
    ok(col.light.bg === 'rgb(190, 190, 190)' && col.light.fill === 'rgb(51, 51, 51)', '라이트: 바탕 연회색 rgb(190,190,190)·채움 진회색 #333(뒤집음, 화면 픽셀)', `${col.light.bg} / ${col.light.fill}`);
    ok(![col.dark.bg, col.light.bg, col.dark.fill, col.light.fill].some((v) => /(0, 120, 215)|(0, 117, 255)|(68, 170, 153)/.test(v)), '막대에 기본 파란색·청록 없음');
    // 끝값·중간값 채움 비율(화면 픽셀) — 다크·라이트
    async function fillRatio(id, mode) {
      const r = await page.evaluate((i) => { const b = document.getElementById(i).getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }, id);
      const buf = await page.screenshot({ clip: r });
      return page.evaluate(async ([b64, m]) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        const y = Math.floor(img.height / 2), d = x.getImageData(0, y, img.width, 1).data; let n = 0;
        for (let i = 0; i < img.width; i++) { const L = d[i * 4]; if (m === 'dark' ? L > 168 : L < 120) n++; }
        return n / img.width;
      }, [buf.toString('base64'), mode]);
    }
    for (const mode of ['dark', 'light']) {
      await setDesk(mode); await page.waitForTimeout(400);
      const rs = [];
      for (const [id, v] of [['panel-opacity-slider', 0], ['panel-opacity-slider', 100], ['panel-opacity-slider', 50], ['size-slider', 10], ['size-slider', 100]]) {
        const keep = await page.$eval('#' + id, (e) => e.value);
        await page.$eval('#' + id, (e, vv) => { e.value = vv; }, v);
        await page.waitForTimeout(50);
        rs.push({ id, v, f: await fillRatio(id, mode) });
        await page.$eval('#' + id, (e, vv) => { e.value = vv; }, keep);
      }
      const t = rs.map((q) => `${q.id.split('-')[0]}=${q.v}:${q.f.toFixed(3)}`).join(' ');
      ok(rs[0].f === 0 && rs[3].f === 0, `최솟값에서 채움 0(넘침 없음) (${mode})`, t);
      ok(rs[1].f === 1 && rs[4].f === 1, `최댓값에서 채움 끝까지(모자람 없음) (${mode})`, t);
      ok(Math.abs(rs[2].f - 0.5) < 0.03, `가운데 값에서 채움 반(${mode})`, t);
    }
    // 동작 그대로: 막대 아무 곳 눌러 끌기·키보드 ←→ → 값 연속·기존 함수 호출·옆 숫자
    await setDesk('dark');
    await page.evaluate(() => { window.__calls = []; for (const f of ['previewSize', 'changeSize', 'changeBrightness', 'changePanelOpacity']) { const o = window[f]; window['__o_' + f] = o; window[f] = function (...a) { __calls.push(f + ':' + a[0]); return o.apply(this, a); }; } });
    const keep = await page.evaluate(() => ['size-slider', 'brightness-slider', 'panel-opacity-slider'].map((i) => document.getElementById(i).value));
    const want = { 'size-slider': ['previewSize', 'changeSize', 'size-val'], 'brightness-slider': ['changeBrightness', null, 'bright-val'], 'panel-opacity-slider': ['changePanelOpacity', null, 'panel-op-val'] };
    for (const id of ['brightness-slider', 'panel-opacity-slider', 'size-slider']) {   // 크기는 시계를 키워 패널을 밀어내므로 마지막
      await page.evaluate(() => { __calls = []; });
      const r = await page.evaluate((i) => { const b = document.getElementById(i).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }, id);
      await page.mouse.move(r.x + r.w * 0.2, r.y + r.h / 2); await page.waitForTimeout(150);
      await page.mouse.down();
      const vals = [await page.$eval('#' + id, (e) => +e.value)];
      for (const f of [0.35, 0.5, 0.65, 0.8, 1.4]) { await page.mouse.move(r.x + r.w * f, r.y + r.h / 2, { steps: 4 }); vals.push(await page.$eval('#' + id, (e) => +e.value)); }
      await page.mouse.up();
      const calls = await page.evaluate(() => __calls.slice());
      const [inF, chF, lab] = want[id];
      const max = await page.$eval('#' + id, (e) => +e.max);
      const up = vals.every((v, i) => i === 0 || v > vals[i - 1]);
      ok(up && vals[vals.length - 1] === max, `${id}: 막대 아무 곳 눌러 끌기 → 값이 연속으로 커지고 끝까지`, vals.join(' '));
      ok(calls.filter((c) => c.startsWith(inF + ':')).length >= 5 && (!chF || calls.some((c) => c.startsWith(chF + ':'))), `${id}: 기존 함수 그대로 불림(${inF}${chF ? '·' + chF : ''})`, `${calls.length}번 · ${calls.slice(-2).join(' ')}`);
      ok(await page.$eval('#' + lab, (e) => e.textContent) === String(max), `${id}: 옆 숫자 같이 바뀜`, await page.$eval('#' + lab, (e) => e.textContent));
      await page.evaluate(() => { __calls = []; });
      await page.focus('#' + id);
      const k0 = await page.$eval('#' + id, (e) => +e.value);
      await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
      const k1 = await page.$eval('#' + id, (e) => +e.value);
      await page.keyboard.press('ArrowRight');
      const k2 = await page.$eval('#' + id, (e) => +e.value);
      const kc = await page.evaluate(() => __calls.slice());
      ok(k1 === k0 - 2 && k2 === k1 + 1 && kc.filter((c) => c.startsWith(inF + ':')).length >= 3, `${id}: 키보드 ←→ 로 한 칸씩·함수 호출`, `${k0}→${k1}→${k2} · ${kc.length}번`);
      const fv = await page.$eval('#' + id, (e) => ({ fv: e.matches(':focus-visible'), ol: getComputedStyle(e).outlineStyle }));
      ok(fv.fv && fv.ol === 'solid', `${id}: 키보드 포커스에만 테두리`, fv.ol);
      await page.$eval('#' + id, (e) => e.blur());
      const r2 = await page.evaluate((i) => { const b = document.getElementById(i).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }, id);
      await page.mouse.click(r2.x + r2.w * 0.5, r2.y + r2.h / 2);
      const mf = await page.$eval('#' + id, (e) => ({ fv: e.matches(':focus-visible'), ol: getComputedStyle(e).outlineStyle }));
      ok(!mf.fv && mf.ol === 'none', `${id}: 마우스로 누른 뒤 테두리 없음`, mf.ol);
      await page.mouse.move(5, 5);
    }
    await page.evaluate((k) => { for (const f of ['previewSize', 'changeSize', 'changeBrightness', 'changePanelOpacity']) window[f] = window['__o_' + f];
      ['size-slider', 'brightness-slider', 'panel-opacity-slider'].forEach((i, n) => { document.getElementById(i).value = k[n]; });
      previewSize(k[0]); changeBrightness(k[1]); changePanelOpacity(k[2]); }, keep);
  }
  ok(errors.length === 0, '페이지 오류 없음', errors.join(' | '));
  await ctx.close();

  // ── 7) 프로그램 정보 창(about.html)도 Pretendard ──
  const ap = await browser.newPage({ viewport: { width: 380, height: 560 } });
  const aerr = [];
  ap.on('pageerror', (e) => aerr.push(String(e)));
  await ap.goto('file://' + path.join(DIST, 'about.html') + '?v=1.4.5-2&b=220');
  await ap.evaluate(() => document.fonts.ready);
  const af = await ap.evaluate(() => {
    const bad = []; let n = 0;
    document.querySelectorAll('body *').forEach((e) => {
      if (![...e.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim())) return;
      if (getComputedStyle(e).display === 'none') return;
      n++; const fam = getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g, '').trim();
      if (fam !== 'Pretendard KR') bad.push((e.className || e.tagName) + ':' + fam);
    });
    return { n, bad, loaded: document.fonts.check('400 12px "Pretendard KR"') };
  });
  ok(af.n > 3 && af.bad.length === 0 && af.loaded, `프로그램 정보 창 글자 ${af.n}개 전부 Pretendard KR(파일 읽힘)`, af.bad.slice(0, 5).join(', '));
  ok(aerr.length === 0, '프로그램 정보 창 오류 없음', aerr.join(' | '));
  await browser.close();
  console.log(results.join('\n'));
  console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
