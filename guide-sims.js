// 學習指引的小模擬（Canvas 2D）
// 每個模擬是一個函式：SIMS.name(host) → { destroy }
import { sunAt, altAz, D2R } from './astro.js';

const COL = {
  space: '#05070d', day: '#3f86d6', dayHi: '#7fb8f0', night: '#121a33', land: '#5c9a52', landNight: '#24361f',
  sun: '#ffd23f', ray: 'rgba(255,216,77,.55)', text: '#e6ebf5', dim: '#93a0bd', red: '#ff5a5a', line: '#26324f',
  green: '#6ad48a', blue: '#5fb2ff', orange: '#ff9a3d',
};
const pad2 = (n) => String(n).padStart(2, '0');
const hhmm = (h) => { h = ((h % 24) + 24) % 24; const m = Math.round(h * 60); return `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`; };

// ───────────────────────── 共用框架 ─────────────────────────
/**
 * opt.state     初始狀態
 * opt.controls  [{type:'range',key,label,min,max,step,fmt}, {type:'play'}, {type:'seg',key,options:[[value,label]]}]
 * opt.play      {key, speed, min, max}  播放時每秒讓 s[key] 增加 speed，超過 max 回到 min
 * opt.drag      (x, y, s, W, H) 手指或滑鼠拖曳畫面
 * opt.draw      (ctx, W, H, s) 畫圖；回傳字串會顯示在畫面下方
 */
export function makeSim(host, opt) {
  const box = document.createElement('div'); box.className = 'sim';
  const cv = document.createElement('canvas');
  const info = document.createElement('div'); info.className = 'siminfo';
  const ctl = document.createElement('div'); ctl.className = 'simctl';
  box.append(cv, info, ctl);
  host.appendChild(box);
  const s = { ...(opt.state || {}) };
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, raf = 0, playing = false, last = performance.now(), dirty = true;
  const syncers = [];

  for (const c of opt.controls || []) {
    if (c.type === 'play') {
      const b = document.createElement('button'); b.className = 'play'; b.textContent = '▶'; b.title = '播放／暫停';
      b.onclick = () => { playing = !playing; b.textContent = playing ? '❚❚' : '▶'; };
      ctl.appendChild(b);
    } else if (c.type === 'range') {
      const w = document.createElement('label'); w.className = 'rg';
      const sp = document.createElement('span'); sp.textContent = c.label;
      const r = document.createElement('input'); r.type = 'range'; r.min = c.min; r.max = c.max; r.step = c.step || 1;
      const o = document.createElement('output');
      r.oninput = () => { s[c.key] = +r.value; dirty = true; };
      w.append(sp, r, o); ctl.appendChild(w);
      syncers.push(() => { r.value = s[c.key]; o.textContent = c.fmt ? c.fmt(s[c.key]) : s[c.key]; });
    } else if (c.type === 'seg') {
      const g = document.createElement('div'); g.className = 'seg';
      const btns = c.options.map(([v, t]) => {
        const b = document.createElement('button'); b.textContent = t;
        b.onclick = () => { s[c.key] = v; dirty = true; };
        g.appendChild(b); return [v, b];
      });
      ctl.appendChild(g);
      syncers.push(() => btns.forEach(([v, b]) => b.classList.toggle('on', s[c.key] === v)));
    }
  }
  if (!ctl.children.length) ctl.remove();

  function resize() {
    const w = box.clientWidth;
    if (!w) return;
    const h = Math.min(Math.round(w * (opt.aspect || 0.62)), opt.maxH || 460);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = w; H = h; dirty = true;
  }

  if (opt.drag) {
    cv.style.touchAction = 'none'; cv.style.cursor = 'grab';
    let down = false;
    const at = (e) => { const r = cv.getBoundingClientRect(); opt.drag(e.clientX - r.left, e.clientY - r.top, s, W, H); dirty = true; };
    cv.addEventListener('pointerdown', (e) => { down = true; cv.setPointerCapture(e.pointerId); at(e); });
    cv.addEventListener('pointermove', (e) => { if (down) at(e); });
    const up = () => (down = false);
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  } else cv.style.touchAction = 'pan-y';

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (opt.tick && opt.tick(s, dt)) dirty = true;
    if (playing && opt.play) {
      const p = opt.play;
      s[p.key] += p.speed * dt;
      if (s[p.key] > p.max) s[p.key] = p.min + (s[p.key] - p.max);
      dirty = true;
    }
    if (dirty && W) {
      dirty = false;
      syncers.forEach((f) => f());
      ctx.clearRect(0, 0, W, H);
      const txt = opt.draw(ctx, W, H, s);
      if (txt != null) info.innerHTML = txt;
    }
  }
  const ro = new ResizeObserver(resize); ro.observe(box);
  resize();
  raf = requestAnimationFrame(frame);
  return {
    redraw() { dirty = true; },
    destroy() { cancelAnimationFrame(raf); ro.disconnect(); box.remove(); },
  };
}

