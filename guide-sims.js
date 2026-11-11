// 學習指引的小模擬（Canvas 2D）
// 每個模擬是一個函式：SIMS.name(host) → { destroy }
import { sunAt, altAz, dayInfo, dirName, D2R } from './astro.js';

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

// ───────────────────────── 共用：日期、緯度 ─────────────────────────
const DAY = 86400000;
const Y0 = Date.UTC(2026, 0, 1);
const dateFmt = (d) => { const x = new Date(Y0 + Math.floor(d) * DAY); return `${x.getUTCMonth() + 1}月${x.getUTCDate()}日`; };
const latFmt = (v, k = 0) => (Math.abs(v) < 0.05 ? '赤道（0°）' : `${v > 0 ? '北' : '南'}緯 ${Math.abs(v).toFixed(k)}°`);
// 一年每天的太陽資料（黃經、赤緯），內插用
let yearCache = null;
function yearData() {
  if (!yearCache) {
    yearCache = [];
    for (let d = 0; d <= 366; d++) { const s = sunAt(Y0 + d * DAY + 4 * 3600000); yearCache.push({ lam: s.lambda, decl: s.decl }); }
  }
  return yearCache;
}
function yearAt(d) {
  const Yd = yearData(), i = Math.max(0, Math.min(365, Math.floor(d))), f = d - i, a = Yd[i], b = Yd[i + 1];
  const dl = ((b.lam - a.lam + 540) % 360) - 180;
  return { lam: (a.lam + dl * f + 360) % 360, decl: a.decl + (b.decl - a.decl) * f };
}
function skyGround(ctx, W, H, gy, alt) {
  const k = Math.max(0, Math.min(1, alt / 40));
  const g = ctx.createLinearGradient(0, 0, 0, gy);
  g.addColorStop(0, `rgb(${20 + 40 * k},${40 + 90 * k},${80 + 120 * k})`); g.addColorStop(1, `rgb(${50 + 90 * k},${80 + 110 * k},${120 + 110 * k})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, gy);
  ctx.fillStyle = '#3c5a32'; ctx.fillRect(0, gy, W, H - gy);
}

// ───────────────────────── 第 5 課：竿影 ─────────────────────────
function shadowLen(host) {
  const geo = (W, H) => ({ gy: H * 0.8, x0: W * 0.36, hs: H * 0.3 });
  return makeSim(host, {
    aspect: 0.62, maxH: 440,
    state: { alt: 40 },
    controls: [{ type: 'range', key: 'alt', label: '太陽高度', min: 8, max: 90, step: 1, fmt: (v) => v + '°' }],
    drag: (x, y, s, W, H) => {
      const { gy, x0, hs } = geo(W, H);
      s.alt = Math.round(Math.max(8, Math.min(90, Math.atan2(gy - hs - y, x0 - x) / D2R)));
    },
    draw(ctx, W, H, s) {
      const { gy, x0, hs } = geo(W, H);
      skyGround(ctx, W, H, gy, s.alt);
      const a = s.alt * D2R, L = hs / Math.tan(a), tipX = x0 + L;
      const d = [Math.cos(a), Math.sin(a)], p = [-Math.sin(a), Math.cos(a)];
      // 光線：一束平行光，碰到竿子的被擋住，其他的落到地上
      // 太陽放在「擦過竿頂那道光」的延長線上
      const top = [x0, gy - hs];
      const D = Math.min(W * 0.5, (top[1] - 26) / Math.max(0.01, d[1]), (x0 - 26) / Math.max(0.01, d[0]));
      const len = D * 0.85;
      for (let k = -4; k <= 3; k++) {
        const ox = top[0] - d[0] * len + p[0] * k * 14, oy = top[1] - d[1] * len + p[1] * k * 14;
        let ex, ey;
        const tS = (x0 - ox) / d[0], yS = oy + tS * d[1];
        if (d[0] > 0.001 && yS >= gy - hs && yS <= gy) { ex = x0; ey = yS; } else { const tg = (gy - oy) / d[1]; ex = ox + tg * d[0]; ey = gy; }
        arrow(ctx, ox, oy, ex, ey, k === 0 ? 'rgba(255,230,120,.95)' : COL.ray, k === 0 ? 2 : 1.3, 6);
      }
      // 影子
      ctx.fillStyle = 'rgba(10,15,10,.75)'; ctx.fillRect(x0, gy - 3, Math.min(tipX, W) - x0, 7);
      // 竿子
      ctx.strokeStyle = '#f0e2c0'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(x0, gy - hs); ctx.stroke();
      text(ctx, '竿子', x0 - 8, gy - hs / 2, { size: 13, align: 'right' });
      if (L > 12) text(ctx, '影子', x0 + Math.min(L, W - x0) / 2, gy + 18, { size: 13, bold: true });
      if (tipX < W - 12 && s.alt < 88) {
        ctx.strokeStyle = COL.sun; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(tipX, gy, 26, Math.PI, Math.PI + a); ctx.stroke();
        text(ctx, s.alt + '°', tipX - 44 * Math.cos(a / 2), gy - 44 * Math.sin(a / 2), { size: 12, color: COL.sun });
      } else if (tipX >= W - 12) text(ctx, '影子太長，超出畫面了 →', W - 8, gy + 18, { size: 12, align: 'right', color: COL.dim });
      const sx = top[0] - d[0] * D, sy = top[1] - d[1] * D;
      sun(ctx, sx, sy, Math.min(W, H) * 0.05);
      text(ctx, '太陽（可以拖）', sx + Math.min(W, H) * 0.05 + 6, sy, { size: 12, align: 'left', color: COL.sun });
      if (s.alt >= 89) return '太陽在正頭頂：<b>幾乎沒有影子</b>，影子縮在竿子腳下。';
      const r = 1 / Math.tan(a);
      const cmp = r > 1.05 ? '，比竿子還長' : r < 0.95 ? '，比竿子短' : '，跟竿子差不多長';
      return `太陽高度 <b>${s.alt}°</b>：影子是竿子的 <b>${r.toFixed(1)} 倍</b>長${cmp}。影子永遠在太陽的<b>對面</b>。`;
    },
  });
}

// ───────────────────────── 第 6 課：天空像一個倒扣的碗 ─────────────────────────
function skyArc(host) {
  const t0 = Date.UTC(2026, 2, 20) - TPE.tz * 3600000;
  const at = (h) => altAz(t0 + h * 3600000, TPE.lat, TPE.lon);
  const path = [];
  for (let h = 5.5; h <= 18.5; h += 1 / 12) path.push({ h, ...at(h) });
  const HS = 0.2;
  const tipOf = ({ alt, az }) => { const L = HS / Math.tan(alt * D2R); return [-Math.sin(az * D2R) * L, -Math.cos(az * D2R) * L, L]; };
  return makeSim(host, {
    aspect: 0.72, maxH: 480,
    state: { h: 7.5 },
    controls: [{ type: 'play' }, { type: 'range', key: 'h', label: '時間', min: 6, max: 18, step: 0.05, fmt: hhmm }],
    play: { key: 'h', speed: 1, min: 6, max: 18 },
    draw(ctx, W, H, s) {
      const now = at(s.h);
      skyGround(ctx, W, H, H, now.alt);
      const G = Math.min(W * 0.42, H * 0.6), cx = W / 2, cy = H * 0.72;
      const P = (x, y, z) => [cx + x * G, cy - y * G * 0.3 - z * G * 0.85];
      const dome = (alt, az) => { const a = alt * D2R, z = az * D2R; return P(Math.cos(a) * Math.sin(z), Math.cos(a) * Math.cos(z), Math.sin(a)); };
      // 地面圓盤
      ctx.fillStyle = '#3c5a32'; ctx.beginPath(); ctx.ellipse(cx, cy, G, G * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(...P(-1, 0, 0)); ctx.lineTo(...P(1, 0, 0)); ctx.moveTo(...P(0, -1, 0)); ctx.lineTo(...P(0, 1, 0)); ctx.stroke();
      // 碗的輪廓
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.setLineDash([3, 5]); ctx.beginPath();
      for (let i = 0; i <= 40; i++) { const th = (i / 40) * Math.PI, q = P(Math.cos(th), 0, Math.sin(th)); i ? ctx.lineTo(...q) : ctx.moveTo(...q); }
      ctx.stroke(); ctx.setLineDash([]);
      for (const [t, x, y] of [['北', 0, 1.15], ['南', 0, -1.18], ['東', 1.1, 0], ['西', -1.1, 0]]) text(ctx, t, ...P(x, y, 0), { size: 16, bold: true });
      // 太陽走的路
      ctx.strokeStyle = 'rgba(255,230,140,.7)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath();
      let started = false;
      for (const q of path) { if (q.alt < -0.5) { started = false; continue; } const v = dome(q.alt, q.az); started ? ctx.lineTo(...v) : ctx.moveTo(...v); started = true; }
      ctx.stroke(); ctx.setLineDash([]);
      for (const hh of [6, 9, 12, 15, 18]) { const q = at(hh); if (q.alt > -1) text(ctx, `${hh}點`, ...dome(Math.max(q.alt, 0) + 6, q.az), { size: 11, color: '#ffe6a0' }); }
      // 影端軌跡：影子末端留下的點
      ctx.fillStyle = COL.orange;
      for (const q of path) {
        if (q.h > s.h || q.alt < 6) continue;
        const [x, y, L] = tipOf(q);
        if (L > 1.1) continue;
        ctx.beginPath(); ctx.arc(...P(x, y, 0), 2, 0, Math.PI * 2); ctx.fill();
      }
      // 竿子與影子
      const base = P(0, 0, 0);
      if (now.alt > 1) {
        const [x, y, L] = tipOf(now), k = Math.min(1, 1.15 / L);
        ctx.strokeStyle = 'rgba(10,15,10,.8)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(...base); ctx.lineTo(...P(x * k, y * k, 0)); ctx.stroke();
      }
      ctx.strokeStyle = '#f0e2c0'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(...base); ctx.lineTo(...P(0, 0, HS)); ctx.stroke();
      if (now.alt > -1) sun(ctx, ...dome(now.alt, now.az), 10);
      text(ctx, '從南邊高處斜斜看下來', 10, 14, { align: 'left', size: 12, color: '#dfe6f5' });
      if (now.alt <= 1) return `<b>${hhmm(s.h)}</b>：太陽在地平線附近，影子拉得非常長，或還沒有影子。`;
      return `<b>${hhmm(s.h)}</b>：太陽在<b>${dir8(now.az)}方</b>的天空，影子指向<b>${dir8(now.az + 180)}方</b>。橘色點＝影子末端走過的路。`;
    },
  });
}

// ───────────────────────── 第 7 課：高度角和方位角 ─────────────────────────
function altAzm(host) {
  const t0 = Date.UTC(2026, 2, 20) - TPE.tz * 3600000;
  const PRE = {};
  for (const h of [9, 12, 16]) { const q = altAz(t0 + h * 3600000, TPE.lat, TPE.lon); PRE[h] = { alt: Math.round(q.alt), az: Math.round(q.az) }; }
  const L = (W, H) => ({ ox: W * 0.07, gy: H * 0.84, r: Math.min(W * 0.36, H * 0.68), ccx: W * 0.75, ccy: H * 0.54, rc: Math.min(W * 0.16, H * 0.33) });
  return makeSim(host, {
    aspect: 0.72, maxH: 430,
    state: { alt: 0, az: 0, p: 9, lp: null },
    controls: [
      { type: 'seg', key: 'p', options: [[9, '台北早上 9 點'], [12, '中午 12 點'], [16, '下午 4 點']] },
      { type: 'range', key: 'alt', label: '高度角', min: 0, max: 90, step: 1, fmt: (v) => v + '°' },
      { type: 'range', key: 'az', label: '方位角', min: 0, max: 359, step: 1, fmt: (v) => v + '°' },
    ],
    tick(s) {
      if (s.p !== s.lp && PRE[s.p]) { Object.assign(s, PRE[s.p]); s.lp = s.p; return true; }
      if (PRE[s.lp] && (s.alt !== PRE[s.lp].alt || s.az !== PRE[s.lp].az)) { s.p = s.lp = -1; return true; }
      return false;
    },
    drag: (x, y, s, W, H) => {
      const g = L(W, H);
      if (x < W / 2) s.alt = Math.round(Math.max(0, Math.min(90, Math.atan2(g.gy - y, x - g.ox) / D2R)));
      else s.az = Math.round(((Math.atan2(x - g.ccx, -(y - g.ccy)) / D2R) + 360) % 360) % 360;
    },
    draw(ctx, W, H, s) {
      ctx.fillStyle = '#0d1426'; ctx.fillRect(0, 0, W, H);
      const { ox, gy, r, ccx, ccy, rc } = L(W, H);
      // 左：高度角（從側面看）
      ctx.fillStyle = '#3c5a32'; ctx.fillRect(0, gy, W / 2, H - gy);
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(ox, gy, r * 0.62, -Math.PI / 2, 0); ctx.stroke();
      for (let a = 0; a <= 90; a += 10) {
        const c = Math.cos(a * D2R), sn = Math.sin(a * D2R);
        ctx.beginPath(); ctx.moveTo(ox + c * r * 0.58, gy - sn * r * 0.58); ctx.lineTo(ox + c * r * 0.62, gy - sn * r * 0.62); ctx.stroke();
        if (a % 30 === 0) text(ctx, a + '°', ox + c * r * 0.5, gy - sn * r * 0.5, { size: 10, color: COL.dim });
      }
      const a = s.alt * D2R, sx = ox + Math.cos(a) * r, sy = gy - Math.sin(a) * r;
      ctx.fillStyle = 'rgba(255,210,63,.18)'; ctx.beginPath(); ctx.moveTo(ox, gy); ctx.arc(ox, gy, r * 0.62, -a, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,230,140,.8)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(ox, gy); ctx.lineTo(sx, sy); ctx.stroke(); ctx.setLineDash([]);
      sun(ctx, sx, sy, 9);
      ctx.fillStyle = '#ffe2c4'; ctx.beginPath(); ctx.arc(ox, gy - 4, 5, 0, Math.PI * 2); ctx.fill();
      text(ctx, '高度角：有多高', 10, 14, { align: 'left', size: 13, bold: true, color: COL.sun });
      text(ctx, '地平線 0°', W / 2 - 8, gy + 12, { align: 'right', size: 11, color: COL.dim });
      ctx.strokeStyle = COL.line; ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
      // 右：方位角（從正上方看）
      ctx.fillStyle = '#20331d'; ctx.beginPath(); ctx.arc(ccx, ccy, rc, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.stroke();
      const z = s.az * D2R;
      ctx.fillStyle = 'rgba(255,210,63,.22)'; ctx.beginPath(); ctx.moveTo(ccx, ccy); ctx.arc(ccx, ccy, rc * 0.55, -Math.PI / 2, -Math.PI / 2 + z); ctx.closePath(); ctx.fill();
      for (const [t, az] of [['北', 0], ['東', 90], ['南', 180], ['西', 270]]) {
        const [dx, dy] = scr(az), x = ccx + dx * (rc + 13), y = ccy + dy * (rc + 13);
        const o = { size: 11, color: az ? COL.text : COL.red, bold: true };
        if (dy) text(ctx, `${t} ${az}°`, x, y, o); else { text(ctx, t, x, y - 7, o); text(ctx, az + '°', x, y + 7, { ...o, bold: false, size: 10 }); }
      }
      const [dx, dy] = scr(s.az);
      arrow(ctx, ccx, ccy, ccx + dx * rc * 0.86, ccy + dy * rc * 0.86, 'rgba(255,230,140,.9)', 2, 8);
      sun(ctx, ccx + dx * rc, ccy + dy * rc, 7);
      ctx.fillStyle = '#ffe2c4'; ctx.beginPath(); ctx.arc(ccx, ccy, 4, 0, Math.PI * 2); ctx.fill();
      text(ctx, '方位角：在哪個方向', W / 2 + 10, 14, { align: 'left', size: 13, bold: true, color: COL.sun });
      const fist = Math.round(s.alt / 5) / 2;
      return `高度角 <b>${s.alt}°</b>（伸直手臂，大約 ${fist} 個拳頭高）；方位角 <b>${s.az}°</b>，也就是<b>${dirName(s.az)}方</b>。`;
    },
  });
}

// ───────────────────────── 第 8 課：繞太陽一圈＝一年 ─────────────────────────
function orbitYear(host) {
  return makeSim(host, {
    aspect: 0.72, maxH: 520,
    state: { d: 0 },
    controls: [{ type: 'play' }, { type: 'range', key: 'd', label: '日期', min: 0, max: 365, step: 1, fmt: dateFmt }],
    play: { key: 'd', speed: 30, min: 0, max: 365 },
    draw(ctx, W, H, s) {
      bg(ctx, W, H);
      const cx = W / 2, cy = H / 2 + 4, Ro = Math.min(W * 0.38, H * 0.38), m = Math.min(W, H);
      const pos = (d) => { const L = (yearAt(d).lam + 180) * D2R; return [cx + Ro * Math.cos(L), cy - Ro * Math.sin(L)]; };
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.arc(cx, cy, Ro, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      for (let mo = 0; mo < 12; mo++) {
        const d = (Date.UTC(2026, mo, 1) - Y0) / DAY, [x, y] = pos(d);
        ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
        text(ctx, `${mo + 1}月`, cx + (x - cx) * 1.14, cy + (y - cy) * 1.14, { size: 11, color: COL.dim });
      }
      // 走過的路
      ctx.strokeStyle = COL.green; ctx.lineWidth = 3; ctx.beginPath();
      for (let d = 0; d <= s.d; d += 1) { const [x, y] = pos(d); d ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
      sun(ctx, cx, cy, m * 0.07);
      text(ctx, '太陽', cx, cy + m * 0.07 + 13, { size: 12, color: COL.sun });
      const [ex, ey] = pos(s.d), re = Math.max(9, m * 0.045);
      litBall(ctx, ex, ey, re, Math.atan2(cy - ey, cx - ex));
      text(ctx, '地球', ex, ey - re - 10, { size: 12, bold: true });
      // 前進方向
      const [nx, ny] = pos(s.d + 12);
      const ux = nx - ex, uy = ny - ey, ul = Math.hypot(ux, uy) || 1;
      arrow(ctx, ex + (ux / ul) * (re + 4), ey + (uy / ul) * (re + 4), ex + (ux / ul) * (re + 22), ey + (uy / ul) * (re + 22), COL.green, 2, 7);
      text(ctx, '從北極上方往下看', 10, 14, { align: 'left', size: 12, color: COL.dim });
      const deg = Math.round((s.d / 365.25) * 360);
      return `<b>${dateFmt(s.d)}</b>：地球已經繞了 <b>${Math.round((s.d / 365.25) * 100)}%</b>（約 ${deg}°）。這段時間它也自轉了大約 <b>${Math.round(s.d)} 圈</b>。`;
    },
  });
}

// ───────────────────────── 第 9 課：歪歪的地球 ─────────────────────────
const TILT = 23.44;
function tiltEarth(ctx, x, y, r, towards, label) {
  litBall(ctx, x, y, r, towards);
  const t = TILT * D2R, ax = [-Math.sin(t), -Math.cos(t)];
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.28, -t, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - ax[0] * r * 1.45, y - ax[1] * r * 1.45); ctx.lineTo(x + ax[0] * r * 1.6, y + ax[1] * r * 1.6); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.setLineDash([2, 4]);
  ctx.beginPath(); ctx.moveTo(x + ax[0] * r * 1.6, y + ax[1] * r * 1.6); ctx.lineTo(x + ax[0] * r * 3.4, y + ax[1] * r * 3.4); ctx.stroke(); ctx.setLineDash([]);
  text(ctx, '北', x + ax[0] * r * 1.95, y + ax[1] * r * 1.95, { size: 11, bold: true });
  if (label) text(ctx, label, x, y + r + 14, { size: 11, color: COL.dim });
}
function tiltAxis(host) {
  return makeSim(host, {
    aspect: 0.68, maxH: 500,
    state: { d: 171, four: 1 },
    controls: [
      { type: 'play' }, { type: 'range', key: 'd', label: '日期', min: 0, max: 365, step: 1, fmt: dateFmt },
      { type: 'seg', key: 'four', options: [[1, '顯示四季的位置'], [0, '只看一顆']] },
    ],
    play: { key: 'd', speed: 30, min: 0, max: 365 },
    draw(ctx, W, H, s) {
      bg(ctx, W, H);
      const cx = W / 2, cy = H * 0.56, A = Math.min(W * 0.38, H * 0.62), B = A * 0.36, m = Math.min(W, H);
      // 地球位置角 θ = 黃經 + 270°（讓地軸的歪斜朝畫面左右，看得最清楚）
      const place = (lam) => { const th = (lam + 270) * D2R; return [cx + A * Math.cos(th), cy - B * Math.sin(th)]; };
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.ellipse(cx, cy, A, B, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      const items = [];
      if (s.four) for (const [lam, lb] of [[0, '3月 春分'], [90, '6月 夏至'], [180, '9月 秋分'], [270, '12月 冬至']]) items.push({ lam, lb, ghost: true });
      const now = yearAt(s.d);
      items.push({ lam: now.lam, main: true });
      items.push({ sun: true, y: cy });
      for (const it of items) if (!it.sun) { [it.x, it.y] = place(it.lam); }
      items.sort((p, q) => p.y - q.y);
      const re = Math.max(9, m * 0.055);
      for (const it of items) {
        if (it.sun) { sun(ctx, cx, cy, m * 0.06); continue; }
        ctx.globalAlpha = it.main ? 1 : 0.45;
        tiltEarth(ctx, it.x, it.y, it.main ? re : re * 0.8, Math.atan2(cy - it.y, cx - it.x), it.ghost ? it.lb : '');
        ctx.globalAlpha = 1;
      }
      text(ctx, '↖ 每一顆的自轉軸都指向同一個方向（北極星）', 10, 14, { align: 'left', size: 12, color: '#dfe6f5' });
      const dcl = now.decl;
      const msg = dcl > 12 ? '北半球<b>斜向</b>太陽 → 北半球是<b>夏天</b>' : dcl < -12 ? '北半球<b>斜離</b>太陽 → 北半球是<b>冬天</b>（南半球剛好是夏天）' : '地軸斜向側邊，南北半球被照得差不多 → <b>春天或秋天</b>';
      return `<b>${dateFmt(s.d)}</b>：${msg}。地軸本身從頭到尾都沒有轉向。`;
    },
  });
}

// ───────────────────────── 第 10 課：手電筒直照、斜照 ─────────────────────────
function flashlight(host) {
  return makeSim(host, {
    aspect: 0.62, maxH: 420,
    state: { a: 88 },
    controls: [
      { type: 'seg', key: 'a', options: [[88, '台北夏至中午 88°'], [42, '台北冬至中午 42°']] },
      { type: 'range', key: 'a', label: '照射角度', min: 15, max: 90, step: 1, fmt: (v) => v + '°' },
    ],
    draw(ctx, W, H, s) {
      ctx.fillStyle = '#0a0f1e'; ctx.fillRect(0, 0, W, H);
      const gy = H * 0.76, x0 = W * 0.56, w = Math.min(W * 0.15, H * 0.22), D = Math.min(H * 0.42, W * 0.42);
      const a = s.a * D2R, sa = Math.sin(a), d = [Math.cos(a), sa], p = [-sa, Math.cos(a)];
      const S = [x0 - d[0] * D, gy - d[1] * D], hw = w / 2 / sa;
      // 地面和格子（每格＝光直直照下來時的光點大小）
      ctx.fillStyle = '#2f4a2a'; ctx.fillRect(0, gy, W, H - gy);
      ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1;
      for (let k = -8; k <= 8; k++) { const x = x0 - w / 2 + k * w; ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy + 14); ctx.stroke(); }
      // 光束
      ctx.fillStyle = 'rgba(255,220,90,.13)'; ctx.beginPath();
      ctx.moveTo(S[0] + p[0] * w / 2, S[1] + p[1] * w / 2); ctx.lineTo(x0 - hw, gy); ctx.lineTo(x0 + hw, gy);
      ctx.lineTo(S[0] - p[0] * w / 2, S[1] - p[1] * w / 2); ctx.closePath(); ctx.fill();
      // 地上的光點：越斜越大、越暗
      ctx.fillStyle = `rgba(255,220,80,${0.2 + 0.75 * sa})`; ctx.fillRect(x0 - hw, gy, hw * 2, 9);
      // 5 道光
      for (let k = -2; k <= 2; k++) {
        const o = (k / 2.5) * (w / 2), ox = S[0] + p[0] * o, oy = S[1] + p[1] * o, t = (gy - oy) / d[1];
        const hx = ox + d[0] * t;
        arrow(ctx, ox, oy, hx, gy - 1, 'rgba(255,230,120,.85)', 1.5, 6);
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx, gy + 4, 2.5, 0, Math.PI * 2); ctx.fill();
      }
      // 手電筒
      ctx.save(); ctx.translate(S[0], S[1]); ctx.rotate(a);
      ctx.fillStyle = '#9aa6c6'; ctx.fillRect(-46, -w / 2 - 3, 46, w + 6); ctx.fillStyle = COL.sun; ctx.fillRect(-4, -w / 2 - 3, 4, w + 6);
      ctx.restore();
      text(ctx, '手電筒＝陽光', 10, 14, { size: 12, align: 'left', color: COL.sun });
      text(ctx, '一格＝直直照時光點的大小', W - 8, H - 10, { size: 11, align: 'right', color: COL.dim });
      const cells = 1 / sa;
      return `照射角度 <b>${s.a}°</b>：同樣 5 道光，攤在 <b>${cells.toFixed(2)} 格</b>地上，每一格只分到 <b>${Math.round(sa * 100)}%</b> 的光。`;
    },
  });
}

// ───────────────────────── 第 11 課：一圈緯線有多少在亮處 ─────────────────────────
const SEASONS3 = [[1, '夏至'], [0, '春分・秋分'], [3, '冬至']];
const SEASON_DECL = { 1: TILT, 0: 0, 3: -TILT };
function dayRing(host) {
  const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return makeSim(host, {
    aspect: 0.68, maxH: 470,
    state: { k: 1, lat: 25 },
    controls: [
      { type: 'seg', key: 'k', options: SEASONS3 },
      { type: 'range', key: 'lat', label: '緯度', min: -85, max: 85, step: 1, fmt: (v) => latFmt(v) },
    ],
    draw(ctx, W, H, s) {
      bg(ctx, W, H);
      const R = Math.min(W * 0.26, H * 0.33), cx = W * 0.58, cy = H * 0.43;
      sun(ctx, W * 0.07, cy, Math.min(W, H) * 0.05);
      parallelRays(ctx, cx, cy, R, 0, cx - R - W * 0.13, 6);
      litBall(ctx, cx, cy, R, Math.PI);
      // 地軸：夏至往太陽歪、冬至背著太陽歪、春秋分往側邊歪
      const e = TILT * D2R, psi = { 1: 0, 0: Math.PI / 2, 3: Math.PI }[s.k];
      const ax = [-Math.sin(e) * Math.cos(psi), Math.cos(e), Math.sin(e) * Math.sin(psi)];
      const e1 = norm([1 - ax[0] * ax[0], -ax[0] * ax[1], -ax[0] * ax[2]]), e2 = cross(ax, e1);
      const V = 14 * D2R;
      const proj = (P) => [cx + P[0] * R, cy - (P[1] * Math.cos(V) - P[2] * Math.sin(V)) * R];
      const depth = (P) => P[1] * Math.sin(V) + P[2] * Math.cos(V);
      const ringPt = (lat, f) => { const sl = Math.sin(lat * D2R), cl = Math.cos(lat * D2R); return [0, 1, 2].map((i) => ax[i] * sl + (e1[i] * Math.cos(f) + e2[i] * Math.sin(f)) * cl); };
      const ring = (lat, hi) => {
        let lit = 0;
        for (let i = 0; i < 360; i += 2) {
          const A = ringPt(lat, i * D2R), Bp = ringPt(lat, (i + 2) * D2R), mid = A.map((v, j) => (v + Bp[j]) / 2);
          const day = mid[0] < 0, front = depth(mid) > 0;
          if (day) lit += 2;
          ctx.globalAlpha = front ? 1 : 0.35;
          ctx.strokeStyle = hi ? (day ? COL.sun : COL.blue) : 'rgba(255,255,255,.4)';
          ctx.lineWidth = hi ? (front ? 3.5 : 2) : 1;
          ctx.beginPath(); ctx.moveTo(...proj(A)); ctx.lineTo(...proj(Bp)); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        return lit / 360;
      };
      ring(0, false);
      const frac = ring(s.lat, true);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(...proj(ax.map((v) => -v * 1.2))); ctx.lineTo(...proj(ax.map((v) => v * 1.2))); ctx.stroke();
      text(ctx, '北極', ...proj(ax.map((v) => v * 1.34)), { size: 12, bold: true });
      // 下方的白天長度條
      const bx = W * 0.08, bw = W * 0.84, by = H - 26;
      ctx.fillStyle = '#1a2440'; ctx.fillRect(bx, by, bw, 14);
      ctx.fillStyle = COL.sun; ctx.fillRect(bx, by, bw * frac, 14);
      const hrs = frac * 24, hh = Math.floor(hrs), mm = Math.round((hrs - hh) * 60);
      text(ctx, `白天 ${hh} 小時${mm ? ` ${mm} 分` : ''}`, bx + 4, by - 9, { size: 12, align: 'left', color: COL.sun });
      text(ctx, '黑夜', bx + bw - 4, by - 9, { size: 12, align: 'right', color: COL.blue });
      const name = SEASONS3.find((x) => x[0] === s.k)[1];
      if (frac > 0.995) return `${name}・${latFmt(s.lat)}：整圈都在亮處 → <b>永晝</b>，太陽一整天不下山。`;
      if (frac < 0.005) return `${name}・${latFmt(s.lat)}：整圈都在暗處 → <b>永夜</b>，太陽一整天都不出來。`;
      return `${name}・${latFmt(s.lat)}：這一圈有 <b>${Math.round(frac * 100)}%</b> 在亮處 → 白天約 <b>${hh} 小時 ${mm} 分</b>。黃色＝白天、藍色＝黑夜。`;
    },
  });
}

// ───────────────────────── 第 12、14 課：地球剖面（陽光從左邊來） ─────────────────────────
// 只畫「正對太陽的那條經線」切開的剖面：地軸往太陽歪 d 度（d＝直射點緯度）
function crossEarth(ctx, cx, cy, R, d) {
  litBall(ctx, cx, cy, R, Math.PI);
  const dr = d * D2R, ax = [-Math.sin(dr), -Math.cos(dr)];
  const pt = (phi) => { const a = (phi - d) * D2R; return [cx - R * Math.cos(a), cy - R * Math.sin(a)]; };
  const mirror = ([x, y]) => { const vx = x - cx, vy = y - cy, k = vx * ax[0] + vy * ax[1]; return [cx + 2 * k * ax[0] - vx, cy + 2 * k * ax[1] - vy]; };
  const line = (phi, color, dash, label) => {
    const p = pt(phi), q = mirror(p);
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(...p); ctx.lineTo(...q); ctx.stroke(); ctx.setLineDash([]);
    text(ctx, label, q[0] + 6, q[1], { size: 11, align: 'left', color });
  };
  line(23.44, COL.orange, [5, 4], '北回歸線');
  line(0, '#fff', [], '赤道');
  line(-23.44, COL.orange, [5, 4], '南回歸線');
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath();
  ctx.moveTo(cx - ax[0] * R * 1.2, cy - ax[1] * R * 1.2); ctx.lineTo(cx + ax[0] * R * 1.2, cy + ax[1] * R * 1.2); ctx.stroke();
  text(ctx, '北極', cx + ax[0] * R * 1.33, cy + ax[1] * R * 1.33, { size: 11, bold: true });
  return pt;
}

// ───────────────────────── 第 12 課：直射點在兩條回歸線之間散步 ─────────────────────────
function subsolar(host) {
  return makeSim(host, {
    aspect: 0.85, maxH: 560,
    state: { d: 171 },
    controls: [{ type: 'play' }, { type: 'range', key: 'd', label: '日期', min: 0, max: 365, step: 1, fmt: dateFmt }],
    play: { key: 'd', speed: 30, min: 0, max: 365 },
    draw(ctx, W, H, s) {
      bg(ctx, W, H);
      const top = H * 0.62, R = Math.min(W * 0.22, top * 0.34), cx = W * 0.5, cy = top * 0.5 + 6;
      const dcl = yearAt(s.d).decl;
      sun(ctx, W * 0.06, cy, Math.min(W, H) * 0.045);
      parallelRays(ctx, cx, cy, R, 0, cx - R - W * 0.12, 7);
      const pt = crossEarth(ctx, cx, cy, R, dcl);
      const ss = pt(dcl);
      arrow(ctx, ss[0] - 46, ss[1], ss[0] - 2, ss[1], COL.red, 2.5, 8);
      ctx.fillStyle = COL.red; ctx.beginPath(); ctx.arc(ss[0], ss[1], 4.5, 0, Math.PI * 2); ctx.fill();
      text(ctx, '直射點', ss[0] - 26, ss[1] - 13, { size: 12, bold: true, color: '#ffb0b0' });
      // 下方：直射點一年怎麼移動
      ctx.strokeStyle = COL.line; ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(W, top); ctx.stroke();
      const gx0 = 52, gx1 = W - 14, gy0 = top + 16, gy1 = H - 22;
      const GX = (d) => gx0 + (d / 365) * (gx1 - gx0), GY = (v) => (gy0 + gy1) / 2 - (v / 26) * ((gy1 - gy0) / 2);
      for (const [v, t, c] of [[23.44, '北回歸線', COL.orange], [0, '赤道', '#fff'], [-23.44, '南回歸線', COL.orange]]) {
        ctx.strokeStyle = c; ctx.globalAlpha = 0.5; ctx.setLineDash(v ? [4, 4] : []); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(gx0, GY(v)); ctx.lineTo(gx1, GY(v)); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        text(ctx, t, gx0 - 4, GY(v), { size: 10, align: 'right', color: c });
      }
      ctx.strokeStyle = COL.sun; ctx.lineWidth = 2; ctx.beginPath();
      for (let d = 0; d <= 365; d += 2) { const v = yearAt(d).decl; d ? ctx.lineTo(GX(d), GY(v)) : ctx.moveTo(GX(d), GY(v)); }
      ctx.stroke();
      for (let mo = 0; mo < 12; mo += W < 500 ? 3 : 1) text(ctx, `${mo + 1}月`, GX((Date.UTC(2026, mo, 15) - Y0) / DAY), H - 10, { size: 10, color: COL.dim });
      ctx.fillStyle = COL.red; ctx.beginPath(); ctx.arc(GX(s.d), GY(dcl), 5, 0, Math.PI * 2); ctx.fill();
      let note = '';
      if (dcl > 23.2) note = '：走到最北的北回歸線，準備往回走（夏至）';
      else if (dcl < -23.2) note = '：走到最南的南回歸線，準備往回走（冬至）';
      else if (Math.abs(dcl) < 0.5) note = `：正好在赤道上（${s.d < 180 ? '春分' : '秋分'}）`;
      return `<b>${dateFmt(s.d)}</b>：直射點在 <b>${latFmt(dcl, 1)}</b>${note}。`;
    },
  });
}

// ───────────────────────── 第 13 課：四季的太陽路徑 ─────────────────────────
function seasonPaths(host) {
  const SP = { 1: [5, 21, '夏至', '#ff8a7a'], 0: [2, 20, '春分・秋分', '#8fe6a6'], 3: [11, 22, '冬至', '#7ec3ff'] };
  const data = {};
  for (const k of [1, 0, 3]) {
    const [mo, da] = SP[k], t0 = Date.UTC(2026, mo, da) - TPE.tz * 3600000, path = [];
    for (let mi = 240; mi <= 1200; mi += 5) path.push(altAz(t0 + mi * 60000, TPE.lat, TPE.lon));
    data[k] = { t0, path, info: dayInfo(t0, TPE.lat, TPE.lon) };
  }
  const clock = (t) => { const x = new Date(t + TPE.tz * 3600000); return `${pad2(x.getUTCHours())}:${pad2(x.getUTCMinutes())}`; };
  return makeSim(host, {
    aspect: 0.72, maxH: 500,
    state: { k: 1, h: 8 },
    controls: [{ type: 'seg', key: 'k', options: SEASONS3 }, { type: 'play' }, { type: 'range', key: 'h', label: '時間', min: 4.5, max: 19.5, step: 0.05, fmt: hhmm }],
    play: { key: 'h', speed: 1.2, min: 4.5, max: 19.5 },
    draw(ctx, W, H, s) {
      const D = data[s.k], now = altAz(D.t0 + s.h * 3600000, TPE.lat, TPE.lon);
      const gy = H - 58, top = 22, pad = 22;
      skyGround(ctx, W, H, gy, now.alt);
      const X = (az) => pad + ((az - 40) / 280) * (W - pad * 2), Y = (alt) => gy - (alt / 90) * (gy - top);
      for (const k of [1, 0, 3]) {
        const sel = k === s.k;
        ctx.strokeStyle = SP[k][3]; ctx.globalAlpha = sel ? 1 : 0.4; ctx.lineWidth = sel ? 2.5 : 1.5;
        ctx.beginPath(); let on = false;
        for (const p of data[k].path) { if (p.alt < 0) { on = false; continue; } on ? ctx.lineTo(X(p.az), Y(p.alt)) : ctx.moveTo(X(p.az), Y(p.alt)); on = true; }
        ctx.stroke();
        const r = data[k].info;
        ctx.fillStyle = SP[k][3]; ctx.beginPath(); ctx.arc(X(r.riseAz), gy, sel ? 5 : 3.5, 0, Math.PI * 2); ctx.arc(X(r.setAz), gy, sel ? 5 : 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // 正午高度
      const r = D.info, noon = altAz(r.noonT, TPE.lat, TPE.lon);
      ctx.strokeStyle = SP[s.k][3]; ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X(noon.az), gy); ctx.lineTo(X(noon.az), Y(noon.alt)); ctx.stroke(); ctx.setLineDash([]);
      text(ctx, `正午 ${r.noonAlt.toFixed(0)}°`, X(noon.az) + 6, Y(noon.alt / 2), { size: 11, align: 'left', color: SP[s.k][3] });
      for (const [t, a] of [['東北', 45], ['東', 90], ['東南', 135], ['南', 180], ['西南', 225], ['西', 270], ['西北', 315]])
        text(ctx, t, X(a), gy + 12, { size: t.length > 1 ? 11 : 14, bold: t.length === 1, color: t.length > 1 ? COL.dim : COL.text });
      backView(ctx, X(180), gy + 28);
      if (now.alt > -1) sun(ctx, X(now.az), Y(Math.max(now.alt, 0)), 10);
      text(ctx, '站在台北面向南方', 10, 12, { align: 'left', size: 12, color: '#dfe6f5' });
      const len = r.dayLen, name = SP[s.k][2];
      return `<b>${name}</b>：日出 ${clock(r.rise)}（${dirName(r.riseAz)}方），日落 ${clock(r.set)}（${dirName(r.setAz)}方），正午最高 <b>${r.noonAlt.toFixed(0)}°</b>，白天 <b>${Math.floor(len / 60)} 小時 ${len % 60} 分</b>。`;
    },
  });
}

// ───────────────────────── 第 14 課：正午太陽高度＝90° − 你和直射點差幾度 ─────────────────────────
function noonAngle(host) {
  return makeSim(host, {
    aspect: 0.8, maxH: 540,
    state: { lat: 25, k: 1 },
    controls: [
      { type: 'seg', key: 'k', options: SEASONS3 },
      { type: 'seg', key: 'lat', options: [[0, '赤道'], [25, '台北'], [70, '北極圈內'], [-34, '雪梨']] },
      { type: 'range', key: 'lat', label: '緯度', min: -90, max: 90, step: 1, fmt: (v) => latFmt(v) },
    ],
    draw(ctx, W, H, s) {
      bg(ctx, W, H);
      const R = Math.min(W * 0.26, H * 0.32), cx = W * 0.56, cy = H * 0.5;
      const d = SEASON_DECL[s.k];
      sun(ctx, W * 0.06, cy, Math.min(W, H) * 0.045);
      parallelRays(ctx, cx, cy, R, 0, cx - R - W * 0.12, 7);
      const pt = crossEarth(ctx, cx, cy, R, d);
      const ss = pt(d), P = pt(s.lat), al = (s.lat - d) * D2R, diff = Math.abs(s.lat - d), alt = 90 - diff;
      // 你和直射點在地心相差幾度
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(...ss); ctx.lineTo(cx, cy); ctx.lineTo(...P); ctx.stroke(); ctx.setLineDash([]);
      if (diff > 2) {
        ctx.strokeStyle = COL.green; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R * 0.26, Math.min(Math.PI, Math.PI + al), Math.max(Math.PI, Math.PI + al)); ctx.stroke();
        text(ctx, `差 ${diff.toFixed(0)}°`, cx + Math.cos(Math.PI + al / 2) * R * 0.45, cy + Math.sin(Math.PI + al / 2) * R * 0.45, { size: 12, bold: true, color: COL.green });
      }
      ctx.fillStyle = COL.red; ctx.beginPath(); ctx.arc(...ss, 4, 0, Math.PI * 2); ctx.fill();
      // 你：站在地表，腳下的地平線
      const n = [-Math.cos(al), -Math.sin(al)];
      let t = [-Math.sin(al), Math.cos(al)];
      if (t[0] > 0) t = [-t[0], -t[1]];
      ctx.strokeStyle = '#9fe3a8'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(P[0] - t[0] * R * 0.42, P[1] - t[1] * R * 0.42); ctx.lineTo(P[0] + t[0] * R * 0.42, P[1] + t[1] * R * 0.42); ctx.stroke();
      ctx.strokeStyle = '#ffe2c4'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(...P); ctx.lineTo(P[0] + n[0] * 18, P[1] + n[1] * 18); ctx.stroke();
      ctx.fillStyle = '#ffe2c4'; ctx.beginPath(); ctx.arc(P[0] + n[0] * 23, P[1] + n[1] * 23, 5, 0, Math.PI * 2); ctx.fill();
      text(ctx, '你', P[0] + n[0] * 38, P[1] + n[1] * 38, { size: 13, bold: true });
      if (alt > 0) {
        arrow(ctx, Math.max(4, P[0] - W * 0.3), P[1], P[0] - 3, P[1], COL.sun, 2.5, 8);
        if (alt < 88) {
          const at = (Math.atan2(t[1], t[0]) + Math.PI * 2) % (Math.PI * 2);
          ctx.strokeStyle = COL.sun; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(P[0], P[1], 30, Math.min(at, Math.PI), Math.max(at, Math.PI)); ctx.stroke();
          const mid = (at + Math.PI) / 2;
          text(ctx, `${alt.toFixed(0)}°`, P[0] + Math.cos(mid) * 48, P[1] + Math.sin(mid) * 48, { size: 13, bold: true, color: COL.sun });
        }
      }
      const sg = (v) => (v < 0 ? `(${v.toFixed(1)}°)` : `${v.toFixed(1)}°`);
      let st = '';
      if (Math.abs(s.lat + d) - 90 > 0) st = '　這裡連半夜太陽都在地平線上：<b>永晝</b>。';
      else if (alt <= 0) st = '　連中午太陽都升不起來：<b>永夜</b>。';
      else if (alt > 89) st = '　太陽在正頭頂，你就站在直射點上。';
      return `正午太陽高度 = 90° − |${sg(s.lat)} − ${sg(d)}| = <b>${alt > 0 ? alt.toFixed(1) + '°' : '小於 0°'}</b>${st}`;
    },
  });
}

export const SIMS = { lampBall, spinDay, eastRise, dayNightMap, turnAround, shadowLen, skyArc, altAzm, orbitYear, tiltAxis, flashlight, dayRing, subsolar, seasonPaths, noonAngle };
