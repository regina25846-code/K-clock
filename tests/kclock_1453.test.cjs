// K-Clock 1.4.5-3 시험 (PND-0412, 형 46135 ④) — 다크 스위치 몸통 테두리가 패널에 묻혀 안 보이던 것.
// ① 다크: 설정 4개·알람 줄 스위치 모두 밝은 회색 가는 테(금색 아님) — 패널 투명도 0·50·100 × 패널 색상 자동·검정에서
//    테두리 픽셀과 패널 바탕의 명암 대비 1.5 이상·3.0 이하(보이되 튀지 않게), 배율 1·1.25 실제 기기 픽셀로 잰다.
// ② 라이트: 스위치 변수가 1.4.5-2(a32b64e) 그대로, 테는 투명.
// ③ 테 때문에 스위치 크기·동그라미 자리가 바뀌지 않음, 테마 바꿀 때 테 색도 서서히.
// 실행: node tests/kclock_1453.test.cjs — 맥 크로미움으로 실제 dist/index.html 을 띄워 잰다.
//   배율은 브라우저를 그 배율로 띄운다(--force-device-scale-factor, 1452b 와 같은 이유).
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
];
const L = (rgb) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
const cr = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const sat = (rgb) => { const mx = Math.max(...rgb), mn = Math.min(...rgb); return mx === 0 ? 0 : (mx - mn) / mx; };
const nums = (s) => (s.match(/[\d.]+/g) || []).map(Number);
// a32b64e(1.4.5-2) 라이트 스위치 값 — 한 글자도 안 바뀌어야 한다
const LIGHT_WANT = {
  '--sw-bg': 'rgba(255,255,255,.35)',
  '--sw-sh': '2px 2px 9px rgba(0,0,0,.09), -2px -2px 9px rgba(255,255,255,.45)',
  '--gv-sh': 'inset 1px 1px 4px rgba(0,0,0,.14), inset -1px -1px 4px rgba(255,255,255,.6)',
  '--kn-off': '#c9c1b1', '--kn-on': '#d9b25a', '--sw-ring': '#8a6a2f',
};

async function state(pg, mode, op, pc) {
  await pg.evaluate(([c, b, op, pc]) => {
    document.documentElement.style.background = c; document.body.style.background = c;
    setClockAuto(false);
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
    set('brightness-slider', b); set('panel-opacity-slider', op);
    changePanelColor(pc); applyColors(false);
  }, [DESK[mode], mode === 'light' ? 35 : 253, op, pc]);
  await pg.waitForTimeout(450);
}
async function shotPx(pg, clip) {
  const buf = await pg.screenshot({ clip });
  return pg.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    return { w: img.width, h: img.height, d: Array.from(x.getImageData(0, 0, img.width, img.height).data) };
  }, buf.toString('base64'));
}
// 스위치 가운데 세로줄(몸통 위 3px 바깥 ~ 안 3px)에서 몸통 위 끝 ±0.6px 안 가장 밝은 기기 픽셀 vs 같은 높이 패널 바탕(패널 왼쪽 안 여백)
async function edgeContrast(pg, el, dpr) {
  const r = await el.evaluate((e) => { const b = e.getBoundingClientRect(); const p = e.closest('.panel').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, px: p.x }; });
  const col = await shotPx(pg, { x: r.x + r.w / 2, y: r.y - 3, width: 1, height: 6 });
  const rows = []; for (let y = 0; y < col.h; y++) { const i = (y * col.w + Math.floor(col.w / 2)) * 4; rows.push([col.d[i], col.d[i + 1], col.d[i + 2]]); }
  const bgp = await shotPx(pg, { x: r.px + 3, y: r.y + r.h / 2, width: 1, height: 1 });
  const bg = [bgp.d[0], bgp.d[1], bgp.d[2]];
  let edge = null, best = -1;
  for (let y = Math.floor(2.4 * dpr); y < Math.min(rows.length, Math.ceil(4.6 * dpr)); y++) { const l = L(rows[y]); if (l > best) { best = l; edge = rows[y]; } }
  return { c: cr(edge, bg), edge, bg };
}

