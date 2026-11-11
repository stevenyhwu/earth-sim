import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { sunAt, altAz, dayInfo, seasonMoments, dirName, D2R, R2D, HORIZON } from './astro.js';

// ───────────────────────── 地點 ─────────────────────────
// tz = 標準時區（不含夏令時間）
const PLACES = [
  { name: '台北', lat: 25.03, lon: 121.56, tz: 8 },
  { name: '高雄', lat: 22.63, lon: 120.30, tz: 8 },
  { name: '嘉義（北回歸線）', lat: 23.44, lon: 120.45, tz: 8 },
  { name: '新加坡（近赤道）', lat: 1.35, lon: 103.82, tz: 8 },
  { name: '東京', lat: 35.68, lon: 139.69, tz: 9 },
  { name: '倫敦', lat: 51.51, lon: -0.13, tz: 0 },
  { name: '特羅姆瑟（北極圈內）', lat: 69.65, lon: 18.96, tz: 1 },
  { name: '北極點', lat: 90, lon: 0, tz: 0 },
  { name: '雪梨（南半球）', lat: -33.87, lon: 151.21, tz: 10 },
  { name: '南極點', lat: -90, lon: 0, tz: 0 },
];
const SEASON_NAMES = ['春分', '夏至', '秋分', '冬至'];
const SEASON_CLS = ['eq', 'sum', 'eq', 'win'];
const SEASON_COL = [0x8fe6a6, 0xff8a7a, 0x8fe6a6, 0x7ec3ff];

const state = { t: Date.now(), place: { ...PLACES[0] }, playing: false, speed: 3600, dayAcc: 0 };

// ───────────────────────── 時間工具 ─────────────────────────
const DAY = 86400000;
function local() {
  const tz = state.place.tz;
  const d = new Date(state.t + tz * 3600000);
  const year = d.getUTCFullYear();
  const doy = Math.floor((Date.UTC(year, d.getUTCMonth(), d.getUTCDate()) - Date.UTC(year, 0, 1)) / DAY);
  const min = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
  const yearDays = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY;
  const dayStart = Date.UTC(year, 0, 1) + doy * DAY - tz * 3600000;
  return { year, doy, min, yearDays, dayStart, month: d.getUTCMonth() + 1, date: d.getUTCDate() };
}
const pad = (n) => String(n).padStart(2, '0');
function fmtTime(t) {
  if (t == null) return '—';
  const d = new Date(t + state.place.tz * 3600000 + 30000);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
function fmtDate(t, tz = state.place.tz) {
  const d = new Date(t + tz * 3600000);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}
const latTxt = (v) => (Math.abs(v) < 0.005 ? '0°（赤道）' : `${v > 0 ? '北緯' : '南緯'} ${Math.abs(v).toFixed(1)}°`);
const lonTxt = (v) => `${v >= 0 ? '東經' : '西經'} ${Math.abs(v).toFixed(1)}°`;
const tzTxt = (z) => `UTC${z >= 0 ? '+' : '−'}${Math.abs(z)}`;

// ───────────────────────── 3D 工具 ─────────────────────────
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// 地理座標 → 地球模型本身的座標（北極 = +Y，經度 0° = +X，東經 90° = −Z）
const geoLocal = (lat, lon, r = 1) => {
  const p = lat * D2R, l = lon * D2R;
  return V(r * Math.cos(p) * Math.cos(l), r * Math.sin(p), -r * Math.cos(p) * Math.sin(l));
};
// 依照「格林威治恆星時」轉動地球；toWorld 把赤道座標轉成場景座標
function orientEarth(obj, gmst, toWorld) {
  const g = gmst * D2R;
  const X = toWorld(Math.cos(g), Math.sin(g), 0);
  const Y = toWorld(0, 0, 1);
  const Z = toWorld(Math.sin(g), -Math.cos(g), 0);
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
}
function line(points, color, opacity = 1, loop = false) {
  const g = new THREE.BufferGeometry().setFromPoints(points);
  const m = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
  return loop ? new THREE.LineLoop(g, m) : new THREE.Line(g, m);
}
function dashed(points, color, opacity = 0.8, dash = 0.3) {
  const g = new THREE.BufferGeometry().setFromPoints(points);
  const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color, dashSize: dash, gapSize: dash * 0.8, transparent: true, opacity }));
  l.computeLineDistances();
  return l;
}
function label(text, cls = '') {
  const d = document.createElement('div');
  d.className = 'lbl ' + cls;
  d.textContent = text;
  return new CSS2DObject(d);
}
function setVis(obj, v) { obj.visible = v; obj.traverse((o) => { if (o.isCSS2DObject) o.visible = v; }); }
function dot(r, color) { return new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color })); }
function clearGroup(g) {
  for (const c of [...g.children]) {
    g.remove(c);
    c.traverse((o) => { if (o.isCSS2DObject) o.element.remove(); o.geometry?.dispose(); });
  }
}

