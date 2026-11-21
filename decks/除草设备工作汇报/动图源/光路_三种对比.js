// 三种扫描光路并排对比（侧视），三个振镜同步摆动
//   平行光：准直镜 → 振镜 → 地面
//   后聚焦：准直镜 → 振镜 → F-θ 场镜 → 地面（落点 x = f·φ，焦点在平面上）
//   前聚焦（动态聚焦）：准直镜 → 动镜 → 物镜 → 振镜 → 地面
//     焦点本来沿以振镜为圆心的圆弧走；动镜按 L = 40 + 650/cosφ 跟随，焦点拉回地面
// 几何：振镜到地面 650 mm；光束半径按 M² 高斯光束（q 参数）计算；数值来自 工具/*.json
const L = require("./lib");
const { C, OPT } = L;
const B = require("./B镜组");

const W = 1600, H = 700, S = 0.66;                 // 逻辑尺寸；S：px/mm
const PW = 1600 / 3;
const GY = 162;                                     // 振镜转轴的 y
const HW = OPT["假设"]["振镜到地面_mm"];             // 650
const PHI_MAX = OPT["后聚焦"]["单轴光学扫描角_deg"] * Math.PI / 180;
const F_THETA = OPT["后聚焦"]["场镜焦距_mm"];
const D_BEAM = OPT["假设"]["进振镜光束直径_mm"];
const fColl = (D_BEAM / 2) / L.NA;
const qColl = L.qLens(L.qProp(L.qWaist(L.CORE_R), fColl), fColl);
const A_IN = 100;                                   // 准直镜到振镜（平行光、后聚焦）
const OBJ_TO_GALVO = 40;                            // 物镜最后一面到振镜（前聚焦）
const Z0 = -OBJ_TO_GALVO - B.OBJ_LEN;               // 物镜第一面相对振镜的位置

const T = 28, LB = 21;                              // 标题、标注字号

function panel(k) {
  const gx = k * PW + PW / 2 + 52;                  // 振镜转轴的 x
  return { gx, px: (x) => gx + S * x, pz: (z) => GY + S * z };
}

// 光束段：从 (x0,z0) 沿 (dx,dz) 走 len mm，半宽 wOf(s)
function band(P, x0, z0, dx, dz, len, wOf, n = 50) {
  const nx = -dz, nz = dx, up = [], dn = [];
  for (let i = 0; i <= n; i++) {
    const s = (len * i) / n, w = wOf(s);
    const x = x0 + dx * s, z = z0 + dz * s;
    up.push([P.px(x + nx * w), P.pz(z + nz * w)]);
    dn.push([P.px(x - nx * w), P.pz(z - nz * w)]);
  }
  return L.poly(up.concat(dn.reverse()), { fill: "rgba(208,38,58,0.34)", c: C.beam, w: 1.1 });
}

function ground(P) {
  let g = L.line(P.px(-215), P.pz(HW), P.px(215), P.pz(HW), { c: C.ink, w: 1.8 });
  for (let x = -210; x <= 215; x += 14) g += L.line(P.px(x), P.pz(HW) + 1, P.px(x - 10), P.pz(HW) + 11, { c: C.faint, w: 0.9 });
  return g;
}

function fiberColl(P, xLens) {
  // 光纤 + SMA 接头 + 准直镜筒；镜筒右端是准直镜
  const y = P.pz(0), x1 = P.px(xLens - 34);
  let g = `<path d="M ${P.gx - PW / 2 + 22} ${y + 46} C ${P.gx - PW / 2 + 40} ${y + 8}, ${x1 - 40} ${y}, ${x1 - 13} ${y}" fill="none" stroke="#E0A530" stroke-width="4"/>`;
  g += L.rect(x1 - 14, y - 6, 14, 12, { fill: C.metalDark });
  g += L.rect(x1, y - 11, P.px(xLens) - x1, 22, { fill: "#EEF1F4", c: C.metalDark, w: 1.3 });
  g += L.lensShape(P.px(xLens) - 3, y, 19, 6, "plano", 0);
  return g;
}