(async () => {
  // ── ① 다크 테두리 대비(배율 1·1.25) + 테 색·모양 ──
  for (const dpr of [1, 1.25]) {
    const b = await chromium.launch({ args: [`--force-device-scale-factor=${dpr}`] });
    const c = await b.newContext({ viewport: null });
    const pg = await c.newPage();
    const perr = []; pg.on('pageerror', (e) => perr.push(String(e)));
    await pg.addInitScript((al) => localStorage.setItem('alarms', JSON.stringify(al)), ALARMS);
    await pg.goto('file://' + path.join(DIST, 'index.html'));
    await pg.evaluate(() => document.fonts.ready);
    const real = await pg.evaluate(() => devicePixelRatio);
    ok(Math.abs(real - dpr) < 0.01, `배율 ${dpr}: 브라우저가 그 배율로 뜸`, String(real));
    for (const pc of ['auto', 'black']) for (const op of [0, 50, 100]) {
      await state(pg, 'dark', op, pc);
      const got = [];
      for (const panel of ['settings', 'alarm']) {
        await pg.evaluate((p) => openPanel(p), panel); await pg.waitForTimeout(400); await pg.mouse.move(2, 2);
        const els = await pg.$$(panel === 'settings' ? '#panel-settings .toggle' : '#alarm-list .alarm-toggle');
        for (const el of els) got.push({ panel, ...(await edgeContrast(pg, el, real)) });
      }
      const min = Math.min(...got.map((g) => g.c)), max = Math.max(...got.map((g) => g.c));
      ok(got.length === 6 && min >= 1.5 && max <= 3.0, `배율 ${dpr} 다크 패널색 ${pc} 투명도 ${op}: 스위치 6개(설정 4·알람 2) 테두리 대비 1.5~3.0`, `최소 ${min.toFixed(2)} 최대 ${max.toFixed(2)} (테 rgb(${got[0].edge}) / 바탕 rgb(${got[0].bg}))`);
    }
    ok(perr.length === 0, `배율 ${dpr}: 페이지 오류 없음`, perr.join(' | '));
    await b.close();
  }

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 300, height: 560 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.addInitScript((al) => localStorage.setItem('alarms', JSON.stringify(al)), ALARMS);
  await page.goto('file://' + path.join(DIST, 'index.html'));
  await page.evaluate(() => document.fonts.ready);
  // 스위치는 열린 창에서만 크기가 잡힌다 — 설정·알람 창을 차례로 열어 모은다
  const swInfo = async () => { const out = []; for (const [p, sel] of [['settings', '#panel-settings .toggle'], ['alarm', '#alarm-list .alarm-toggle']]) { await page.evaluate((q) => openPanel(q), p); await page.waitForTimeout(350); out.push(...(await swOne(sel))); } return out; };
  const swOne = (sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => {
    const b = getComputedStyle(e, '::before'); const r = e.getBoundingClientRect(); const k = e.querySelector('.kn').getBoundingClientRect(); const g = e.querySelector('.gv').getBoundingClientRect();
    const bx = (v) => parseFloat(v) + (b.boxSizing === 'border-box' ? 0 : 2 * parseFloat(b.borderTopWidth));   // 테 바깥 크기
    return { id: e.id || e.dataset.id, bc: b.borderTopColor, bw: b.borderTopWidth, bst: b.borderTopStyle, inset: `${b.top} ${b.left} ${bx(b.width)}×${bx(b.height)}`, pe: b.pointerEvents,
      size: `${r.width}×${r.height}`, kn: `${(k.x - r.x).toFixed(3)},${(k.y - r.y).toFixed(3)}`, gv: `${(g.x - r.x).toFixed(3)},${(g.y - r.y).toFixed(3)},${g.width}×${g.height}`,
      own: ['Top', 'Right', 'Bottom', 'Left'].map((s) => parseFloat(getComputedStyle(e)['border' + s + 'Width']) || 0).reduce((a, x) => a + x, 0) };
  }), sel);

  // 다크 테 = 밝은 회색(무채색, 금색 아님) 1px 실선, 몸통 전체를 두름, 누르기 막지 않음
  await state(page, 'dark', 50, 'black');
  const dk = await swInfo();
  ok(dk.length === 6, '스위치 6개(설정 4·알람 2) 잡힘', String(dk.length));
  ok(dk.every((s) => { const v = nums(s.bc); return v.length === 4 && v[3] >= 0.12 && v[3] <= 0.35 && sat(v.slice(0, 3)) <= 0.02 && v[0] >= 200; }),
    '다크 테 색 = 반투명 밝은 회색(무채색, 금색 아님)', [...new Set(dk.map((s) => s.bc))].join(' / '));
  ok(dk.every((s) => s.bw === '1px' && s.bst === 'solid' && s.pe === 'none'), '다크 테 1px 실선·누르기 안 막음', [...new Set(dk.map((s) => s.bw + ' ' + s.bst + ' ' + s.pe))].join(' / '));
  ok(dk.every((s) => s.inset === '0px 0px 36×18'), '테가 몸통(36×18)과 같은 자리·크기', [...new Set(dk.map((s) => s.inset))].join(' / '));
  const dkBody = await page.evaluate(() => getComputedStyle(document.querySelector('#panel-settings .toggle')).backgroundColor);
  ok(dkBody === 'rgba(255, 255, 255, 0.06)', '다크 몸통 살짝 밝게(.03 → .06)', dkBody);

  // ② 라이트: 변수 a32b64e 그대로·테 투명
  await state(page, 'light', 50, 'white');
  await page.waitForTimeout(800);
  const lv = await page.evaluate((keys) => { const p = document.querySelector('#panel-settings'); const cs = getComputedStyle(p); return Object.fromEntries(keys.map((k) => [k, cs.getPropertyValue(k).trim()])); }, Object.keys(LIGHT_WANT));
  for (const [k, v] of Object.entries(LIGHT_WANT)) ok(lv[k] === v, `라이트 ${k} 그대로`, lv[k]);
  const lt = await swInfo();
  ok(lt.every((s) => s.bc === 'rgba(0, 0, 0, 0)'), '라이트 테 투명(보이는 것 없음)', [...new Set(lt.map((s) => s.bc))].join(' / '));
  ok(lt.every((s) => s.own === 0) && dk.every((s) => s.own === 0), '스위치 몸통 자체 테두리 폭 0(크기·안쪽 자리 그대로)');

  // ③ 크기·동그라미·홈 자리: 다크 = 라이트(테가 자리를 밀지 않음)
  ok(dk.every((s, i) => s.size === lt[i].size && s.kn === lt[i].kn && s.gv === lt[i].gv) && dk.every((s) => s.size === '36×18'), '테 있어도 스위치 36×18·홈·동그라미 자리 그대로(다크 = 라이트)', `${dk[0].size} 홈 ${dk[0].gv} 동그라미 ${dk[0].kn}`);

  // ④ 테마 바꿀 때 테 색도 서서히(글자색 자동 전환 0.6초) — 라이트 → 다크 0.25초 때 아직 중간
  await page.evaluate(() => openPanel('settings')); await page.waitForTimeout(300);
  await page.evaluate(() => { document.documentElement.style.background = '#303746'; document.body.style.background = '#303746'; changeBrightness(253); panelColor = 'black'; applyColors(true); });
  await page.waitForTimeout(250);
  const mid = await page.evaluate(() => getComputedStyle(document.querySelector('#panel-settings .toggle'), '::before').borderTopColor);
  await page.waitForTimeout(900);
  const end = await page.evaluate(() => getComputedStyle(document.querySelector('#panel-settings .toggle'), '::before').borderTopColor);
  const ma = nums(mid)[3] ?? 1, ea = nums(end)[3] ?? 1;
  ok(ma > 0 && ma < ea, '테마 전환 때 테 색 서서히(0.25초 때 투명과 끝 값 사이)', `중간 ${mid} → 끝 ${end}`);

  // ⑤ 키보드 초점 고리는 그대로(:focus-visible 만)
  await page.evaluate(() => openPanel('settings'));
  await page.focus('#tog-sec'); await page.keyboard.press('Shift'); await page.waitForTimeout(100);
  const fv = await page.evaluate(() => { const e = document.getElementById('tog-sec'); return { sh: getComputedStyle(e).boxShadow, ol: getComputedStyle(e).outlineStyle }; });
  ok(fv.ol === 'none', '초점 때 기본 외곽선(흰 테두리) 없음', fv.ol);

  await browser.close();
  console.log(results.join('\n'));
  console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