// ───────────────────────── 地球貼圖（Natural Earth 海岸線） ─────────────────────────
const texCanvas = document.createElement('canvas');
texCanvas.width = 2048; texCanvas.height = 1024;
const textures = [];
{
  const c = texCanvas.getContext('2d');
  c.fillStyle = '#1d5a96'; c.fillRect(0, 0, 2048, 1024);
}
function earthTexture() {
  const t = new THREE.CanvasTexture(texCanvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  textures.push(t);
  return t;
}
async function loadLand() {
  try {
    const topo = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json').then((r) => r.json());
    const land = topojson.feature(topo, topo.objects.land);
    const c = texCanvas.getContext('2d');
    const W = 2048, H = 1024;
    const xy = ([lon, lat]) => [(lon + 180) / 360 * W, (90 - lat) / 180 * H];
    const polys = [];
    for (const f of land.features) {
      const g = f.geometry;
      if (g.type === 'Polygon') polys.push(g.coordinates);
      else if (g.type === 'MultiPolygon') polys.push(...g.coordinates);
    }
    for (const poly of polys) {
      const meanLat = poly[0].reduce((s, p) => s + p[1], 0) / poly[0].length;
      c.fillStyle = meanLat < -60 ? '#e9eef3' : '#5c9a52';
      c.beginPath();
      for (const ring of poly) {
        ring.forEach((p, i) => { const [x, y] = xy(p); i ? c.lineTo(x, y) : c.moveTo(x, y); });
        c.closePath();
      }
      c.fill('evenodd');
    }
    textures.forEach((t) => (t.needsUpdate = true));
    views.forEach((v) => (v.dirty = true));
  } catch (e) {
    console.warn('海岸線資料載入失敗，改用純色地球', e);
  }
}

// 建立地球（含經緯線、回歸線、所在地標記）
function makeEarth(r, { grid = false, horizon = false } = {}) {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 96, 64), new THREE.MeshLambertMaterial({ map: earthTexture() }));
  group.add(mesh);
  const latLine = (lat, color, op) => {
    const pts = [];
    for (let i = 0; i <= 180; i++) pts.push(geoLocal(lat, i * 2, r * 1.004));
    return line(pts, color, op);
  };
  const lonLine = (lon, color, op) => {
    const pts = [];
    for (let i = 0; i <= 90; i++) pts.push(geoLocal(-90 + i * 2, lon, r * 1.004));
    return line(pts, color, op);
  };
  const lines = new THREE.Group();
  lines.add(latLine(0, 0xffffff, 0.9));
  lines.add(latLine(23.44, 0xffa53d, 0.95), latLine(-23.44, 0xffa53d, 0.95));
  lines.add(latLine(66.56, 0x6cc8ff, 0.95), latLine(-66.56, 0x6cc8ff, 0.95));
  group.add(lines);
  let gridG = null;
  if (grid) {
    gridG = new THREE.Group();
    for (let lat = -60; lat <= 60; lat += 30) if (lat) gridG.add(latLine(lat, 0xffffff, 0.22));
    for (let lon = 0; lon < 360; lon += 30) gridG.add(lonLine(lon, 0xffffff, lon === 0 ? 0.6 : 0.22));
    group.add(gridG);
  }
  const sub = dot(r * 0.035 + 0.02, 0xffe14d);
  const me = dot(r * 0.035 + 0.02, 0xff4040);
  group.add(sub, me);
  let hz = null;
  if (horizon) {
    hz = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.13, 40),
      new THREE.MeshBasicMaterial({ color: 0xff7070, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    disc.position.z = 0.01;
    const stick = line([V(0, 0, 0), V(0, 0, r * 0.12)], 0xffffff);
    hz.add(disc, stick);
    group.add(hz);
  }
  return { group, mesh, lines, grid: gridG, sub, me, hz, r };
}
function placeMarkers(earth, s) {
  const { lat, lon } = state.place;
  earth.sub.position.copy(geoLocal(s.subLat, s.subLon, earth.r * 1.01));
  earth.me.position.copy(geoLocal(lat, lon, earth.r * 1.01));
  if (earth.hz) {
    const up = geoLocal(lat, lon, 1);
    earth.hz.position.copy(up.clone().multiplyScalar(earth.r * 1.003));
    // 讓圓盤的「北」對準真正的北方
    const north = V(0, 1, 0).sub(up.clone().multiplyScalar(up.y));
    if (north.lengthSq() < 1e-6) north.set(1, 0, 0);
    north.normalize();
    const east = north.clone().cross(up);
    earth.hz.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, north, up));
  }
}
// 一束平行陽光，打在半徑 r、中心 c 的球上；d = 陽光行進方向（單位向量）
function makeRays(n = 7) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) g.add(line([V(0, 0, 0), V(0, 0, 1)], 0xffd84d, 0.7));
  return g;
}
function updateRays(g, c, d, r, len) {
  const up = Math.abs(d.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0);
  const a = up.clone().cross(d).normalize(), b = d.clone().cross(a).normalize();
  const n = g.children.length;
  g.children.forEach((ln, i) => {
    const k = (i / (n - 1)) * 2 - 1;
    const off = b.clone().multiplyScalar(k * r * 0.85);
    const hit = c.clone().add(off).addScaledVector(d, -Math.sqrt(1 - (k * 0.85) ** 2) * r);
    const start = hit.clone().addScaledVector(d, -len);
    const pos = ln.geometry.attributes.position;
    pos.setXYZ(0, start.x, start.y, start.z); pos.setXYZ(1, hit.x, hit.y, hit.z);
    pos.needsUpdate = true;
    ln.geometry.computeBoundingSphere();
  });
}

