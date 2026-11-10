// 太陽位置計算（NOAA 太陽計算公式，精度約 0.01°，適用 1900–2100 年）
// 所有角度單位為「度」，時間 t 為 UTC 毫秒（與 Date.now() 相同）

export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;
export const norm360 = (a) => ((a % 360) + 360) % 360;
export const norm180 = (a) => { a = norm360(a); return a > 180 ? a - 360 : a; };

export function julian(t) { return t / 86400000 + 2440587.5; }

/**
 * 某一瞬間的太陽資料
 * decl  赤緯（= 太陽直射點緯度）
 * ra    赤經
 * lambda 黃經（太陽在黃道上的位置；0°=春分、90°=夏至、180°=秋分、270°=冬至）
 * R     日地距離（天文單位 AU）
 * eot   均時差（分鐘；真太陽時 − 平太陽時）
 * eps   黃赤交角（地軸傾斜角）
 * gmst  格林威治恆星時（角度）：地球自轉到哪個角度
 */
export function sunAt(t) {
  const JD = julian(t);
  const T = (JD - 2451545) / 36525;
  const L0 = norm360(280.46646 + T * (36000.76983 + T * 0.0003032));
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * D2R;
  const C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T))
          + Math.sin(2 * Mr) * (0.019993 - 0.000101 * T)
          + Math.sin(3 * Mr) * 0.000289;
  const trueLong = L0 + C;
  const trueAnom = M + C;
  const R = 1.000001018 * (1 - e * e) / (1 + e * Math.cos(trueAnom * D2R));
  const omega = (125.04 - 1934.136 * T) * D2R;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega);
  const lr = lambda * D2R, er = eps * D2R;
  const decl = Math.asin(Math.sin(er) * Math.sin(lr)) * R2D;
  const ra = norm360(Math.atan2(Math.cos(er) * Math.sin(lr), Math.cos(lr)) * R2D);
  const y = Math.tan(er / 2) ** 2, L0r = L0 * D2R;
  const eot = 4 * R2D * (y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr)
            + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r)
            - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));
  const gmst = norm360(280.46061837 + 360.98564736629 * (JD - 2451545)
             + T * T * (0.000387933 - T / 38710000));
  return { decl, ra, lambda: norm360(lambda), R, eot, eps, gmst,
           subLat: decl, subLon: norm180(ra - gmst) };
}

/** 觀察者看到的太陽高度角 alt 與方位角 az（由正北順時針量） */
export function altAz(t, lat, lon, s = sunAt(t)) {
  lat = Math.max(-89.99, Math.min(89.99, lat));
  const H = (s.gmst + lon - s.ra) * D2R;   // 時角：太陽離開當地子午線多遠
  const p = lat * D2R, d = s.decl * D2R;
  const sinAlt = Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * R2D;
  const az = norm360(Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(p) - Math.tan(d) * Math.cos(p)) * R2D + 180);
  return { alt, az };
}

// 日出日落以太陽「上緣」碰到地平線為準，並含大氣折射，所以用 −0.833°
export const HORIZON = -0.833;

/** 從 t0 起算 24 小時內的日出、日落、正午、晝長 */
export function dayInfo(t0, lat, lon) {
  let prev = null, rise = null, set = null, riseAz = null, setAz = null;
  let above = 0, noonAlt = -99, noonT = t0;
  for (let m = 0; m <= 1440; m++) {
    const t = t0 + m * 60000;
    const { alt, az } = altAz(t, lat, lon);
    if (m < 1440 && alt > HORIZON) above++;
    if (alt > noonAlt) { noonAlt = alt; noonT = t; }
    if (prev) {
      const f = (HORIZON - prev.alt) / (alt - prev.alt);
      if (rise === null && prev.alt <= HORIZON && alt > HORIZON) { rise = prev.t + f * 60000; riseAz = az; }
      if (set === null && prev.alt > HORIZON && alt <= HORIZON) { set = prev.t + f * 60000; setAz = az; }
    }
    prev = { t, alt };
  }
  const status = above >= 1440 ? 'polarDay' : above === 0 ? 'polarNight' : 'normal';
  return { rise, set, riseAz, setAz, dayLen: above, noonT, noonAlt, status };
}

/** 某年的春分、夏至、秋分、冬至瞬間（UTC 毫秒） */
export function seasonMoments(year) {
  const out = [];
  const t0 = Date.UTC(year, 0, 1);
  for (const target of [0, 90, 180, 270]) {
    let prev = null;
    for (let d = 0; d < 367; d++) {
      const t = t0 + d * 86400000;
      const v = norm180(sunAt(t).lambda - target);
      if (prev && prev.v < 0 && v >= 0) {
        let a = prev.t, b = t;
        for (let i = 0; i < 40; i++) {
          const m = (a + b) / 2;
          if (norm180(sunAt(m).lambda - target) < 0) a = m; else b = m;
        }
        out.push(a);
        break;
      }
      prev = { t, v };
    }
  }
  return out;
}

const DIRS = ['北', '北北東', '東北', '東北東', '東', '東南東', '東南', '南南東',
              '南', '南南西', '西南', '西南西', '西', '西北西', '西北', '北北西'];
export const dirName = (az) => DIRS[Math.round(norm360(az) / 22.5) % 16];