function galvo(P, phi) {
  const dox = Math.sin(phi), doz = Math.cos(phi);
  let nx = dox - 1, nz = doz; const n = Math.hypot(nx, nz); nx /= n; nz /= n;
  const tx = -nz, tz = nx, h = 19;                  // 镜片半长画成 19 mm（放大画，便于看清）
  let g = L.circle(P.px(0), P.pz(0), 15, { fill: "#3B4048" });
  g += L.poly([[P.px(-tx * h + nx * 1.5), P.pz(-tz * h + nz * 1.5)], [P.px(tx * h + nx * 1.5), P.pz(tz * h + nz * 1.5)],
               [P.px(tx * h - nx * 3), P.pz(tz * h - nz * 3)], [P.px(-tx * h - nx * 3), P.pz(-tz * h - nz * 3)]],
              { fill: "#F1F4F7", c: "#333", w: 1.4 });
  g += L.circle(P.px(0), P.pz(0), 2.8, { fill: "#333" });
  return g;
}

function lbl(P, x1, z1, tx, ty, s, anchor = "middle") {
  // 标注：从部件 (x1,z1)[mm] 引线到文字 (tx,ty)[px]
  const X1 = P.px(x1), Y1 = P.pz(z1);
  return L.line(X1, Y1, tx, ty + 6, { c: "#888", w: 1 }) + L.circle(X1, Y1, 2, { fill: "#888" }) +
    L.text(tx, ty, s, { size: LB, c: C.ink, anchor });
}

function spotRow(P, d, desc) {
  const cx = P.gx - 170, cy = 640, k = 3.0;          // k：px/mm，三个面板同一比例
  let g = L.circle(cx, cy, 26, { fill: "#F6F7F9", c: "#D5D9DE", w: 1 });
  g += L.circle(cx, cy, Math.max(1.5, d * k / 2), { fill: "rgba(208,38,58,0.75)", c: C.beam, w: 1 });
  g += L.text(cx + 44, cy - 4, `光斑 ${d.toFixed(1)} mm`, { size: 28, c: C.beam, weight: 500 });
  g += L.text(cx + 44, cy + 28, desc, { size: 20, c: C.ink });
  return g;
}