// ───────────────────────── 視角（每個視角一個畫布） ─────────────────────────
class View {
  constructor(id, camPos, target) {
    this.el = document.getElementById(id);
    this.wrap = this.el.querySelector('.canvas');
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.wrap.prepend(this.renderer.domElement);
    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'labels';
    this.wrap.insertBefore(this.labels.domElement, this.renderer.domElement.nextSibling);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 1000);
    this.camera.position.copy(camPos);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.update();
    this.controls.addEventListener('change', () => (this.dirty = true));
    this.hud = this.wrap.querySelector('.hud');
    this.dirty = true;
    new ResizeObserver(() => this.resize()).observe(this.wrap);
  }
  resize() {
    const w = this.wrap.clientWidth, h = this.wrap.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    // 直式手機畫面：放大垂直視角，讓左右寬度和橫式畫面差不多
    const a = w / h;
    this.camera.fov = a >= 1.3 ? 45 : Math.min(85, 2 * Math.atan(Math.tan(30 * D2R) / a) * R2D);
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }
  setCam(pos, target) {
    this.camera.position.copy(pos);
    this.controls.target.copy(target);
    this.controls.update();
    this.dirty = true;
  }
  // 從鏡頭看過去，點 p 是否被某顆球（地球）擋住
  isOccluded(p) {
    const c = this.camera.position;
    const d = p.clone().sub(c); const L = d.length(); d.divideScalar(L);
    for (const o of this.occluders || []) {
      const oc = o.center.clone().sub(c);
      const tca = oc.dot(d);
      if (tca < 0) continue;
      const d2 = oc.lengthSq() - tca * tca;
      if (d2 > o.r * o.r) continue;
      if (tca - Math.sqrt(o.r * o.r - d2) < L - 1e-3) return true;
    }
    return false;
  }
  render() {
    if (!this.wrap.clientWidth) return;
    const moved = this.controls.update();
    if (this.dirty || moved) {
      this.beforeRender?.();
      this.renderer.render(this.scene, this.camera);
      this.labels.render(this.scene, this.camera);
      // 被地球擋住的文字標籤要藏起來，否則會「穿透」地球浮在前面
      if (this.occluders) {
        const tmp = new THREE.Vector3();
        this.scene.traverse((o) => {
          if (o.isCSS2DObject && o.userData.occlude && o.element.style.display !== 'none'
              && this.isOccluded(o.getWorldPosition(tmp))) o.element.style.display = 'none';
        });
      }
      this.dirty = false;
    }
  }
}
function stars(scene, n = 1500) {
  const p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(300 + Math.random() * 100);
    p.set([v.x, v.y, v.z], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.7 })));
}