// ───────────────────────── 繪圖小工具 ─────────────────────────
function bg(ctx, W, H) { ctx.fillStyle = COL.space; ctx.fillRect(0, 0, W, H); stars(ctx, W, H); }
function stars(ctx, W, H) {
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  for (let i = 0; i < 70; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1, y = (Math.sin(i * 78.233) * 12543.123 % 1 + 1) % 1;
    ctx.fillRect(x * W, y * H, 1.2, 1.2);
  }
}
function sun(ctx, x, y, r) {
  const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 1.9);
  g.addColorStop(0, 'rgba(255,220,90,.55)'); g.addColorStop(1, 'rgba(255,170,40,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COL.sun; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
function text(ctx, t, x, y, { color = COL.text, size = 14, align = 'center', bold = false, base = 'middle' } = {}) {
  ctx.font = `${bold ? '700 ' : ''}${size}px system-ui, "Noto Sans TC", "Microsoft JhengHei", sans-serif`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base;
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(t, x, y);
  ctx.fillText(t, x, y);
}
function arrow(ctx, x1, y1, x2, y2, color, w = 2, head = 8) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath(); ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(a - 0.45), y2 - head * Math.sin(a - 0.45));
  ctx.lineTo(x2 - head * Math.cos(a + 0.45), y2 - head * Math.sin(a + 0.45));
  ctx.closePath(); ctx.fill();
}
// 一顆被照亮一半的球：towards = 太陽方向的角度（畫面角度，y 向下）
function litBall(ctx, x, y, r, towards) {
  ctx.fillStyle = COL.night; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(x + Math.cos(towards) * r * 0.5, y + Math.sin(towards) * r * 0.5, r * 0.1, x, y, r);
  g.addColorStop(0, COL.dayHi); g.addColorStop(1, COL.day);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, towards - Math.PI / 2, towards + Math.PI / 2); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
}
// 平行光線：從 dir（光行進方向）打到圓心 (x,y) 半徑 r 的球上
function parallelRays(ctx, x, y, r, dirAng, len, n = 7) {
  const dx = Math.cos(dirAng), dy = Math.sin(dirAng), px = -dy, py = dx;
  ctx.strokeStyle = COL.ray; ctx.lineWidth = 1.5;
  for (let i = 0; i < n; i++) {
    const k = ((i / (n - 1)) * 2 - 1) * 0.85;
    const depth = Math.sqrt(1 - k * k) * r;
    const hx = x + px * k * r - dx * depth, hy = y + py * k * r - dy * depth;
    arrow(ctx, hx - dx * len, hy - dy * len, hx - dx * 4, hy - dy * 4, COL.ray, 1.5, 6);
  }
}

