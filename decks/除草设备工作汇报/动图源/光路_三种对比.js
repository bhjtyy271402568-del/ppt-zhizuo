// 三种扫描光路并排对比（侧视剖面），三个振镜同步摆动
//   平行光：准直镜 → 振镜 → 地面
//   后聚焦：准直镜 → 振镜 → F-θ 场镜 → 地面（落点 x = f·φ，焦点在平面上）
//   前聚焦（动态聚焦）：准直镜 → 动镜 → 物镜 → 振镜 → 地面
//     动镜不动时焦点沿以振镜为圆心的圆弧走；动镜按 L = 40 + 650/cosφ 跟随，焦点拉回地面
//
// 画法：光学头（振镜周围 110 mm 以内）按 K px/mm 放大画成剖面；振镜以下的传播距离压缩，
// 以振镜为中心做“径向映射”——方向角不变，地面仍是平的，所以偏转角、圆弧焦面都画得对。
// 光束宽度一律按真实半径 × K 画（高斯光束 q 参数计算），数值来自 工具/*.json。
const L = require("./lib");
const { OPT } = L;
const B = require("./B镜组");

const W = 1600, H = 780;
const PW = W / 3;
const K = 1.7;                                       // 光学头放大比例 px/mm
const ZH = 110;                                      // 光学头深度 mm（振镜以下按 K 画到这里）
const GY = 200;                                      // 振镜转轴 y
const GROUND = 660;                                  // 地面 y
const HW = OPT["假设"]["振镜到地面_mm"];              // 650
const SB = (GROUND - GY - K * ZH) / (HW - ZH);       // 光学头以下的压缩比例
const PHI_MAX = OPT["后聚焦"]["单轴光学扫描角_deg"] * Math.PI / 180;
const F_THETA = OPT["后聚焦"]["场镜焦距_mm"];
const D_BEAM = OPT["假设"]["进振镜光束直径_mm"];
const fColl = (D_BEAM / 2) / L.NA;                   // 准直镜焦距 ≈ 27.3 mm
const qColl = L.qLens(L.qProp(L.qWaist(L.CORE_R), fColl), fColl);
const A_IN = 100;                                    // 准直镜到振镜
const OBJ_TO_GALVO = 40;                             // 物镜到振镜（前聚焦）
const Z0 = -OBJ_TO_GALVO - B.OBJ_LEN;                // 物镜第一面相对振镜
const ZC = Z0 - B.D0;                                // 前聚焦准直镜位置

const INK = "#1E2329", MID = "#5A626C", LEAD = "#8C949D";
const FS = 22;                                       // 标注字号

// ---------------- 公共定义：渐变、滤镜 ----------------
const DEFS = `<defs>
  <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FBFCFD"/><stop offset="0.35" stop-color="#D9DEE3"/>
    <stop offset="0.7" stop-color="#AEB6BF"/><stop offset="1" stop-color="#8E979F"/></linearGradient>
  <linearGradient id="metalV" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#8E979F"/><stop offset="0.3" stop-color="#E9EDF0"/>
    <stop offset="0.65" stop-color="#C3CAD1"/><stop offset="1" stop-color="#8E979F"/></linearGradient>
  <linearGradient id="anod" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#202328"/><stop offset="0.35" stop-color="#4A5058"/>
    <stop offset="0.7" stop-color="#30353B"/><stop offset="1" stop-color="#1A1D21"/></linearGradient>
  <linearGradient id="anodH" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#4A5058"/><stop offset="0.5" stop-color="#2E3338"/><stop offset="1" stop-color="#1A1D21"/></linearGradient>
  <linearGradient id="house" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#F3F5F7"/><stop offset="1" stop-color="#DDE2E7"/></linearGradient>
  <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#EEF6FD" stop-opacity="0.92"/><stop offset="0.55" stop-color="#C9DFF2" stop-opacity="0.85"/>
    <stop offset="1" stop-color="#A9C9E6" stop-opacity="0.9"/></linearGradient>
  <linearGradient id="mirror" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#FFFFFF"/><stop offset="0.45" stop-color="#D7DEE6"/><stop offset="1" stop-color="#9FAAB6"/></linearGradient>
  <linearGradient id="soil" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#B89B74"/><stop offset="0.18" stop-color="#CDB696"/><stop offset="1" stop-color="#EFE6D8"/></linearGradient>
  <radialGradient id="spot"><stop offset="0" stop-color="#FFF4C2"/><stop offset="0.25" stop-color="#FF7A3D"/>
    <stop offset="0.6" stop-color="#E5303F" stop-opacity="0.55"/><stop offset="1" stop-color="#E5303F" stop-opacity="0"/></radialGradient>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
  <filter id="sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.22"/></filter>
</defs>`;