// ═════════════════════════ ① 太空視角 ═════════════════════════
const ORBIT = 14;
const SPACE_ALL = [V(0, 23, 23), V(0, -1, 1.5)];
const space = new View('v-space', ...SPACE_ALL);
space.scene.background = new THREE.Color('#04060c');
stars(space.scene);
const eclToThree = (x, y, z) => V(x, z, -y);           // 黃道座標 → 場景（黃道北 = 上）
const earthHelio = (s) => {
  const L = (s.lambda + 180) * D2R;
  return eclToThree(ORBIT * s.R * Math.cos(L), ORBIT * s.R * Math.sin(L), 0);
};
const sp = {};
{
  const S = space.scene;
  const sun = new THREE.Mesh(new THREE.SphereGeometry(1.6, 48, 32), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
  S.add(sun);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(2.1, 32, 24), new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.18 }));
  S.add(glow);
  const sl = label('太陽', 'sun'); sl.position.set(0, 2.6, 0); S.add(sl);
  S.add(new THREE.PointLight(0xffffff, 3.2, 0, 0));
  S.add(new THREE.AmbientLight(0xffffff, 0.14));

  sp.orbit = new THREE.Group(); S.add(sp.orbit);
  sp.months = new THREE.Group(); S.add(sp.months);
  sp.plane = new THREE.Mesh(new THREE.CircleGeometry(ORBIT * 1.12, 96),
    new THREE.MeshBasicMaterial({ color: 0x4a6cff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  sp.plane.rotation.x = -Math.PI / 2;
  S.add(sp.plane); setVis(sp.plane, false);

  sp.earth = makeEarth(1);
  S.add(sp.earth.group);
  sp.axis = new THREE.Group();
  sp.axis.add(line([V(0, -1.9, 0), V(0, 1.9, 0)], 0xffffff));
  const nl = label('北極', 'dim'); nl.position.set(0, 2.15, 0); nl.userData.occlude = true; sp.axis.add(nl);
  sp.earth.group.add(sp.axis);
  sp.perp = dashed([V(0, -1.9, 0), V(0, 1.9, 0)], 0xaaaaaa, 0.8, 0.15);
  S.add(sp.perp);
  sp.rays = makeRays(7); S.add(sp.rays); setVis(sp.rays, false);
  sp.meLbl = label('', 'dim'); S.add(sp.meLbl);
}
space.occluders = [{ center: sp.earth.group.position, r: 1 }, { center: V(0, 0, 0), r: 1.6 }];
let spaceYear = null, spaceFollow = false, lastEarthPos = null;
function buildOrbit(year) {
  clearGroup(sp.orbit); clearGroup(sp.months);
  const t0 = Date.UTC(year, 0, 1);
  const pts = [];
  for (let d = 0; d <= 366; d += 1) pts.push(earthHelio(sunAt(t0 + d * DAY)));
  sp.orbit.add(line(pts, 0x8aa2d8, 0.6));
  seasonMoments(year).forEach((t, i) => {
    const p = earthHelio(sunAt(t));
    const m = dot(0.22, SEASON_COL[i]); m.position.copy(p); sp.orbit.add(m);
    const l = label(`${SEASON_NAMES[i]}\n${fmtDate(t)}`, SEASON_CLS[i] + ' two');
    l.position.copy(p.clone().multiplyScalar(1.13)); sp.orbit.add(l);
  });
  for (let m = 0; m < 12; m++) {
    const p = earthHelio(sunAt(Date.UTC(year, m, 1)));
    const d = dot(0.08, 0xc9d4f0); d.position.copy(p); sp.months.add(d);
    const l = label(`${m + 1}月`, 'dim'); l.position.copy(p.clone().multiplyScalar(0.88)); sp.months.add(l);
  }
  setVis(sp.months, layerOn('space.months'));
  space.dirty = true;
}
function updateSpace(s, lp) {
  if (lp.year !== spaceYear) { spaceYear = lp.year; buildOrbit(lp.year); }
  const e = s.eps * D2R, ce = Math.cos(e), se = Math.sin(e);
  const toW = (x, y, z) => eclToThree(x, y * ce + z * se, -y * se + z * ce);
  const p = earthHelio(s);
  sp.earth.group.position.copy(p);
  orientEarth(sp.earth.group, s.gmst, toW);
  placeMarkers(sp.earth, s);
  sp.perp.position.copy(p);
  if (sp.rays.visible) updateRays(sp.rays, p, p.clone().normalize(), 1, 5);
  if (spaceFollow && lastEarthPos) {
    const d = p.clone().sub(lastEarthPos);
    space.camera.position.add(d); space.controls.target.add(d);
  }
  lastEarthPos = p.clone();
  space.dirty = true;
}

// ═════════════════════════ ② 地球視角 ═════════════════════════
const GR = 5;
const globe = new View('v-globe', V(4, 7, 16), V(0, 0, 0));
globe.scene.background = new THREE.Color('#04060c');
stars(globe.scene);
const eqToGlobe = (x, y, z) => V(x, z, -y);                 // 赤道座標 → 場景（地軸 = 上）
const gl = {};
{
  const S = globe.scene;
  gl.earth = makeEarth(GR, { grid: true, horizon: true });
  S.add(gl.earth.group);
  gl.light = new THREE.DirectionalLight(0xffffff, 2.8); S.add(gl.light);
  S.add(new THREE.AmbientLight(0xffffff, 0.16));
  const ax = line([V(0, -GR * 1.35, 0), V(0, GR * 1.35, 0)], 0xffffff, 0.7); S.add(ax);
  const n = label('北極', 'dim'); n.position.set(0, GR * 1.45, 0); n.userData.occlude = true; S.add(n);
  const c = []; for (let i = 0; i < 128; i++) { const a = i / 128 * Math.PI * 2; c.push(V(Math.cos(a) * GR * 1.008, Math.sin(a) * GR * 1.008, 0)); }
  gl.term = line(c, 0xffffff, 0.95, true); S.add(gl.term);
  gl.rays = makeRays(9); S.add(gl.rays); setVis(gl.rays, false);
  gl.sunLbl = label('☀ 陽光\n從這邊來', 'sun two'); S.add(gl.sunLbl);
  gl.meLbl = label('', ''); gl.meLbl.userData.occlude = true; gl.earth.group.add(gl.meLbl);
  gl.sunDir = V(1, 0, 0);
}
globe.occluders = [{ center: V(0, 0, 0), r: GR * 1.0 }];
// 太陽在地球正後方時，把「陽光」標籤移到地球邊緣，並改成「從背後照過來」
globe.beforeRender = () => {
  const cam = globe.camera.position.clone().normalize();
  const k = gl.sunDir.dot(cam);
  if (k < -0.35) {
    const perp = gl.sunDir.clone().addScaledVector(cam, -k);
    if (perp.lengthSq() < 1e-4) perp.set(0, 1, 0);
    gl.sunLbl.position.copy(perp.normalize().multiplyScalar(GR * 1.3));
    gl.sunLbl.element.textContent = '☀ 陽光從\n地球背後照過來';
  } else {
    gl.sunLbl.position.copy(gl.sunDir.clone().multiplyScalar(GR * 1.45));
    gl.sunLbl.element.textContent = '☀ 陽光\n從這邊來';
  }
};
let globeSpin = true, lastG = null;
function updateGlobe(s) {
  const sd = s.decl * D2R, sr = s.ra * D2R;
  const sunDir = eqToGlobe(Math.cos(sd) * Math.cos(sr), Math.cos(sd) * Math.sin(sr), Math.sin(sd));
  gl.light.position.copy(sunDir.clone().multiplyScalar(50));
  orientEarth(gl.earth.group, s.gmst, eqToGlobe);
  placeMarkers(gl.earth, s);
  gl.meLbl.position.copy(geoLocal(state.place.lat, state.place.lon, GR * 1.12));
  gl.meLbl.element.textContent = state.place.name;
  gl.term.quaternion.setFromUnitVectors(V(0, 0, 1), sunDir);
  gl.sunDir.copy(sunDir);
  if (gl.rays.visible) updateRays(gl.rays, V(0, 0, 0), sunDir.clone().negate(), GR, 6);
  if (globeSpin && lastG != null) {
    let d = s.gmst - lastG; if (d > 180) d -= 360; if (d < -180) d += 360;
    globe.camera.position.applyAxisAngle(V(0, 1, 0), d * D2R);
  }
  lastG = s.gmst;
  globe.dirty = true;
}
// 點一下地球換地點
{
  const el = globe.renderer.domElement;
  let down = null;
  el.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY, t: performance.now() }));
  el.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || performance.now() - down.t > 500) return;
    const r = el.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, globe.camera);
    const hit = ray.intersectObject(gl.earth.mesh)[0];
    if (!hit) return;
    const p = gl.earth.mesh.worldToLocal(hit.point.clone()).normalize();
    const lat = Math.asin(p.y) * R2D, lon = Math.atan2(-p.z, p.x) * R2D;
    setPlace({ name: '自選地點', lat: +lat.toFixed(2), lon: +lon.toFixed(2), tz: Math.round(lon / 15), custom: true });
  });
}