// ───────────────────────── 第 1 課：手電筒照皮球 ─────────────────────────
function lampBall(host) {
  return makeSim(host, {
    aspect: 0.62,
    state: { ang: Math.PI * 1.1 },
    drag: (x, y, s, W, H) => { s.ang = Math.atan2(y - H / 2, x - W / 2); },
    draw(ctx, W, H, s) {
      bg(ctx, W, H);
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.2;
      const D = Math.min(W * 0.42, H * 0.42);
      const sx = cx + Math.cos(s.ang) * D, sy = cy + Math.sin(s.ang) * D;
      parallelRays(ctx, cx, cy, R, s.ang + Math.PI, D - R * 1.6, 7);
      litBall(ctx, cx, cy, R, s.ang);
      text(ctx, '白天', cx + Math.cos(s.ang) * R * 0.5, cy + Math.sin(s.ang) * R * 0.5, { bold: true, size: 15 });
      text(ctx, '黑夜', cx - Math.cos(s.ang) * R * 0.5, cy - Math.sin(s.ang) * R * 0.5, { bold: true, size: 15, color: '#aab4d0' });
      sun(ctx, sx, sy, Math.min(W, H) * 0.06);
      text(ctx, '太陽（拖我）', sx, sy + Math.min(W, H) * 0.06 + 14, { color: COL.sun, size: 13 });
      text(ctx, '地球', cx, cy + R + 16, { color: COL.dim, size: 13 });
      return '亮的那一半永遠朝著太陽：<b>一半白天，一半黑夜</b>。';
    },
  });
}

// ───────────────────────── 第 2 課：從北極往下看地球自轉 ─────────────────────────
// 畫面角度（數學角度，逆時針為正）：中午時「你家」正對左邊的太陽
const homeAngle = (h) => Math.PI + (h - 12) * 15 * D2R;
function topDownEarth(ctx, cx, cy, R, h, { showOther = true, person = false } = {}) {
  // 夜半邊在右邊（背對太陽）
  ctx.fillStyle = COL.day; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(8,12,30,.78)'; ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.78, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
  text(ctx, '北極', cx, cy - 12, { size: 11, color: '#dfe6f5' });
  // 自轉方向箭頭（逆時針）
  ctx.strokeStyle = COL.green; ctx.lineWidth = 2.5;
  const a0 = -Math.PI * 0.32, a1 = -Math.PI * 0.68, rr = R * 1.14;
  ctx.beginPath(); ctx.arc(cx, cy, rr, a0, a1, true); ctx.stroke();
  const ex = cx + Math.cos(a1) * rr, ey = cy + Math.sin(a1) * rr;
  arrow(ctx, ex + 6, ey - 2, ex - 1, ey + 1, COL.green, 2.5, 9);
  text(ctx, '自轉方向', cx, cy - rr - 12, { size: 12, color: COL.green });
  const ang = homeAngle(h);
  const hx = cx + Math.cos(ang) * R * 0.78, hy = cy - Math.sin(ang) * R * 0.78;
  if (showOther) {
    const ox = cx - Math.cos(ang) * R * 0.78, oy = cy + Math.sin(ang) * R * 0.78;
    ctx.fillStyle = COL.orange; ctx.beginPath(); ctx.arc(ox, oy, 6, 0, Math.PI * 2); ctx.fill();
    text(ctx, '地球另一邊', ox, oy + 15, { size: 11, color: COL.orange });
  }
  ctx.fillStyle = COL.red; ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  text(ctx, person ? '你' : '你家', hx, hy - 16, { size: 13, bold: true });
  return { hx, hy, ang };
}
function dayState(h) {
  const x = ((h % 24) + 24) % 24;
  if (Math.abs(x - 6) < 0.4) return '剛好日出';
  if (Math.abs(x - 18) < 0.4) return '剛好日落';
  return x > 6 && x < 18 ? '白天' : '黑夜';
}
function spinDay(host) {
  return makeSim(host, {
    aspect: 0.62,
    state: { h: 9 },
    controls: [{ type: 'play' }, { type: 'range', key: 'h', label: '轉動地球', min: 0, max: 24, step: 0.05, fmt: hhmm }],
    play: { key: 'h', speed: 2, min: 0, max: 24 },
    draw(ctx, W, H, s) {
      bg(ctx, W, H);
      const R = Math.min(W * 0.3, H * 0.36), cx = W * 0.6, cy = H / 2 + 6;
      sun(ctx, W * 0.08, cy, Math.min(W, H) * 0.06);
      text(ctx, '太陽', W * 0.08, cy + Math.min(W, H) * 0.06 + 14, { color: COL.sun, size: 13 });
      parallelRays(ctx, cx, cy, R, 0, cx - R - W * 0.15, 6);
      topDownEarth(ctx, cx, cy, R, s.h);
      text(ctx, '白天', cx - R * 0.45, cy + R * 0.45, { size: 13, color: '#e6f0ff' });
      text(ctx, '黑夜', cx + R * 0.45, cy + R * 0.45, { size: 13, color: '#aab4d0' });
      const st = dayState(s.h), other = dayState(s.h + 12);
      return `現在 <b>${hhmm(s.h)}</b>：你家是<b>${st}</b>，地球另一邊是<b>${other}</b>。`;
    },
  });
}