const f2 = L.f2;
const ptsStr = (pts) => pts.map((p) => `${f2(p[0])},${f2(p[1])}`).join(" ");

function panel(k) {
  const cx = k * PW + PW / 2, gx = cx + 72;
  return { cx, gx, X: (x) => gx + K * x, Y: (z) => GY + K * z };
}

// 以振镜为中心的径向映射：方向角 a（相对竖直向下），真实路程 r → 画面点
function ray(P, a, r) {
  const rh = ZH / Math.cos(a);
  const d = r <= rh ? K * r : K * rh + SB * (r - rh);
  return [P.gx + d * Math.sin(a), GY + d * Math.cos(a)];
}

// 光束：中心线函数 c(u) → [x,y]，半宽 w(u) px；外层辉光 + 主体 + 亮芯
function beam(c, w, n = 60) {
  const up = [], dn = [], mid = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, p = c(u), q = c(Math.min(1, u + 1e-3)), p0 = c(Math.max(0, u - 1e-3));
    let tx = q[0] - p0[0], ty = q[1] - p0[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const ww = w(u);
    up.push([p[0] - ty * ww, p[1] + tx * ww]); dn.push([p[0] + ty * ww, p[1] - tx * ww]); mid.push(p);
  }
  const poly = ptsStr(up.concat(dn.reverse()));
  return `<polygon points="${poly}" fill="#FF3B4E" opacity="0.35" filter="url(#glow)"/>` +
    `<polygon points="${poly}" fill="#E8283C" fill-opacity="0.62" stroke="#C4142A" stroke-width="0.8"/>` +
    `<polyline points="${ptsStr(mid)}" fill="none" stroke="#FFD0D4" stroke-width="1.4" opacity="0.9"/>`;
}

// 标注：部件点 (x1,y1) → 文字 (tx,ty)
function tag(x1, y1, tx, ty, s, anchor = "middle", size = FS) {
  const ex = anchor === "end" ? tx + 6 : anchor === "start" ? tx - 6 : tx;
  return L.line(x1, y1, ex, ty + 7, { c: LEAD, w: 1 }) + L.circle(x1, y1, 2.4, { fill: LEAD }) +
    L.text(tx, ty, s, { size, c: INK, anchor });
}

// ---------------- 部件 ----------------
function fiber(x0, y0, x1, y1) {
  const d = `M ${x0} ${y0} C ${x0 + 10} ${y1 - 6}, ${x1 - 60} ${y1}, ${x1} ${y1}`;
  return `<path d="${d}" fill="none" stroke="#9C6B00" stroke-width="8.5" stroke-linecap="round"/>` +
    `<path d="${d}" fill="none" stroke="#F0AE1E" stroke-width="6" stroke-linecap="round"/>` +
    `<path d="${d}" fill="none" stroke="#FFE08A" stroke-width="1.5" stroke-linecap="round" opacity="0.8" transform="translate(0 -1.5)"/>`;
}