// ═════════════════════════ ③ 地面視角 ═════════════════════════
const DOME = 10, STICK = 2;
const GROUND_CAMS = {
  side: [V(9, 8, 19), V(0, 3, 0)],
  top: [V(0, 27, 0.01), V(0, 0, 0)],
  south: [V(0, 4, 25), V(0, 4, 0)],
  east: [V(25, 4, 0), V(0, 4, 0)],
};
const ground = new View('v-ground', ...GROUND_CAMS.side);
ground.controls.maxPolarAngle = Math.PI * 0.495;
// 方位 → 場景座標：+X = 東、+Y = 上、+Z = 南
const skyPos = (alt, az, r = DOME) => {
  const a = alt * D2R, z = az * D2R;
  return V(r * Math.cos(a) * Math.sin(z), r * Math.sin(a), -r * Math.cos(a) * Math.cos(z));
};
const gd = {};
{
  const S = ground.scene;
  gd.bg = new THREE.Color(); S.background = gd.bg;
  gd.groundMat = new THREE.MeshBasicMaterial({ color: 0xcfe3b5 });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(DOME, 96), gd.groundMat);
  disc.rotation.x = -Math.PI / 2; S.add(disc);
  const ring = (alt, op) => { const p = []; for (let i = 0; i <= 120; i++) p.push(skyPos(alt, i * 3)); return line(p, 0x3d4a66, op); };
  S.add(ring(0, 0.9));
  const domeLines = new THREE.Group();
  domeLines.add(ring(30, 0.25), ring(60, 0.25));
  const arc = (az) => { const p = []; for (let i = 0; i <= 90; i++) p.push(skyPos(i * 2 <= 90 ? i * 2 : 180 - i * 2, i * 2 <= 90 ? az : az + 180)); return line(p, 0x3d4a66, 0.3); };
  domeLines.add(arc(0), arc(90));
  S.add(domeLines);
  S.add(line([V(0, 0.01, -DOME), V(0, 0.01, DOME)], 0x6b7a5a, 0.6));
  S.add(line([V(-DOME, 0.01, 0), V(DOME, 0.01, 0)], 0x6b7a5a, 0.6));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(DOME, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
  S.add(dome);
  for (const [t, az] of [['北', 0], ['東', 90], ['南', 180], ['西', 270]]) {
    const l = label(t, 'big'); l.position.copy(skyPos(0, az, DOME + 1)); S.add(l);
  }
  const zl = label('天頂', 'dim'); zl.position.set(0, DOME + 0.5, 0); S.add(zl);
  for (const a of [30, 60]) { const l = label(`${a}°`, 'dim'); l.position.copy(skyPos(a, 225)); S.add(l); }

  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, STICK, 12), new THREE.MeshBasicMaterial({ color: 0x7a4b25 }));
  stick.position.y = STICK / 2; S.add(stick);
  gd.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.2), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.6, depthWrite: false }));
  gd.shadow.rotation.x = -Math.PI / 2;
  gd.shadowPivot = new THREE.Group(); gd.shadowPivot.position.y = 0.02; gd.shadowPivot.add(gd.shadow); S.add(gd.shadowPivot);

  gd.sun = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
  S.add(gd.sun);
  gd.ray = line([V(0, 0, 0), V(0, 1, 0)], 0xffc400, 0.95); S.add(gd.ray);
  gd.path = new THREE.Group(); S.add(gd.path);
  gd.below = new THREE.Group(); S.add(gd.below);
  gd.hours = new THREE.Group(); S.add(gd.hours);
  gd.seasons = new THREE.Group(); S.add(gd.seasons);
  gd.trail = new THREE.Group(); S.add(gd.trail);
  gd.riseSet = new THREE.Group(); S.add(gd.riseSet);
}
const NIGHT = new THREE.Color('#0a1022'), TWI = new THREE.Color('#e08a5a'), DAYC = new THREE.Color('#8cc8ff');
const GND_DAY = new THREE.Color('#cfe3b5'), GND_NIGHT = new THREE.Color('#2a3326');