module.exports = {
  name: "光路_三种对比", width: W, height: H, fps: 20, frames: 96, offset: 14, scale: 1.25, colors: 160,
  frame(i) {
    const phi = PHI_MAX * Math.sin((2 * Math.PI * i) / 96);
    const dx = Math.sin(phi), dz = Math.cos(phi);
    let g = "";
    // 分隔线、标题
    for (const x of [PW, 2 * PW]) g += L.line(x, 28, x, H - 18, { c: "#DDDDDD", w: 1 });
    const titles = ["平行光", "后聚焦", "前聚焦（动态聚焦）"];
    titles.forEach((t, k) => { g += L.text(k * PW + PW / 2, 46, t, { size: T, weight: 500, anchor: "middle" }); });

    // ---------------- 平行光 ----------------
    let P = panel(0);
    g += ground(P) + fiberColl(P, -A_IN);
    g += band(P, -A_IN, 0, 1, 0, A_IN, (s) => L.qW(L.qProp(qColl, s)));
    let len = HW / dz;
    g += band(P, 0, 0, dx, dz, len, (s) => L.qW(L.qProp(qColl, A_IN + s)));
    g += galvo(P, phi);
    g += lbl(P, -A_IN - 12, -10, P.px(-A_IN) - 30, GY - 46, "准直镜") + lbl(P, -14, -12, P.px(10), GY - 46, "振镜", "start");
    g += L.circle(P.px(HW * Math.tan(phi)), P.pz(HW), 3.5, { fill: C.beam });
    // 650 mm 尺寸线（三个面板几何相同，只在这里标一次）
    const xd = P.px(188);
    g += L.line(P.px(22), P.pz(0), xd + 8, P.pz(0), { c: "#BBB", w: 0.9, dash: "4 3" });
    g += L.dim(xd, P.pz(0), xd, P.pz(HW), "", { c: C.ink });
    g += L.text(xd + 8, P.pz(HW / 2) + 8, "650 mm", { size: LB });
    g += spotRow(P, 2 * L.qW(L.qProp(qColl, A_IN + HW)), "不随高度变化");

    // ---------------- 后聚焦 ----------------
    P = panel(1);
    g += ground(P) + fiberColl(P, -A_IN);
    g += band(P, -A_IN, 0, 1, 0, A_IN, (s) => L.qW(L.qProp(qColl, s)));
    const zl = 46, zl2 = 84;
    g += band(P, 0, 0, dx, dz, zl / dz, (s) => L.qW(L.qProp(qColl, A_IN + s)));
    const xHit = F_THETA * phi;                       // F-θ：x = f·φ
    const xe = zl2 * Math.tan(phi);
    const ex = xHit - xe, ez = HW - zl2; len = Math.hypot(ex, ez);
    const w0 = OPT["后聚焦"]["焦点光斑_mm"] / 2, zr = OPT["后聚焦"]["瑞利长度_mm"];
    g += band(P, xe, zl2, ex / len, ez / len, len, (s) => w0 * Math.sqrt(1 + ((s - len) / zr) ** 2));
    g += L.rect(P.px(-62), P.pz(zl - 6), S * 124, S * (zl2 - zl + 12), { fill: "rgba(60,64,70,0.10)", c: "#555", w: 1.4 });
    g += L.lensShape(P.px(0), P.pz(zl + 9), S * 112, S * 11, "convex", Math.PI / 2);
    g += L.lensShape(P.px(0), P.pz(zl2 - 9), S * 116, S * 13, "convex", Math.PI / 2);
    g += galvo(P, phi);
    g += lbl(P, -A_IN - 12, -10, P.px(-A_IN) - 30, GY - 46, "准直镜") + lbl(P, -14, -12, P.px(10), GY - 46, "振镜", "start");
    g += lbl(P, 62, (zl + zl2) / 2, P.px(96), P.pz((zl + zl2) / 2) + 2, "F-θ 场镜", "start");
    g += L.circle(P.px(xHit), P.pz(HW), 3.5, { fill: C.beam });
    g += spotRow(P, 2 * w0, "焦点始终在地面上");

    // ---------------- 前聚焦（动态聚焦） ----------------
    P = panel(2);
    g += ground(P);
    const Lf = OBJ_TO_GALVO + HW / dz;               // 物镜到地面落点的光程
    const gap = B.gapOf(Lf), gap0 = B.gapOf(OBJ_TO_GALVO + HW);
    const zML = Z0 + B.zFront(gap);                   // 动镜前表面（相对振镜）
    const zC = Z0 - B.D0;                             // 准直镜出口
    g += fiberColl(P, zC);
    g += band(P, zC, 0, 1, 0, -zC, (s) => B.radiusAt(gap, zC + s - Z0));
    g += band(P, 0, 0, dx, dz, HW / dz, (s) => B.radiusAt(gap, B.OBJ_LEN + OBJ_TO_GALVO + s));
    // 动镜（双凹）与物镜（两片），按真实口径画
    const toPts = (pts) => pts.map(([z, y]) => [P.px(z + Z0), P.pz(-y)]);
    g += L.poly(toPts(B.lensOutline(B.zFront(gap), -18.71, B.zFront(gap) + 2, 18.71, 6.35)), { fill: C.glass, c: C.glassLine, w: 1.3 });
    g += L.poly(toPts(B.lensOutline(0, Infinity, 7.84, -69.01, 25.4)), { fill: C.glass, c: C.glassLine, w: 1.3 });
    g += L.poly(toPts(B.lensOutline(14.722, 182.99, 21.262, -182.99, 25.4)), { fill: C.glass, c: C.glassLine, w: 1.3 });
    // 焦点轨迹：动镜不动时为圆弧（半径 650 mm），动镜跟随后落在地面
    const a = PHI_MAX * 1.1, arc = [];
    for (let k = 0; k <= 60; k++) { const t = -a + (2 * a * k) / 60; arc.push([P.px(HW * Math.sin(t)), P.pz(HW * Math.cos(t))]); }
    g += L.pline(arc, { c: C.glassLine, w: 1.6, dash: "7 5" });
    g += galvo(P, phi);
    g += lbl(P, Z0 - 30, -8, P.px(Z0 - 30) - 10, GY - 46, "动态聚焦镜组");
    g += lbl(P, 14, -12, P.px(26), GY - 46, "振镜", "start");
    // 镜组局部放大（3 倍）：准直镜 → 动镜 → 物镜
    {
      const K = S * 2.5, ix0 = P.gx - PW / 2 - 52 + 12, iy0 = 232, iw = 222, ih = 186;   // 右边界离光束摆动范围留余量
      const za = zC - 6, zb = Z0 + B.OBJ_LEN + 4;           // 放大范围（相对振镜，mm）
      const qx = (z) => ix0 + 8 + (z - za) * K, qy = (y) => iy0 + ih / 2 - y * K;
      g += L.rect(ix0, iy0, iw, ih, { fill: "#FFFFFF", c: "#777", w: 1.2 });
      g += L.line(P.px(za), P.pz(0) + 12, ix0, iy0, { c: "#AAA", w: 1, dash: "4 3" });
      g += L.line(P.px(zb), P.pz(0) + 12, ix0 + iw, iy0, { c: "#AAA", w: 1, dash: "4 3" });
      g += L.line(qx(za), qy(0), qx(zb), qy(0), { c: "#BBB", w: 0.8, dash: "8 3 2 3" });
      const up = [], dn = [];
      for (let k = 0; k <= 90; k++) {
        const z = zC + (zb - zC) * k / 90, w = B.radiusAt(gap, z - Z0);
        up.push([qx(z), qy(w)]); dn.push([qx(z), qy(-w)]);
      }
      g += L.poly(up.concat(dn.reverse()), { fill: "rgba(208,38,58,0.34)", c: C.beam, w: 1 });
      const toI = (pts) => pts.map(([z, y]) => [qx(z + Z0), qy(y)]);
      g += L.lensShape(qx(zC) - 2, qy(0), 9 * K, 3 * K, "plano", 0);
      g += L.poly(toI(B.lensOutline(B.zFront(gap), -18.71, B.zFront(gap) + 2, 18.71, 6.35)), { fill: C.glass, c: C.glassLine, w: 1.3 });
      g += L.poly(toI(B.lensOutline(0, Infinity, 7.84, -69.01, 25.4)), { fill: C.glass, c: C.glassLine, w: 1.3 });
      g += L.poly(toI(B.lensOutline(14.722, 182.99, 21.262, -182.99, 25.4)), { fill: C.glass, c: C.glassLine, w: 1.3 });
      g += L.text(ix0 + 8, iy0 + ih - 12, "准直镜", { size: 20 });
      g += L.text(qx(zML + 1), iy0 + 26, "动镜", { size: 20, anchor: "middle" });
      g += L.arrow(qx(zML + 1) - 22, iy0 + 40, qx(zML + 1) + 22, iy0 + 40, { c: C.ink, w: 1.2, head: 7 });
      g += L.arrow(qx(zML + 1) + 22, iy0 + 40, qx(zML + 1) - 22, iy0 + 40, { c: C.ink, w: 1.2, head: 7 });
      g += L.text(qx(Z0 + 10.6), iy0 + ih - 12, "物镜", { size: 20, anchor: "middle" });
      g += L.text(ix0 + iw - 6, iy0 + 22, "放大 2.5 倍", { size: 16, c: C.mid, anchor: "end" });
      const dg = gap - gap0;
      g += L.text(qx(zML + 1) + 6, iy0 + 66, `${dg < 0 ? "−" : "+"}${Math.abs(dg).toFixed(2)} mm`, { size: 19, c: C.beam, anchor: "middle" });
    }
    g += L.line(P.gx - PW / 2 - 40, 452, P.gx - PW / 2 - 8, 452, { c: C.glassLine, w: 1.6, dash: "7 5" });
    g += L.text(P.gx - PW / 2 - 2, 459, "动镜不动时焦点轨迹", { size: 19, c: C.glassLine });
    g += L.circle(P.px(HW * Math.tan(phi)), P.pz(HW), 3.5, { fill: C.beam });
    g += spotRow(P, B.dAt(gap, Lf), "动镜跟随，焦点落在地面上");

    return L.svg(W, H, g);
  },
};