function sma(x, y) {                                   // SMA905 接头：尾套 + 滚花螺母，x 为右端
  let g = `<rect x="${x - 40}" y="${y - 7}" width="16" height="14" rx="3" fill="#2E3338"/>`;
  g += `<rect x="${x - 26}" y="${y - 12}" width="22" height="24" rx="2" fill="url(#metal)" stroke="#6B747D" stroke-width="1"/>`;
  for (let k = 0; k < 6; k++) g += L.line(x - 23 + k * 3.4, y - 11, x - 23 + k * 3.4, y + 11, { c: "#8E979F", w: 0.8 });
  g += `<rect x="${x - 5}" y="${y - 6}" width="6" height="12" fill="url(#metal)" stroke="#6B747D" stroke-width="0.8"/>`;
  return g;
}

// 横向镜筒剖面：外径 od、壁厚 t（mm），从 xa 到 xb（px），中心 y
function barrelH(xa, xb, y, od, t = 2.5, fill = "url(#metal)") {
  const R = (od / 2) * K, T = t * K;
  return `<g filter="url(#sh)"><rect x="${xa}" y="${y - R}" width="${xb - xa}" height="${T}" fill="${fill}" stroke="#5E6770" stroke-width="1"/>` +
    `<rect x="${xa}" y="${y + R - T}" width="${xb - xa}" height="${T}" fill="${fill}" stroke="#5E6770" stroke-width="1"/></g>` +
    `<rect x="${xa}" y="${y - R + T}" width="${xb - xa}" height="${2 * (R - T)}" fill="#F7F9FB" opacity="0.6"/>`;
}

// 透镜（光轴水平）：中心 x、y（px），口径 a（mm 半口径），左右面曲率半径 R1、R2（mm，正为凸向左），中心厚 t（mm）
function lensH(x, y, a, R1, R2, t) {
  const sag = (R, h) => (isFinite(R) ? R - Math.sign(R) * Math.sqrt(R * R - h * h) : 0);
  const pts = [];
  for (let k = 0; k <= 32; k++) { const h = -a + (2 * a * k) / 32; pts.push([x + K * (-t / 2 + sag(R1, h)), y + K * h]); }
  for (let k = 32; k >= 0; k--) { const h = -a + (2 * a * k) / 32; pts.push([x + K * (t / 2 + sag(R2, h)), y + K * h]); }
  return `<polygon points="${ptsStr(pts)}" fill="url(#glass)" stroke="#4F7DB3" stroke-width="1.3"/>`;
}
// 透镜（光轴竖直）
function lensV(x, y, a, R1, R2, t) {
  const sag = (R, h) => (isFinite(R) ? R - Math.sign(R) * Math.sqrt(R * R - h * h) : 0);
  const pts = [];
  for (let k = 0; k <= 32; k++) { const h = -a + (2 * a * k) / 32; pts.push([x + K * h, y + K * (-t / 2 + sag(R1, h))]); }
  for (let k = 32; k >= 0; k--) { const h = -a + (2 * a * k) / 32; pts.push([x + K * h, y + K * (t / 2 + sag(R2, h))]); }
  return `<polygon points="${ptsStr(pts)}" fill="url(#glass)" stroke="#4F7DB3" stroke-width="1.3"/>`;
}