// 一天的路徑：分成地平線上（亮）與地平線下（暗）兩組線段
function pathSegments(t0, lat, lon, stepMin = 4) {
  const above = [], below = [];
  let prev = null;
  for (let m = 0; m <= 1440; m += stepMin) {
    const { alt, az } = altAz(t0 + m * 60000, lat, lon);
    const p = skyPos(alt, az);
    if (prev) (alt >= 0 && prev.alt >= 0 ? above : below).push(prev.p, p);
    prev = { p, alt };
  }
  return { above, below };
}
function segs(points, color, opacity = 1) {
  const g = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
}
let dayCache = null, seasonKey = '';
function rebuildDay(lp) {
  const { lat, lon } = state.place;
  const t0 = lp.dayStart;
  dayCache = dayInfo(t0, lat, lon);
  clearGroup(gd.path); clearGroup(gd.below); clearGroup(gd.hours); clearGroup(gd.trail); clearGroup(gd.riseSet);
  const ps = pathSegments(t0, lat, lon);
  if (ps.above.length) {
    const g = segs(ps.above, 0xffd23f);
    gd.path.add(g);
  }
  if (ps.below.length) gd.below.add(segs(ps.below, 0x8b97b5, 0.45));
  for (let h = 0; h < 24; h++) {
    const { alt, az } = altAz(t0 + h * 3600000, lat, lon);
    if (alt < -0.5) continue;
    const d = dot(0.12, 0xffe9a6); d.position.copy(skyPos(alt, az)); gd.hours.add(d);
    const l = label(String(h), 'hr'); l.position.copy(d.position); gd.hours.add(l);
  }
  // 日出、日落方位標記
  const mark = (t, az, txt) => {
    if (t == null) return;
    const p = skyPos(0, az, DOME);
    const m = dot(0.18, 0xff9a3d); m.position.copy(p); gd.riseSet.add(m);
    const l = label(`${txt} ${fmtTime(t)}`, 'dim'); l.position.copy(skyPos(0, az, DOME * 1.18)); gd.riseSet.add(l);
  };
  mark(dayCache.rise, dayCache.riseAz, '日出');
  mark(dayCache.set, dayCache.setAz, '日落');
  // 竿影尖端軌跡
  const tip = [];
  for (let m = 0; m <= 1440; m += 5) {
    const { alt, az } = altAz(t0 + m * 60000, lat, lon);
    if (alt < 4) { if (tip.length > 1) gd.trail.add(line(tip.splice(0), 0xff7a1a)); tip.length = 0; continue; }
    const L = STICK / Math.tan(alt * D2R);
    tip.push(V(-Math.sin(az * D2R) * L, 0.03, Math.cos(az * D2R) * L));
  }
  if (tip.length > 1) gd.trail.add(line(tip, 0xff7a1a));
  for (const n of ['hours', 'trail', 'below']) setVis(gd[n], layerOn('ground.' + n));

  const sk = `${lp.year}|${lat}|${lon}|${state.place.tz}`;
  if (sk !== seasonKey) {
    seasonKey = sk;
    clearGroup(gd.seasons);
    seasonMoments(lp.year).forEach((tm, i) => {
      if (i === 2) return; // 秋分與春分路徑幾乎重疊，只畫一條
      const d = new Date(tm + state.place.tz * 3600000);
      const ds = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - state.place.tz * 3600000;
      const s2 = pathSegments(ds, lat, lon, 6);
      if (s2.above.length) gd.seasons.add(segs(s2.above, SEASON_COL[i], 0.9));
      const di = dayInfo(ds, lat, lon);
      if (di.noonAlt > 0) {
        const { az } = altAz(di.noonT, lat, lon);
        const l = label(i === 0 ? '春分／秋分' : SEASON_NAMES[i], SEASON_CLS[i]);
        l.position.copy(skyPos(di.noonAlt, az, DOME * 1.04)); gd.seasons.add(l);
      }
    });
    setVis(gd.seasons, layerOn('ground.seasons'));
  }
  ground.dirty = true;
}
function updateGround(s) {
  const { alt, az } = altAz(state.t, state.place.lat, state.place.lon, s);
  const p = skyPos(alt, az);
  gd.sun.position.copy(p);
  gd.sun.material.color.set(alt > 0 ? 0xffd23f : 0x9a8a50);
  // 天空顏色隨太陽高度變化（天亮、黃昏、夜晚）
  if (alt > 8) gd.bg.copy(DAYC);
  else if (alt > -2) gd.bg.copy(TWI).lerp(DAYC, (alt + 2) / 10);
  else if (alt > -12) gd.bg.copy(NIGHT).lerp(TWI, (alt + 12) / 10);
  else gd.bg.copy(NIGHT);
  gd.groundMat.color.copy(GND_NIGHT).lerp(GND_DAY, Math.max(0, Math.min(1, (alt + 6) / 14)));
  const top = V(0, STICK, 0);
  if (alt > 0.3) {
    const L = Math.min(STICK / Math.tan(alt * D2R), DOME * 2);
    gd.shadowPivot.visible = true;
    gd.shadow.scale.x = L; gd.shadow.position.x = L / 2;
    gd.shadowPivot.rotation.y = Math.PI / 2 - az * D2R + Math.PI; // 指向太陽的反方向
    const tipP = V(-Math.sin(az * D2R) * L, 0, Math.cos(az * D2R) * L);
    const end = L < DOME * 2 - 0.01 ? tipP : top;
    const pos = gd.ray.geometry.attributes.position;
    pos.setXYZ(0, p.x, p.y, p.z); pos.setXYZ(1, end.x, end.y, end.z); pos.needsUpdate = true;
    gd.ray.geometry.computeBoundingSphere();
    gd.ray.visible = layerOn('ground.ray');
  } else {
    gd.shadowPivot.visible = false;
    gd.ray.visible = false;
  }
  ground.dirty = true;
  return { alt, az };
}

// ───────────────────────── 圖層與鏡頭按鈕 ─────────────────────────
const LAYERS = {
  'space.months': () => sp.months, 'space.axis': () => [sp.axis, sp.perp], 'space.lines': () => sp.earth.lines,
  'space.rays': () => sp.rays, 'space.plane': () => sp.plane,
  'globe.grid': () => gl.earth.grid, 'globe.lines': () => gl.earth.lines, 'globe.term': () => gl.term,
  'globe.horizon': () => gl.earth.hz, 'globe.rays': () => gl.rays,
  'ground.hours': () => gd.hours, 'ground.ray': () => gd.ray, 'ground.seasons': () => gd.seasons,
  'ground.trail': () => gd.trail, 'ground.below': () => gd.below,
};
const layerState = {};
document.querySelectorAll('[data-layer]').forEach((b) => (layerState[b.dataset.layer] = b.classList.contains('on')));
function layerOn(k) { return !!layerState[k]; }
document.querySelectorAll('[data-layer]').forEach((b) => b.addEventListener('click', () => {
  const k = b.dataset.layer;
  layerState[k] = !layerState[k];
  b.classList.toggle('on', layerState[k]);
  [].concat(LAYERS[k]()).forEach((o) => setVis(o, layerState[k]));
  update();
}));
function applyLayers() { for (const k in LAYERS) [].concat(LAYERS[k]()).forEach((o) => setVis(o, layerState[k])); }

document.querySelectorAll('[data-cam]').forEach((b) => b.addEventListener('click', () => {
  const [view, mode] = b.dataset.cam.split('.');
  if (view === 'globe') {
    globeSpin = !globeSpin; b.classList.toggle('act', globeSpin); return;
  }
  b.parentElement.querySelectorAll('[data-cam]').forEach((x) => x.classList.toggle('act', x === b));
  if (view === 'ground') ground.setCam(...GROUND_CAMS[mode]);
  if (view === 'space') {
    spaceFollow = mode === 'follow';
    if (spaceFollow) {
      const p = sp.earth.group.position;
      const out = p.clone().normalize();
      space.setCam(p.clone().addScaledVector(out, 3.2).add(V(out.z * 3, 2.2, -out.x * 3)), p.clone());
    } else space.setCam(...SPACE_ALL);
  }
}));

