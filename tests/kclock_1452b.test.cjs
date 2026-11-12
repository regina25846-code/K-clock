// K-Clock 1.4.5-2 2차 손질 시험 (PND-0412, 형 46110·46114)
// 라이트 요일 글자 바탕 없앰(다크는 그대로) · 꺼진 알람 줄 연하게 · 카운트 숫자 칸 위아래 버튼 없앰 · 카운트 글꼴 · 막대 두께 통일(배율 1·1.25·1.5)
// 실행: node tests/kclock_1452b.test.cjs   — 맥 크로미움으로 실제 dist/index.html 을 띄워 잰다.
// 배율 시험은 브라우저를 그 배율로 띄운다(--force-device-scale-factor). playwright 의 deviceScaleFactor 흉내는
// CSS 픽셀에서 반올림한 뒤 확대해서 윈도우 배율과 다르게 나온다(실측).
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
  { id: 1, t: '23:29', name: '운동', enabled: true, repeat: true, days: [1, 2, 3, 4, 5], sound: 'sounds/happy_bells.wav' },
  { id: 2, t: '16:29', name: '알람', enabled: false, repeat: false, days: [], sound: 'sounds/happy_bells.wav' },
  { id: 3, t: '07:00', name: '기상', enabled: false, repeat: true, days: [0, 1, 2, 3, 4, 5, 6], sound: 'sounds/happy_bells.wav' },
];
const lum = (c) => { const v = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

async function setup(page, mode) {
  await page.evaluate(([m, c]) => {
    document.documentElement.style.background = c; document.body.style.background = c;
    setClockAuto(false); changeBrightness(m === 'light' ? 35 : 220);
    panelColor = m === 'light' ? 'white' : 'black'; syncPanelColorBtns(); applyColors(false);
  }, [mode, DESK[mode]]);
  await page.waitForFunction(() => !document.body.classList.contains('color-fade') && !document.body.classList.contains('color-fade-fast'), null, { timeout: 3000 });
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 300, height: 560 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript((al) => localStorage.setItem('alarms', JSON.stringify(al)), ALARMS);
  await page.goto('file://' + path.join(DIST, 'index.html'));
  await page.evaluate(() => document.fonts.ready);

  // ── 1) 요일 글자 바탕: 라이트도 글자만(바탕 없음), 다크는 1.4.5-2 1차 그대로 ──
  const tagOf = (id) => page.evaluate((i) => { const t = document.querySelector(`#alarm-list .alarm-toggle[data-id="${i}"]`).closest('.alarm-item').querySelector('.alarm-days-tag'); const c = getComputedStyle(t); const r = t.getBoundingClientRect();
    return { bg: c.backgroundColor, fg: c.color, w: c.fontWeight, pad: c.padding, rad: c.borderRadius, tr: c.transitionProperty + ' ' + c.transitionDuration, box: [r.x, r.y, r.width, r.height].map((v) => v.toFixed(2)).join(',') }; }, id);
  const tags = {};
  for (const mode of ['dark', 'light']) {
    await setup(page, mode);
    await page.evaluate(() => openPanel('alarm'));
    await page.waitForTimeout(500);
    tags[mode] = { on: await tagOf(1), off: await tagOf(2) };
  }
  ok(tags.light.on.bg === 'rgba(0, 0, 0, 0)' && tags.light.off.bg === 'rgba(0, 0, 0, 0)', '라이트 요일 글자 바탕 없음(켜짐·꺼짐)', `${tags.light.on.bg} / ${tags.light.off.bg}`);
  // 다크(형 46114 «다크는 괜찮다»): 48e0dae 와 같은 값 — 글자색 금색·바탕 없음·굵게·여백 1px 7px·둥글기 9px
  ok(tags.dark.on.fg === 'rgb(227, 200, 143)' && tags.dark.on.bg === 'rgba(0, 0, 0, 0)' && tags.dark.on.w === '700' && tags.dark.on.pad === '1px 7px' && tags.dark.on.rad === '9px',
    '다크 켜짐 요일 글자 그대로(금색·바탕 없음·굵게·여백·둥글기)', JSON.stringify(tags.dark.on));
  ok(tags.light.on.w === '700' && tags.light.on.fg === 'rgb(90, 63, 14)', '라이트 켜짐 요일 = 다크처럼 굵은 금색 글자만', `${tags.light.on.fg} ${tags.light.on.w}`);
  ok(tags.light.on.pad === tags.dark.on.pad && tags.light.on.rad === tags.dark.on.rad && tags.light.on.box === tags.dark.on.box, '요일 글자 자리·크기 다크·라이트 같음', `${tags.light.on.box} / ${tags.dark.on.box}`);
  ok(/color/.test(tags.light.on.tr) && /0\.2s/.test(tags.light.on.tr), '요일 글자색 전환 0.2초 유지', tags.light.on.tr);

  // ── 2) 꺼진 줄: 시각·이름·요일 글자 모두 연하게, 대비는 읽히는 선 ──
  for (const mode of ['dark', 'light']) {
    await setup(page, mode);
    await page.evaluate(() => openPanel('alarm'));
    await page.waitForTimeout(500);
    const v = await page.evaluate(() => {
      const row = (i) => document.querySelector(`#alarm-list .alarm-toggle[data-id="${i}"]`).closest('.alarm-item');
      const g = (i, s) => getComputedStyle(row(i).querySelector(s)).color;
      return { onT: g(1, '.al-t'), onN: g(1, '.al-n'), onD: g(1, '.alarm-days-tag'), offT: g(2, '.al-t'), offN: g(2, '.al-n'), offD: g(2, '.alarm-days-tag'), offD3: g(3, '.alarm-days-tag'),
        panel: getComputedStyle(document.getElementById('panel-alarm')).backgroundColor };
    });
    // 패널 바탕(반투명) 을 책상색 위에 섞은 실제 바탕
    const pa = v.panel.match(/[\d.]+/g).map(Number); const dk = DESK[mode].match(/\w\w/g).map((h) => parseInt(h, 16));
    const bg = `rgb(${[0, 1, 2].map((k) => pa[k] * pa[3] + dk[k] * (1 - pa[3])).join(',')})`;
    const c = { onT: cr(v.onT, bg), offT: cr(v.offT, bg), offN: cr(v.offN, bg), offD: cr(v.offD, bg), offD3: cr(v.offD3, bg) };
    const t = Object.entries(c).map(([k, x]) => `${k} ${x.toFixed(2)}`).join(' · ');
    ok(v.offT === v.offN && v.offN === v.offD && v.offD === v.offD3, `꺼진 줄 시각·이름·요일 글자 같은 연한 색 (${mode})`, `${v.offT}`);
    ok(['offT', 'offN', 'offD', 'offD3'].every((k) => c[k] >= 3.0 && c[k] < 4.0), `꺼진 줄 대비 3.0~4.0 — 읽히는 선 (${mode}, 패널 ${pa[3]}·바탕 ${bg})`, t);
    ok(c.onT / c.offT >= 3, `켜진 줄과 꺼진 줄 대비 차이 3배 이상 — 한눈에 구분 (${mode})`, `${c.onT.toFixed(2)} / ${c.offT.toFixed(2)}`);
  }
  // 켜고 끌 때 글자색이 서서히(0.08초 때 중간값)
  for (const mode of ['dark', 'light']) {
    await setup(page, mode);
    await page.evaluate(() => openPanel('alarm'));
    await page.waitForTimeout(500);
    const g = () => page.evaluate(() => { const r = document.querySelector('#alarm-list .alarm-toggle[data-id="1"]').closest('.alarm-item'); return [getComputedStyle(r.querySelector('.al-t')).color, getComputedStyle(r.querySelector('.al-n')).color]; });
    const a = await g();
    await page.click('#alarm-list .alarm-toggle[data-id="1"]');
    await page.waitForTimeout(80);
    const m = await g();
    await page.waitForTimeout(500);
    const b = await g();
    ok(m[0] !== a[0] && m[0] !== b[0] && m[1] !== a[1] && m[1] !== b[1], `알람 끌 때 시각·이름 글자색이 0.2초에 걸쳐 바뀜 (${mode})`, `${a[0]} → ${m[0]} → ${b[0]}`);
    await page.click('#alarm-list .alarm-toggle[data-id="1"]');
    await page.waitForTimeout(500);
    ok((await g())[0] === a[0], `다시 켜면 원래 색 (${mode})`);
  }

  // ── 3) 카운트 숫자 칸: 위아래 버튼 없음, 키보드 ↑↓·직접 입력 그대로 ──
  await setup(page, 'dark');
  await page.evaluate(() => openPanel('countdown'));
  await page.waitForTimeout(300);
  const spin = await page.evaluate(() => { let inner = '', outer = '', field = '';
    for (const ss of document.styleSheets) for (const r of ss.cssRules) {
      if (/::-webkit-inner-spin-button/.test(r.selectorText || '')) inner = r.style.webkitAppearance || r.style.appearance;
      if (/::-webkit-outer-spin-button/.test(r.selectorText || '')) outer = r.style.margin;
    }
    field = getComputedStyle(document.getElementById('cd-m')).appearance;
    return { inner, outer, field, n: document.querySelectorAll('input[type=number]').length }; });
  ok(spin.inner === 'none' && spin.outer === '0px' && spin.field === 'textfield', `숫자 칸 위아래 버튼 끔(appearance none·margin 0·textfield) — 앱의 숫자 칸 ${spin.n}개 전부`, JSON.stringify(spin));
  // 화면 픽셀: 마우스 올리기 전·후가 같아야 함(옛날엔 올리면 위아래 화살표가 나타남)
  for (const id of ['cd-h', 'cd-m', 'cd-s']) {
    await page.fill('#' + id, '');
    await page.mouse.move(5, 5); await page.waitForTimeout(100);
    const r = await page.evaluate((i) => { const b = document.getElementById(i).getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }, id);
    await page.fill('#' + id, '10'); await page.$eval('#' + id, (e) => e.blur());
    const a = await page.screenshot({ clip: r });
    await page.mouse.move(r.x + r.width - 5, r.y + r.height / 2); await page.waitForTimeout(150);
    const b = await page.screenshot({ clip: r });
    ok(a.equals(b), `${id}: 마우스 올려도 위아래 화살표 안 나타남(화면 픽셀 같음)`);
  }
  await page.mouse.move(5, 5);
  await page.fill('#cd-m', '');
  await page.focus('#cd-m');
  await page.keyboard.type('7');
  const typed = await page.$eval('#cd-m', (e) => e.value);
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
  const up = await page.$eval('#cd-m', (e) => e.value);
  await page.keyboard.press('ArrowDown');
  const dn = await page.$eval('#cd-m', (e) => e.value);
  await page.keyboard.press('Control+a'); await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace');
  const cleared = await page.$eval('#cd-m', (e) => e.value);
  await page.keyboard.type('45');
  const retyped = await page.$eval('#cd-m', (e) => e.value);
  ok(typed === '7' && up === '9' && dn === '8', '카운트 분 칸: 직접 입력·키보드 ↑↓ 그대로', `${typed} → ↑↑ ${up} → ↓ ${dn}`);
  ok(cleared === '' && retyped === '45', '카운트 분 칸: 다 지우고 새로 치기·입력 중 보정 없음', `'${cleared}' → '${retyped}'`);
  await page.fill('#cd-m', '');

  // ── 4) 카운트 숫자 글꼴: 실제로 그려지는 글꼴(크로미움 CDP)이 Pretendard ──
  {
    await page.evaluate(() => { document.getElementById('cd-display').textContent = '00:00:00'; });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    const doc = await cdp.send('DOM.getDocument', { depth: -1 });
    const used = {};
    for (const sel of ['#cd-display', '#cd-h', '#cd-m', '#cd-s', '.cd-btns button', '.cd-preset .p-time', '.cd-preset']) {
      const q = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: sel }).catch(() => null);
      if (!q || !q.nodeId) continue;
      const f = await cdp.send('CSS.getPlatformFontsForNode', { nodeId: q.nodeId }).catch(() => ({ fonts: [] }));
      used[sel] = f.fonts.map((x) => x.familyName).join('+') || '(글자 없음)';
    }
    const fam = await page.evaluate(() => ({ d: getComputedStyle(document.getElementById('cd-display')).fontFamily, n: getComputedStyle(document.getElementById('cd-display')).fontVariantNumeric }));
    const vals = Object.entries(used).filter(([, v]) => v !== '(글자 없음)');
    ok(vals.length >= 2 && vals.every(([, v]) => /^Pretendard/.test(v) && !/Consolas|Courier|Menlo|Mono/i.test(v)), '카운트 숫자·버튼 실제 그려진 글꼴 = Pretendard(고정폭 글꼴 아님)', JSON.stringify(used));
    ok(/^"Pretendard KR"/.test(fam.d) && /tabular-nums/.test(fam.n), '카운트 큰 숫자 계산된 글꼴 Pretendard KR·숫자 폭 고정', `${fam.d} · ${fam.n}`);
  }
  ok(errors.length === 0, '페이지 오류 없음', errors.join(' | '));
  await ctx.close();
  await browser.close();

  // ── 5) 막대 두께: 배율 1·1.25·1.5 에서 세 막대 같은 두께(기기 픽셀), 평소 = 3px, 올림 = 6px ──
  const IDS = ['size-slider', 'brightness-slider', 'panel-opacity-slider'];
  for (const dpr of [1, 1.25, 1.5]) {
    const b = await chromium.launch({ args: ['--force-device-scale-factor=' + dpr, '--window-size=340,560'] });
    const c = await b.newContext({ viewport: null });
    const p = await c.newPage();
    const perr = [];
    p.on('pageerror', (e) => perr.push(String(e)));
    await p.goto('file://' + path.join(DIST, 'index.html'));
    await p.evaluate(() => document.fonts.ready);
    const cdp = await c.newCDPSession(p);
    async function rows(id, part) {
      // 기기 픽셀 그대로 찍어서 막대 세로 줄 수를 센다(브라우저 안 canvas 로 해석)
      const r = await p.evaluate((i) => { const e = document.getElementById(i).getBoundingClientRect(); return { x: e.x, y: e.y, w: e.width, h: e.height }; }, id);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      return p.evaluate(async ([b64, r, dpr, part]) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const x = cv.getContext('2d'); x.drawImage(img, 0, 0);
        const fx = Math.floor((r.x + r.w * part) * dpr), px = Math.floor((r.x - 6) * dpr), y0 = Math.floor((r.y - 2) * dpr), y1 = Math.ceil((r.y + r.h + 2) * dpr);
        const a = x.getImageData(fx, y0, 1, y1 - y0).data, bb = x.getImageData(px, y0, 1, y1 - y0).data;
        let any = 0, soft = 0; const d = [];
        for (let i = 0; i < y1 - y0; i++) d.push(Math.max(...[0, 1, 2].map((k) => Math.abs(a[i * 4 + k] - bb[i * 4 + k]))));
        const mx = Math.max(...d);
        d.forEach((v) => { if (v > 8) { any++; if (v < mx * 0.8) soft++; } });
        return { any, soft };
      }, [shot.data, r, dpr, part]);
    }
    for (const mode of ['dark', 'light']) {
      await setup(p, mode);
      await p.evaluate(() => { openPanel('settings'); document.getElementById('size-slider').value = 68; document.getElementById('brightness-slider').value = 183; document.getElementById('panel-opacity-slider').value = 50; });
      await p.mouse.move(2, 2); await p.waitForTimeout(400);
      const rest = [], hov = [];
      for (const id of IDS) rest.push({ f: await rows(id, 0.1), g: await rows(id, 0.95) });
      for (const id of IDS) {
        const r = await p.evaluate((i) => { const e = document.getElementById(i).getBoundingClientRect(); return { x: e.x, y: e.y, w: e.width, h: e.height }; }, id);
        await p.mouse.move(r.x + r.w / 2, r.y + r.h / 2); await p.waitForTimeout(300);
        hov.push({ f: await rows(id, 0.1), g: await rows(id, 0.95) });
        await p.mouse.move(2, 2); await p.waitForTimeout(300);
      }
      const wantR = Math.round(3 * dpr), wantH = Math.round(6 * dpr);
      const t = `평소 ${rest.map((q) => q.f.any + '/' + q.g.any).join(' ')} · 올림 ${hov.map((q) => q.f.any + '/' + q.g.any).join(' ')} (흐린 줄 ${[...rest, ...hov].map((q) => q.f.soft).join('')})`;
      ok(rest.every((q) => q.f.any === wantR && q.g.any === wantR && q.f.soft === 0), `배율 ${dpr} ${mode}: 세 막대 평소 두께 같음 = 3px(${wantR} 기기 픽셀, 흐린 줄 없음)`, t);
      ok(hov.every((q) => q.f.any === wantH && q.f.soft === 0), `배율 ${dpr} ${mode}: 마우스 올리면 세 막대 같은 6px(${wantH} 기기 픽셀)`, t);
    }
    // 누르는 자리: 막대 바깥(입력칸 위 가장자리 1px 아래)을 눌러도 값이 바뀌고, 끌면 끝까지
    await setup(p, 'dark');
    await p.evaluate(() => openPanel('settings'));
    const id = 'panel-opacity-slider';
    await p.$eval('#' + id, (e) => { e.value = 0; e.dispatchEvent(new Event('input')); });
    const r = await p.evaluate((i) => { const e = document.getElementById(i).getBoundingClientRect(); return { x: e.x, y: e.y, w: e.width, h: e.height }; }, id);
    await p.mouse.click(r.x + r.w * 0.5, r.y + 1.5);
    const v1 = await p.$eval('#' + id, (e) => +e.value);
    await p.mouse.move(r.x + r.w * 0.3, r.y + r.h - 1.5); await p.mouse.down();
    await p.mouse.move(r.x + r.w * 1.3, r.y + r.h - 1.5, { steps: 5 }); await p.mouse.up();
    const v2 = await p.$eval('#' + id, (e) => +e.value);
    ok(v1 >= 40 && v1 <= 60 && v2 === 100, `배율 ${dpr}: 막대 위·아래 바깥(16px 잡는 자리 안)을 눌러도·끌어도 값이 바뀜`, `가운데 위쪽 클릭 ${v1} · 아래쪽 끌기 ${v2}`);
    await p.$eval('#' + id, (e) => { e.value = 50; e.dispatchEvent(new Event('input')); });
    ok(perr.length === 0, `배율 ${dpr}: 페이지 오류 없음`, perr.join(' | '));
    await b.close();
  }

  console.log(results.join('\n'));
  console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