// ───────────────────────── 第 3 課：地球往東轉，太陽看起來往西走 ─────────────────────────
const TPE = { lat: 25.03, lon: 121.56, tz: 8 };
function eastRise(host) {
  const t0 = Date.UTC(2026, 2, 20) - TPE.tz * 3600000; // 台北春分那天 00:00
  const path = [];
  for (let m = 4 * 60; m <= 20 * 60; m += 10) path.push(altAz(t0 + m * 60000, TPE.lat, TPE.lon));
  return makeSim(host, {
    aspect: 0.95, maxH: 640,
    state: { h: 6.2 },
    controls: [{ type: 'play' }, { type: 'range', key: 'h', label: '時間', min: 5, max: 19, step: 0.05, fmt: hhmm }],
    play: { key: 'h', speed: 1, min: 5, max: 19 },
    draw(ctx, W, H, s) {
      bg(ctx, W, H);
      const topH = H * 0.52;
      // 上半：從北極看
      const R = Math.min(W * 0.26, topH * 0.36), cx = W * 0.6, cy = topH / 2 + 8;
      sun(ctx, W * 0.08, cy, Math.min(W, H) * 0.045);
      parallelRays(ctx, cx, cy, R, 0, cx - R - W * 0.13, 5);
      const { hx, hy, ang } = topDownEarth(ctx, cx, cy, R, s.h, { showOther: false, person: true });
      // 你的「東方」＝地球轉過去的方向（切線方向）
      const tx = -Math.sin(ang), ty = -Math.cos(ang);
      arrow(ctx, hx, hy, hx + tx * 34, hy + ty * 34, COL.green, 2, 7);
      text(ctx, '東', hx + tx * 46, hy + ty * 46, { size: 13, bold: true, color: COL.green });
      text(ctx, '① 從太空看：地球帶著你往東轉', 12, 16, { align: 'left', size: 13, color: COL.dim });
      // 分隔線
      ctx.strokeStyle = COL.line; ctx.beginPath(); ctx.moveTo(0, topH); ctx.lineTo(W, topH); ctx.stroke();
      // 下半：你看到的天空（面向南方）
      const gy = H - 64, top = topH + 30, padX = 26;
      const X = (az) => padX + ((az - 60) / 240) * (W - padX * 2);
      const Y = (alt) => gy - (alt / 70) * (gy - top);
      const sky = ctx.createLinearGradient(0, top, 0, gy);
      const { alt, az } = altAz(t0 + s.h * 3600000, TPE.lat, TPE.lon);
      const k = Math.max(0, Math.min(1, (alt + 4) / 14));
      sky.addColorStop(0, `rgba(80,140,220,${0.15 + 0.6 * k})`); sky.addColorStop(1, `rgba(150,190,240,${0.1 + 0.5 * k})`);
      ctx.fillStyle = sky; ctx.fillRect(0, topH + 1, W, gy - topH - 1);
      ctx.fillStyle = '#3c5a32'; ctx.fillRect(0, gy, W, H - gy);
      ctx.strokeStyle = 'rgba(255,230,140,.6)'; ctx.setLineDash([3, 4]); ctx.lineWidth = 1.5; ctx.beginPath();
      path.forEach((p, i) => { const x = X(p.az), y = Y(Math.max(p.alt, -3)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke(); ctx.setLineDash([]);
      for (const [t, a] of [['東', 90], ['東南', 135], ['南', 180], ['西南', 225], ['西', 270]])
        text(ctx, t, X(a), gy + 12, { size: t.length > 1 ? 12 : 15, bold: t.length === 1, color: t.length > 1 ? COL.dim : COL.text });
      // 你的背影（從背後看，所以你的左手就在畫面左邊）
      backView(ctx, X(180), gy + 30);
      if (alt > -4) sun(ctx, X(az), Y(alt), 11);
      text(ctx, '② 你站在台北面向南方，看到的天空', 12, topH + 16, { align: 'left', size: 13, color: COL.dim });
      const where = alt < -0.8 ? '太陽還在地平線下' : alt < 3 ? (s.h < 12 ? '太陽剛從東邊升起' : '太陽正要從西邊落下') : `太陽高度 ${alt.toFixed(0)}°，在${az < 175 ? '東南' : az > 185 ? '西南' : '正南'}方`;
      return `<b>${hhmm(s.h)}</b>：${where}。地球轉多少，太陽就「跑」多少。`;
    },
  });
}

// ───────────────────────── 第 4 課：世界地圖上的晨昏線 ─────────────────────────
let landPromise = null;
function loadLand() {
  if (!landPromise) {
    landPromise = fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json')
      .then((r) => r.json())
      .then((topo) => {
        const f = topojson.feature(topo, topo.objects.land);
        const polys = [];
        for (const g of f.features.map((x) => x.geometry)) {
          if (g.type === 'Polygon') polys.push(g.coordinates);
          else if (g.type === 'MultiPolygon') polys.push(...g.coordinates);
        }
        return polys;
      })
      .catch(() => []);
  }
  return landPromise;
}
const CITIES = [
  ['台北', 25.03, 121.56], ['東京', 35.68, 139.69], ['倫敦', 51.51, -0.13],
  ['紐約', 40.71, -74.0], ['雪梨', -33.87, 151.21], ['開普敦', -33.92, 18.42],
];
const DATES = { 0: [2, 20, '春分 3/20'], 1: [5, 21, '夏至 6/21'], 3: [11, 22, '冬至 12/22'] };
function dayNightMap(host) {
  let land = null, landCanvas = null, landW = 0;
  const night = document.createElement('canvas'); night.width = 240; night.height = 120;
  const nctx = night.getContext('2d'); const img = nctx.createImageData(240, 120);
  const sim = makeSim(host, {
    aspect: 0.56,
    state: { d: 0, h: 5 },
    controls: [
      { type: 'play' },
      { type: 'range', key: 'h', label: '台北時間', min: 0, max: 24, step: 0.05, fmt: hhmm },
      { type: 'seg', key: 'd', options: [[0, '春分'], [1, '夏至'], [3, '冬至']] },
    ],
    play: { key: 'h', speed: 1.5, min: 0, max: 24 },
    draw(ctx, W, H, s) {
      const mh = Math.min(H - 4, W / 2), mw = mh * 2, ox = (W - mw) / 2, oy = (H - mh) / 2;
      const X = (lon) => ox + ((lon + 180) / 360) * mw, Y = (lat) => oy + ((90 - lat) / 180) * mh;
      ctx.fillStyle = '#1d5a96'; ctx.fillRect(ox, oy, mw, mh);
      if (land && land.length) {
        if (!landCanvas || landW !== Math.round(mw)) {
          landW = Math.round(mw);
          landCanvas = document.createElement('canvas'); landCanvas.width = landW * 2; landCanvas.height = landW;
          const c = landCanvas.getContext('2d'), k = landW * 2 / 360;
          for (const poly of land) {
            const meanLat = poly[0].reduce((a, p) => a + p[1], 0) / poly[0].length;
            c.fillStyle = meanLat < -60 ? '#e9eef3' : COL.land;
            c.beginPath();
            for (const ring of poly) { ring.forEach(([lo, la], i) => { const x = (lo + 180) * k, y = (90 - la) * k; i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); }
            c.fill('evenodd');
          }
        }
        ctx.drawImage(landCanvas, ox, oy, mw, mh);
      }
      const [mo, da, label] = DATES[s.d];
      const t = Date.UTC(2026, mo, da) - TPE.tz * 3600000 + s.h * 3600000;
      const sa = sunAt(t), d = sa.decl * D2R;
      // 夜晚陰影：每個格子算太陽在那裡的高度
      for (let j = 0; j < 120; j++) {
        const lat = (90 - (j + 0.5) * 1.5) * D2R;
        for (let i = 0; i < 240; i++) {
          const lon = -180 + (i + 0.5) * 1.5;
          const cz = Math.sin(lat) * Math.sin(d) + Math.cos(lat) * Math.cos(d) * Math.cos((lon - sa.subLon) * D2R);
          const a = cz > 0.0145 ? 0 : cz < -0.105 ? 0.68 : 0.68 * (0.0145 - cz) / 0.1195;
          const p = (j * 240 + i) * 4;
          img.data[p] = 5; img.data[p + 1] = 8; img.data[p + 2] = 25; img.data[p + 3] = a * 255;
        }
      }
      nctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(night, ox, oy, mw, mh);
      // 晨昏線
      const dd = Math.abs(sa.decl) < 0.05 ? 0.05 * Math.sign(sa.decl || 1) : sa.decl;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath();
      let prevLat = null;
      for (let lon = -180; lon <= 180; lon += 0.5) {
        const lat = Math.atan(-Math.cos((lon - sa.subLon) * D2R) / Math.tan(dd * D2R)) / D2R;
        // 春分、秋分時線會貼著地圖上下邊緣跑，那段不畫
        const hug = prevLat !== null && Math.abs(lat) > 88.5 && Math.abs(prevLat) > 88.5;
        prevLat === null || hug ? ctx.moveTo(X(lon), Y(lat)) : ctx.lineTo(X(lon), Y(lat));
        prevLat = lat;
      }
      ctx.stroke();
      // 太陽直射點
      sun(ctx, X(sa.subLon), Y(sa.subLat), 7);
      // 城市
      let tpe = '';
      for (const [n, la, lo] of CITIES) {
        const a1 = altAz(t, la, lo).alt, a2 = altAz(t + 600000, la, lo).alt;
        const st = a1 > 3 ? '白天' : a1 < -6 ? '黑夜' : (a2 > a1 ? '日出中' : '日落中');
        const col = st === '白天' ? '#fff' : st === '黑夜' ? '#9aa6c6' : COL.orange;
        ctx.fillStyle = n === '台北' ? COL.red : col;
        ctx.beginPath(); ctx.arc(X(lo), Y(la), n === '台北' ? 5 : 3.5, 0, Math.PI * 2); ctx.fill();
        text(ctx, `${n} ${st}`, X(lo), Y(la) - 11, { size: 11.5, color: col, bold: n === '台北' });
        if (n === '台北') tpe = st;
      }
      return `${label}・台北時間 <b>${hhmm(s.h)}</b>：台北是<b>${tpe}</b>。白線＝晨昏線，小太陽＝太陽正頭頂的地方。`;
    },
  });
  loadLand().then((p) => { land = p; sim.redraw(); });
  return sim;
}

// ───────────────────────── 第 3 課（前半）：先面向北方，再轉身面向南方 ─────────────────────────
// 從背後看的小人：頭、身體、張開的雙手
function backView(ctx, x, y) {
  ctx.strokeStyle = '#ffe2c4'; ctx.fillStyle = '#ffe2c4'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x, y - 2, 6, 0, Math.PI * 2); ctx.fill();          // 頭（後腦勺）
  ctx.fillStyle = '#e8553e'; ctx.beginPath(); ctx.roundRect(x - 7, y + 5, 14, 17, 4); ctx.fill(); // 身體
  ctx.beginPath(); ctx.moveTo(x - 6, y + 9); ctx.lineTo(x - 28, y + 9); ctx.moveTo(x + 6, y + 9); ctx.lineTo(x + 28, y + 9); ctx.stroke(); // 雙手
  ctx.lineCap = 'butt';
  text(ctx, '左手', x - 44, y + 9, { size: 11, color: '#ffe2c4' });
  text(ctx, '右手', x + 44, y + 9, { size: 11, color: '#ffe2c4' });
}
// 羅盤方位 az（由北順時針）→ 畫面方向（上＝北）
const scr = (az) => [Math.sin(az * D2R), -Math.cos(az * D2R)];
const DIR8 = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];
const dir8 = (az) => DIR8[Math.round((((az % 360) + 360) % 360) / 45) % 8];
function turnAround(host) {
  return makeSim(host, {
    aspect: 0.72, maxH: 470,
    state: { face: 0, target: 0 },
    controls: [{ type: 'seg', key: 'target', options: [[0, '面向北方'], [180, '轉身面向南方']] }],
    // 慢慢轉過去，看得到轉身的過程（每秒 120°，從右手邊轉）
    tick(s, dt) {
      if (s.face === s.target) return false;
      const dir = s.target > s.face ? 1 : -1;
      s.face += dir * Math.min(120 * dt, Math.abs(s.target - s.face));
      return true;
    },
    draw(ctx, W, H, s) {
      ctx.fillStyle = '#20331d'; ctx.fillRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2 + 4, R = Math.min(W, H) * 0.36;
      // 地上的方位圈：東西南北固定不動
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      for (let a = 0; a < 360; a += 45) {
        const [dx, dy] = scr(a), big = a % 90 === 0;
        ctx.beginPath(); ctx.moveTo(cx + dx * R * 0.92, cy + dy * R * 0.92); ctx.lineTo(cx + dx * R, cy + dy * R); ctx.stroke();
        text(ctx, DIR8[a / 45], cx + dx * (R + (big ? 20 : 18)), cy + dy * (R + (big ? 20 : 18)),
          { size: big ? 20 : 12, bold: big, color: big ? '#fff' : COL.dim });
      }
      // 中午的太陽在南邊（台灣）
      sun(ctx, cx, cy + R * 0.86, 9);
      text(ctx, '中午的太陽', cx + 14, cy + R * 0.86, { size: 11, color: COL.sun, align: 'left' });
      // 小人（從正上方往下看）
      const f = s.face, [fx, fy] = scr(f), [rx, ry] = scr(f + 90), [lx, ly] = scr(f - 90);
      const arm = R * 0.62, sh = 13;
      ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + fx * R * 0.8, cy + fy * R * 0.8); ctx.stroke(); ctx.setLineDash([]);
      arrow(ctx, cx + fx * R * 0.6, cy + fy * R * 0.6, cx + fx * R * 0.82, cy + fy * R * 0.82, 'rgba(255,255,255,.7)', 2, 9);
      ctx.lineCap = 'round'; ctx.lineWidth = 5;
      ctx.strokeStyle = COL.blue; ctx.beginPath(); ctx.moveTo(cx + rx * sh, cy + ry * sh); ctx.lineTo(cx + rx * arm, cy + ry * arm); ctx.stroke();
      ctx.strokeStyle = COL.orange; ctx.beginPath(); ctx.moveTo(cx + lx * sh, cy + ly * sh); ctx.lineTo(cx + lx * arm, cy + ly * arm); ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = '#e8553e'; ctx.beginPath(); ctx.ellipse(cx, cy, 16, 9, f * D2R, 0, Math.PI * 2); ctx.fill(); // 肩膀
      ctx.fillStyle = '#ffe2c4'; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();              // 頭
      ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(cx + fx * 6, cy + fy * 6, 2.2, 0, Math.PI * 2); ctx.fill(); // 鼻子＝臉朝的方向
      text(ctx, '右手', cx + rx * (arm + 22), cy + ry * (arm + 22), { size: 14, bold: true, color: COL.blue });
      text(ctx, '左手', cx + lx * (arm + 22), cy + ly * (arm + 22), { size: 14, bold: true, color: COL.orange });
      text(ctx, '從正上方往下看', 10, 14, { align: 'left', size: 12, color: COL.dim });
      const moving = s.face !== s.target;
      if (moving) return '轉身中……注意：地上的東西南北<b>都沒有動</b>，動的是你的身體。';
      return `你面向<b>${dir8(f)}方</b>：右手指向<b>${dir8(f + 90)}</b>，左手指向<b>${dir8(f - 90)}</b>。`;
    },
  });
}

export const SIMS = { lampBall, spinDay, eastRise, dayNightMap, turnAround };