// ───────────────────────── 數據面板 ─────────────────────────
function updateInfo(s, lp, aa) {
  const p = state.place, d = dayCache;
  const shadow = aa.alt > 0.3 ? `竿長的 ${(1 / Math.tan(aa.alt * D2R)).toFixed(2)} 倍` : '沒有影子（太陽在地平線下）';
  let dayTxt;
  if (d.status === 'polarDay') dayTxt = '<b>永晝</b>：太陽整天都在地平線上';
  else if (d.status === 'polarNight') dayTxt = '<b>永夜</b>：太陽整天都在地平線下';
  else dayTxt = `${Math.floor(d.dayLen / 60)} 小時 ${d.dayLen % 60} 分`;
  const diff = Math.abs(p.lat - s.decl);
  const formulaVal = 90 - diff;
  const formula = formulaVal > 0
    ? `90° − |${p.lat.toFixed(1)}° − (${s.decl.toFixed(1)}°)| = <b>${formulaVal.toFixed(1)}°</b>`
    : `90° − |${p.lat.toFixed(1)}° − (${s.decl.toFixed(1)}°)| = ${formulaVal.toFixed(1)}°，小於 0，代表正午時太陽仍在地平線下`;
  document.getElementById('info').innerHTML = `
    <h3>現在</h3>
    <table>
      <tr><td>日期時間</td><td>${lp.year}年${fmtDate(state.t)} ${fmtTime(state.t)}（${tzTxt(p.tz)}）</td></tr>
      <tr><td>地點</td><td>${p.name}：${latTxt(p.lat)}、${lonTxt(p.lon)}</td></tr>
      <tr><td>太陽高度角</td><td class="big">${aa.alt.toFixed(1)}°</td></tr>
      <tr><td>太陽方位角</td><td>${aa.az.toFixed(1)}°（${dirName(aa.az)}方）<span style="color:var(--dim)">　由正北順時針量</span></td></tr>
      <tr><td>竿影長度</td><td>${shadow}${aa.alt > 0.3 ? `，影子指向${dirName(aa.az + 180)}方` : ''}</td></tr>
    </table>
    <h3>今天</h3>
    <table>
      <tr><td>日出</td><td>${d.rise ? `${fmtTime(d.rise)}，從${dirName(d.riseAz)}方升起（${d.riseAz.toFixed(0)}°）` : '—'}</td></tr>
      <tr><td>日落</td><td>${d.set ? `${fmtTime(d.set)}，在${dirName(d.setAz)}方落下（${d.setAz.toFixed(0)}°）` : '—'}</td></tr>
      <tr><td>晝長</td><td>${dayTxt}</td></tr>
      <tr><td>太陽最高</td><td>${fmtTime(d.noonT)}，高度 ${d.noonAlt.toFixed(1)}°</td></tr>
    </table>
    <h3>太陽直射點</h3>
    <table>
      <tr><td>位置</td><td>${latTxt(s.subLat)}、${lonTxt(s.subLon)}</td></tr>
      <tr><td>日地距離</td><td>${(s.R * 1.496).toFixed(4)} 億公里（${s.R.toFixed(4)} AU）</td></tr>
    </table>
    <h3>正午太陽高度公式</h3>
    <div class="formula">正午太陽高度 = 90° − |所在緯度 − 直射點緯度|<br>${formula}<br>
      <span style="color:var(--dim);font-size:12px">北緯、直射點在北取正值，南緯取負值。公式算的是幾何高度，跟上面「太陽最高」的數字幾乎相同。</span></div>
  `;
}

// ───────────────────────── 控制列 ─────────────────────────
const $ = (id) => document.getElementById(id);
const placeSel = $('place');
PLACES.forEach((p, i) => placeSel.add(new Option(p.name, i)));
placeSel.add(new Option('自選地點', 'custom'));
placeSel.addEventListener('change', () => { if (placeSel.value !== 'custom') setPlace({ ...PLACES[+placeSel.value] }, true); });
$('lat').addEventListener('input', (e) => setPlace({ ...state.place, name: '自選地點', lat: +e.target.value, custom: true }));
function setPlace(p, aim = false) {
  // 換時區時保持「同一瞬間」，所以時鐘數字可能改變
  state.place = p;
  placeSel.value = p.custom ? 'custom' : PLACES.findIndex((x) => x.name === p.name);
  update();
  if (aim) aimGlobe();
}
// 把地球視角的鏡頭轉到正對所在地
function aimGlobe() {
  const w = gl.earth.me.getWorldPosition(new THREE.Vector3()).normalize();
  const dist = globe.camera.position.distanceTo(globe.controls.target);
  const dir = V(w.x, Math.max(-0.6, Math.min(0.6, w.y)) + 0.25, w.z).normalize();
  globe.setCam(dir.multiplyScalar(dist), V(0, 0, 0));
}
function setLocal(year, doy, min) {
  state.t = Date.UTC(year, 0, 1) + doy * DAY + min * 60000 - state.place.tz * 3600000;
  update();
}
$('date').addEventListener('input', (e) => { const l = local(); setLocal(l.year, +e.target.value, l.min); });
$('time').addEventListener('input', (e) => { const l = local(); setLocal(l.year, l.doy, +e.target.value); });
document.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => { state.t += +b.dataset.step * 60000; update(); }));
$('now').addEventListener('click', () => { state.t = Date.now(); update(); aimGlobe(); });
document.querySelectorAll('[data-season]').forEach((b) => b.addEventListener('click', () => {
  const l = local();
  const tm = seasonMoments(l.year)[+b.dataset.season];
  const d = new Date(tm + state.place.tz * 3600000);
  setLocal(d.getUTCFullYear(), Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY), l.min);
}));
document.querySelectorAll('[data-jump]').forEach((b) => b.addEventListener('click', () => {
  const k = { rise: 'rise', noon: 'noonT', set: 'set' }[b.dataset.jump];
  if (dayCache[k] != null) { state.t = Math.round(dayCache[k] / 60000) * 60000; update(); }
}));
$('play').addEventListener('click', () => {
  state.playing = !state.playing;
  $('play').textContent = state.playing ? '❚❚' : '▶';
});
$('speed').addEventListener('change', (e) => { state.speed = +e.target.value; state.dayAcc = 0; });
$('more').addEventListener('click', () => {
  const f = $('controls'); f.classList.toggle('collapsed');
  $('more').textContent = f.classList.contains('collapsed') ? '更多 ▾' : '收起 ▴';
});
// 手機分頁
document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === b.dataset.view));
  views.forEach((v) => (v.dirty = true));
}));
document.getElementById('v-ground').classList.add('active');