function galvoBack(P) {                               // 振镜外壳（剖开），先画在光束下面
  const x0 = P.X(-30), y0 = P.Y(-38), w = 60 * K, h = 70 * K;
  return `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="8" fill="url(#house)" filter="url(#sh)"/>`;
}
function galvoFront(P, phi) {                         // 镜片 + 电机轴 + 外壳轮廓
  const dox = Math.sin(phi), doz = Math.cos(phi);
  let nx = dox - 1, nz = doz; const n = Math.hypot(nx, nz); nx /= n; nz /= n;
  const tx = -nz, tz = nx, h = 17;                     // 镜片半长 17 mm
  const p = (a, b) => [P.X(a), P.Y(b)];
  let g = L.circle(P.X(0), P.Y(0), 11 * K, { fill: "url(#anodH)" });
  g += L.circle(P.X(0), P.Y(0), 11 * K, { c: "#15181B", w: 1 });
  const m = [p(-tx * h + nx * 1.4, -tz * h + nz * 1.4), p(tx * h + nx * 1.4, tz * h + nz * 1.4),
             p(tx * h - nx * 2.6, tz * h - nz * 2.6), p(-tx * h - nx * 2.6, -tz * h - nz * 2.6)];
  g += `<polygon points="${ptsStr(m)}" fill="url(#mirror)" stroke="#3E454D" stroke-width="1.2"/>`;
  g += L.circle(P.X(0), P.Y(0), 3, { fill: "#C8CFD6", c: "#3E454D", w: 1 });
  const x0 = P.X(-30), y0 = P.Y(-38), w = 60 * K, hh = 70 * K;
  g += `<rect x="${x0}" y="${y0}" width="${w}" height="${hh}" rx="8" fill="none" stroke="#59616A" stroke-width="2"/>`;
  // 入光孔、出光孔
  g += `<rect x="${x0 - 3}" y="${P.Y(-8)}" width="6" height="${16 * K}" fill="#FFFFFF"/>`;
  g += `<rect x="${P.X(-14)}" y="${y0 + hh - 3}" width="${28 * K}" height="6" fill="#FFFFFF"/>`;
  return g;
}