function updateControls(lp, aa) {
  $('date').max = lp.yearDays - 1;
  $('date').value = lp.doy;
  $('time').value = Math.floor(lp.min);
  $('dateOut').textContent = `${lp.month}月${lp.date}日`;
  $('timeOut').textContent = fmtTime(state.t);
  $('lat').value = state.place.lat;
  $('latOut').textContent = latTxt(state.place.lat);
  const hud = `${lp.month}/${lp.date} ${fmtTime(state.t)}　${state.place.name}<br>太陽高度 ${aa.alt.toFixed(1)}°　方位 ${dirName(aa.az)}`;
  views.forEach((v) => v.hud && (v.hud.innerHTML = hud));
}

// ───────────────────────── 主迴圈 ─────────────────────────
const views = [space, globe, ground];
let dayKey = '';
function update() {
  const s = sunAt(state.t);
  const lp = local();
  const k = `${lp.year}-${lp.doy}-${state.place.lat}-${state.place.lon}-${state.place.tz}`;
  if (k !== dayKey) { dayKey = k; rebuildDay(lp); }
  updateSpace(s, lp);
  updateGlobe(s);
  const aa = updateGround(s);
  updateInfo(s, lp, aa);
  updateControls(lp, aa);
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (state.playing) {
    if (state.speed >= DAY / 1000) {
      // 「時刻固定」模式：一次跳整天，所以每天同一時刻的太陽位置會連成一條線
      state.dayAcc += dt * state.speed / 86400;
      const n = Math.floor(state.dayAcc);
      if (n > 0) { state.dayAcc -= n; state.t += n * DAY; update(); }
    } else {
      state.t += dt * state.speed * 1000;
      update();
    }
  }
  views.forEach((v) => v.render());
  requestAnimationFrame(frame);
}
// ───────────────────────── 網址參數（學習指引用來「帶到這個畫面」） ─────────────────────────
// 例：?season=1&time=12:00&place=台北&view=ground&layers=ground.seasons,-ground.hours&cam=ground.top&speed=600&play=1
function applyUrlParams() {
  const q = new URLSearchParams(location.search);
  if (![...q.keys()].length) return;
  const name = q.get('place');
  if (name) {
    const i = PLACES.findIndex((p) => p.name.startsWith(name));
    if (i >= 0) setPlace({ ...PLACES[i] });
  }
  if (q.has('lat')) setPlace({ ...state.place, name: '自選地點', lat: +q.get('lat'), custom: true });
  const l = local();
  let { year, doy, min } = l;
  const toDoy = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / DAY);
  if (q.get('date')) {
    const [y, m, d] = q.get('date').split('-').map(Number);
    year = y; doy = toDoy(y, m, d);
  }
  if (q.get('season') != null) {
    // 用「今年的春分/夏至/秋分/冬至」，連結就不會過期
    const d = new Date(seasonMoments(year)[+q.get('season')] + state.place.tz * 3600000);
    doy = toDoy(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  if (q.get('time')) {
    const [h, m] = q.get('time').split(':').map(Number);
    min = h * 60 + (m || 0);
  }
  if (q.has('date') || q.has('season') || q.has('time')) setLocal(year, doy, min);
  if (q.get('jump')) document.querySelector(`[data-jump="${q.get('jump')}"]`)?.click();
  // layers：寫名字＝打開，前面加 - ＝關掉
  for (const k of (q.get('layers') || '').split(',').filter(Boolean)) {
    const on = !k.startsWith('-'), key = k.replace(/^-/, '');
    if (layerOn(key) !== on) document.querySelector(`[data-layer="${key}"]`)?.click();
  }
  for (const c of (q.get('cam') || '').split(',').filter(Boolean)) document.querySelector(`[data-cam="${c}"]`)?.click();
  if (q.get('spin') === '0' && globeSpin) document.querySelector('[data-cam="globe.spin"]')?.click();
  if (q.get('speed')) { $('speed').value = q.get('speed'); $('speed').dispatchEvent(new Event('change')); }
  const view = q.get('view');
  if (view) {
    document.querySelector(`#tabs [data-view="v-${view}"]`)?.click();
    // 電腦版四格都在，閃一下框線提示該看哪一格
    const el = document.getElementById('v-' + view);
    el?.classList.add('flash');
    setTimeout(() => el?.classList.remove('flash'), 2600);
  }
  aimGlobe();
  if (q.get('play') === '1') $('play').click();
}

applyLayers();
update();
aimGlobe();
applyUrlParams();
requestAnimationFrame(frame);
loadLand();