function groundStrip(P) {
  const xa = P.cx - PW / 2 + 22, xb = P.cx + PW / 2 - 22;
  let g = `<rect x="${xa}" y="${GROUND}" width="${xb - xa}" height="34" fill="url(#soil)"/>`;
  g += L.line(xa, GROUND, xb, GROUND, { c: "#7A6347", w: 1.6 });
  for (const dx of [-205, -118, -30, 60, 150, 230]) {   // 杂草
    const x = P.gx + dx;
    if (x < xa + 10 || x > xb - 10) continue;
    for (const [a, l] of [[-0.55, 15], [-0.15, 21], [0.25, 18], [0.6, 13]])
      g += `<path d="M ${x} ${GROUND} q ${Math.sin(a) * l * 0.4} ${-l * 0.55} ${Math.sin(a) * l} ${-l * Math.cos(a)}" stroke="#4E8A2C" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
  }
  return g;
}

function scanFan(P) {                                 // 扫描范围（淡色虚线）
  const a = Math.atan(175 / HW);
  return [-a, a].map((t) => { const e = ray(P, t, HW / Math.cos(t)); return L.line(P.gx, GY, e[0], e[1], { c: "#C9CED4", w: 1, dash: "5 5" }); }).join("");
}

function spotRow(P, d, desc) {
  const cx = P.cx - PW / 2 + 70, cy = 738, k = 3.2;
  let g = L.circle(cx, cy, 28, { fill: "#F5F6F8", c: "#D6DADF", w: 1 });
  g += `<circle cx="${cx}" cy="${cy}" r="${Math.max(2, d * k / 2) + 4}" fill="url(#spot)"/>`;
  g += L.circle(cx, cy, Math.max(2, d * k / 2), { fill: "#E5303F", op: 0.85 });
  g += L.text(cx + 46, cy - 2, `光斑 ${d.toFixed(1)} mm`, { size: 30, c: "#C4142A", weight: 500 });
  g += L.text(cx + 46, cy + 28, desc, { size: 20, c: MID });
  return g;
}

function landing(xg) {
  return `<circle cx="${xg}" cy="${GROUND}" r="16" fill="url(#spot)"/>` + L.circle(xg, GROUND, 3.2, { fill: "#FFF6D6" });
}

module.exports = {
  name: "光路_三种对比", width: W, height: H, fps: 20, frames: 96, offset: 14, scale: 1.25, colors: 200,
  frame(i) {
    const phi = PHI_MAX * Math.sin((2 * Math.PI * i) / 96);
    const ca = Math.cos(phi);
    let g = DEFS;
    for (const x of [PW, 2 * PW]) g += L.line(x, 24, x, H - 16, { c: "#E1E4E8", w: 1.2 });
    const heads = [["平行光", "准直镜 → 振镜"], ["后聚焦", "准直镜 → 振镜 → F-θ 场镜"], ["前聚焦（动态聚焦）", "准直镜 → 动镜 → 物镜 → 振镜"]];
    heads.forEach(([t, s], k) => {
      g += L.text(k * PW + PW / 2, 46, t, { size: 30, weight: 500, anchor: "middle", c: INK });
      g += L.text(k * PW + PW / 2, 76, s, { size: 18, anchor: "middle", c: MID });
    });

    // ================= 平行光 / 后聚焦：共用的准直部分 =================
    const collimated = (P) => {
      const xL = P.X(-A_IN), xT = P.X(-A_IN - fColl), y = GY;
      let s = groundStrip(P) + scanFan(P) + galvoBack(P);
      s += fiber(P.cx - PW / 2 + 26, GY + 84, xT - 40, y) + sma(xT, y);
      // 光纤端面 → 准直镜：发散光锥；准直镜 → 振镜：准直光
      s += beam((u) => [xT + (xL - xT) * u, y], (u) => K * (L.CORE_R + fColl * u * L.NA));
      s += beam((u) => [xL + (P.X(0) - xL) * u, y], (u) => K * L.qW(L.qProp(qColl, A_IN * u)));
      s += barrelH(xT - 2, xL + 7, y, 28);
      s += lensH(xL, y, 10, 120, Infinity, 3.4);
      s += tag(xL - 22, y - 24, xL - 40, y - 62, "准直镜");
      return s;
    };

    // ---------------- 平行光 ----------------
    let P = panel(0);
    g += collimated(P);
    let r = HW / ca, end = ray(P, phi, r);
    g += beam((u) => ray(P, phi, r * u), (u) => K * L.qW(L.qProp(qColl, A_IN + r * u)));
    g += galvoFront(P, phi) + landing(end[0]);
    g += tag(P.X(18), P.Y(-38), P.X(30), P.Y(-38) - 34, "振镜", "start");
    // 650 mm 尺寸线（距离压缩，用折断符号表示）
    const xd = P.cx + PW / 2 - 30;
    g += L.line(P.X(32), GY, xd + 10, GY, { c: "#C3C8CE", w: 1, dash: "4 4" });
    g += L.dim(xd, GY, xd, GROUND, "", { c: INK });
    const yb = (GY + GROUND) / 2 + 40;
    g += `<rect x="${xd - 8}" y="${yb - 5}" width="16" height="10" fill="#FFFFFF"/>` +
      L.line(xd - 8, yb - 1, xd + 8, yb - 7, { c: INK, w: 1.2 }) + L.line(xd - 8, yb + 7, xd + 8, yb + 1, { c: INK, w: 1.2 });
    g += L.text(xd - 10, (GY + GROUND) / 2 - 6, "650 mm", { size: FS, c: INK, anchor: "end" });
    g += spotRow(P, 2 * L.qW(L.qProp(qColl, A_IN + HW)), "不随高度变化");

    // ---------------- 后聚焦 ----------------
    P = panel(1);
    g += collimated(P);
    const zt = 40, zb = 104;                             // 场镜镜筒上、下端（mm）
    const T0 = ray(P, phi, zt / ca);
    const E = [T0[0] + Math.tan(phi) * K * (zb - zt), P.Y(zb)];
    const xHit = P.gx + (GROUND - GY) * phi * F_THETA / HW;   // F-θ：落点 ∝ φ
    const w0 = OPT["后聚焦"]["焦点光斑_mm"] / 2, zr = OPT["后聚焦"]["瑞利长度_mm"];
    const Ls = Math.hypot((xHit - E[0]) / K, HW - zb);
    // 场镜镜筒（剖面）
    const bx0 = P.X(-62), bx1 = P.X(62);
    g += `<rect x="${bx0}" y="${P.Y(zt - 4)}" width="${bx1 - bx0}" height="${K * (zb - zt + 8)}" rx="4" fill="#ECEFF2" filter="url(#sh)"/>`;
    g += beam((u) => ray(P, phi, (zt / ca) * u), (u) => K * L.qW(L.qProp(qColl, A_IN + (zt / ca) * u)));
    g += beam((u) => [T0[0] + (E[0] - T0[0]) * u, T0[1] + (E[1] - T0[1]) * u], () => K * 6.0);
    g += beam((u) => [E[0] + (xHit - E[0]) * u, E[1] + (GROUND - E[1]) * u],
      (u) => K * w0 * Math.sqrt(1 + ((Ls * u - Ls) / zr) ** 2));
    g += lensV(P.gx, P.Y(55), 48, -150, -95, 9) + lensV(P.gx, P.Y(86), 54, 260, -120, 12);
    g += `<rect x="${bx0}" y="${P.Y(zt - 4)}" width="${7 * K}" height="${K * (zb - zt + 8)}" fill="url(#anod)"/>` +
      `<rect x="${bx1 - 7 * K}" y="${P.Y(zt - 4)}" width="${7 * K}" height="${K * (zb - zt + 8)}" fill="url(#anod)"/>` +
      `<rect x="${bx0 - 6}" y="${P.Y(zt - 4)}" width="${bx1 - bx0 + 12}" height="9" rx="2" fill="url(#anodH)"/>`;
    g += galvoFront(P, phi) + landing(xHit);
    g += tag(P.X(18), P.Y(-38), P.X(30), P.Y(-38) - 34, "振镜", "start");
    g += tag(bx1 - 4, P.Y(72), bx1 + 16, P.Y(72) + 30, "F-θ 场镜", "start");
    g += spotRow(P, 2 * w0, "焦点始终在地面上");

    // ---------------- 前聚焦（动态聚焦） ----------------
    P = panel(2);
    const Lf = OBJ_TO_GALVO + HW / ca, gap = B.gapOf(Lf), gap0 = B.gapOf(OBJ_TO_GALVO + HW);
    const zML = Z0 + B.zFront(gap);                      // 动镜前表面（相对振镜，mm）
    const xT = P.X(ZC - B.FC), xC = P.X(ZC), y = GY;
    g += groundStrip(P) + scanFan(P);
    // 动镜不动时的焦点轨迹：圆弧 r = 650 mm
    const arc = [];
    for (let k = 0; k <= 60; k++) { const t = -PHI_MAX * 1.15 + (2.3 * PHI_MAX * k) / 60; arc.push(ray(P, t, HW)); }
    g += L.pline(arc, { c: "#3E78B8", w: 1.8, dash: "8 6" });
    g += galvoBack(P);
    g += fiber(P.cx - PW / 2 + 22, GY + 84, xT - 38, y) + sma(xT, y);
    g += beam((u) => [xT + (xC - xT) * u, y], (u) => K * (L.CORE_R + B.FC * u * L.NA));
    g += beam((u) => [xC + (P.X(0) - xC) * u, y], (u) => K * B.radiusAt(gap, ZC + (0 - ZC) * u - Z0));
    r = HW / ca; end = ray(P, phi, r);
    g += beam((u) => ray(P, phi, r * u), (u) => K * B.radiusAt(gap, B.OBJ_LEN + OBJ_TO_GALVO + r * u));
    // 准直镜（小）
    g += barrelH(xT - 2, xC + 5, y, 14, 2);
    g += lensH(xC, y, 4.5, 30, Infinity, 2.2);
    // 动镜：导轨 + 滑座 + 镜座
    const yr = y + 24 * K, xm = P.X(zML + 1);
    g += `<rect x="${xC + 10}" y="${yr}" width="${P.X(Z0 - 6) - xC - 10}" height="7" rx="2" fill="url(#metal)" stroke="#6B747D" stroke-width="0.8"/>`;
    g += `<rect x="${xm - 5}" y="${y + 6.6 * K}" width="10" height="${yr - y - 6.6 * K}" fill="url(#metalV)" stroke="#6B747D" stroke-width="0.8"/>`;
    g += `<rect x="${xm - 17}" y="${yr - 9}" width="34" height="11" rx="2" fill="url(#anodH)"/>`;
    g += lensH(xm, y, 6.35, -18.71, 18.71, 2.0);
    // 物镜镜筒（剖面）+ 两片物镜
    const xo0 = P.X(Z0 - 3), xo1 = P.X(Z0 + B.OBJ_LEN + 3);
    g += `<rect x="${xo0}" y="${y - 30 * K}" width="${xo1 - xo0}" height="${5 * K}" fill="url(#anodH)" filter="url(#sh)"/>` +
      `<rect x="${xo0}" y="${y + 25 * K}" width="${xo1 - xo0}" height="${5 * K}" fill="url(#anodH)" filter="url(#sh)"/>`;
    g += lensH(P.X(Z0 + 3.92), y, 25.4, Infinity, -69.01, 7.84) + lensH(P.X(Z0 + 14.722 + 3.27), y, 25.4, 182.99, -182.99, 6.54);
    g += galvoFront(P, phi) + landing(end[0]);
    g += tag(P.X(18), P.Y(-38), P.X(30), P.Y(-38) - 34, "振镜", "start");
    g += tag(xC - 6, y - 7 * K, xC - 30, y - 62, "准直镜");
    g += tag(xm, y - 7 * K, xm - 6, y - 92, "动镜");
    g += tag(P.X(Z0 + 10), y - 30 * K, P.X(Z0 + 10) + 6, y - 92, "物镜");
    // 动镜位移刻度（放大）
    const dg = gap - gap0, gx0 = P.cx - PW / 2 + 36, gw = 180, gy = 330;   // 放在光束扫描范围左侧
    const gxOf = (v) => gx0 + gw * (v + 0.6) / 0.7;       // 刻度范围 −0.6 … +0.1 mm
    g += L.text(gx0, gy - 24, "动镜位移", { size: 20, c: INK });
    g += L.line(gx0, gy, gx0 + gw, gy, { c: INK, w: 1.3 });
    for (let v = -0.6; v <= 0.1001; v += 0.1) {
      const major = Math.abs(v * 10 - Math.round(v * 10)) < 1e-6 && Math.round(v * 10) % 2 === 0;
      g += L.line(gxOf(v), gy, gxOf(v), gy + (major ? 9 : 5), { c: INK, w: 1 });
      if (major) g += L.text(gxOf(v), gy + 28, v < -1e-9 ? `−${Math.abs(v).toFixed(1)}` : "0", { size: 16, c: MID, anchor: "middle" });
    }
    g += L.text(gx0 + gw + 8, gy + 28, "mm", { size: 16, c: MID });
    g += `<polygon points="${ptsStr([[gxOf(dg), gy - 2], [gxOf(dg) - 8, gy - 16], [gxOf(dg) + 8, gy - 16]])}" fill="#D0263A"/>`;
    g += L.text(gx0 + gw, gy - 24, `${dg < 0 ? "−" : "+"}${Math.abs(dg).toFixed(2)} mm`, { size: 20, c: "#C4142A", anchor: "end", weight: 500 });
    // 圆弧说明
    g += L.line(gx0, 418, gx0 + 34, 418, { c: "#3E78B8", w: 1.8, dash: "8 6" });
    g += L.text(gx0 + 42, 425, "动镜不动时焦点轨迹", { size: 19, c: "#3E78B8" });
    g += spotRow(P, B.dAt(gap, Lf), "动镜跟随，焦点落在地面上");
    return L.svg(W, H, g);
  },
};
