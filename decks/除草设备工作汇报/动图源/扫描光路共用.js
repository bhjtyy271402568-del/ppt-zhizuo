// 三种扫描光路的侧视动图：平行光 / 后聚焦（F-θ 场镜）/ 前聚焦
// 同一套几何：振镜转轴在原点，光从左边水平射入，地面在振镜下方 650 mm。
// 坐标：x 向右、z 向下（mm）；画图 px = 原点 + s·mm
const L = require("./lib");
const { C, OPT } = L;

const W = 860, H = 900, S = 1.05;           // 画布与比例尺（px/mm）
const OX = 470, OY = 118;                   // 振镜转轴的像素位置
const HW = OPT["假设"]["振镜到地面_mm"];     // 650
const A_IN = OPT["假设"]["准直镜到振镜_mm"]; // 100
const D_BEAM = OPT["假设"]["进振镜光束直径_mm"];
const F_THETA = OPT["后聚焦"]["场镜焦距_mm"];
const PHI_MAX = OPT["后聚焦"]["单轴光学扫描角_deg"] * Math.PI / 180;  // 光学扫描角
const px = (x) => OX + S * x, pz = (z) => OY + S * z;

// 准直后光束：光纤端面（束腰 = 芯半径）放在准直镜前焦面
const fColl = (D_BEAM / 2) / L.NA;
const qColl = L.qLens(L.qProp(L.qWaist(L.CORE_R), fColl), fColl);

// 一条光束段：沿方向 (dx,dz) 从起点走 len，半宽由 wOf(s) 给出（s 为该段内的路程）
function band(x0, z0, dx, dz, len, wOf, n = 40) {
  const nx = -dz, nz = dx, up = [], dn = [];
  for (let i = 0; i <= n; i++) {
    const s = (len * i) / n, w = wOf(s);
    const x = x0 + dx * s, z = z0 + dz * s;
    up.push([px(x + nx * w), pz(z + nz * w)]);
    dn.push([px(x - nx * w), pz(z - nz * w)]);
  }
  return L.poly(up.concat(dn.reverse()), { fill: C.beamFill, c: C.beam, w: 0.8 }) +
    L.line(px(x0), pz(z0), px(x0 + dx * len), pz(z0 + dz * len), { c: C.beam, w: 0.7, dash: "5 4", op: 0.75 });
}

function ground() {
  let g = L.line(px(-300), pz(HW), px(300), pz(HW), { c: C.ink, w: 1.6 });
  for (let x = -296; x <= 300; x += 12) g += L.line(px(x), pz(HW) + 1, px(x - 9), pz(HW) + 10, { c: C.faint, w: 0.8 });
  return g + L.text(px(-300), pz(HW) + 34, "作业面（地面）", { size: 14, c: C.mid });
}

function fiberAndCollimator(xLens) {
  // 光纤接头 + 准直镜筒（简化外形），镜筒右端就是准直镜
  const x1 = px(xLens - 46), y = pz(0);
  let g = `<path d="M 30 ${y + 70} C 90 ${y + 70}, 120 ${y}, ${x1 - 18} ${y}" fill="none" stroke="${C.metal}" stroke-width="3"/>`;
  g += L.rect(x1 - 20, y - 6, 20, 12, { fill: C.metalDark });                       // SMA 接头
  g += L.rect(x1, y - 12, px(xLens) - x1, 24, { fill: "#EEF1F4", c: C.metalDark, w: 1.2 }); // 镜筒
  g += L.lensShape(px(xLens) - 4, y, 20, 6, "plano", 0);
  return g;
}

function mirror(phi) {
  // 出射方向 (sinφ, cosφ)，入射 (1,0)；镜面法线 ∝ 出射 − 入射
  const dox = Math.sin(phi), doz = Math.cos(phi);
  let nx = dox - 1, nz = doz; const n = Math.hypot(nx, nz); nx /= n; nz /= n;
  const tx = -nz, tz = nx, h = 15;                                // 镜面方向，半长 15 mm
  let g = L.line(px(-tx * h), pz(-tz * h), px(tx * h), pz(tz * h), { c: C.ink, w: 4, cap: "round" });
  g += L.circle(px(0), pz(0), 3.2, { fill: C.bg, c: C.ink, w: 1.2 });
  // 转动方向提示（固定的小圆弧箭头）
  g += `<path d="M ${px(-22)} ${pz(-24)} A 32 32 0 0 1 ${px(18)} ${pz(-28)}" fill="none" stroke="${C.faint}" stroke-width="1"/>`;
  g += L.arrow(px(14), pz(-29.5), px(19), pz(-27.5), { c: C.faint, w: 1, head: 6 });
  return g;
}

function spotInset(dmm, sub) {
  // 光斑截面（统一放大比例，便于三张图对比）
  const cx0 = 735, cy0 = 470, k = 4.2;                            // px/mm
  let g = L.text(cx0, cy0 - 92, "地面光斑", { size: 14, c: C.mid, anchor: "middle" });
  g += L.circle(cx0, cy0, 70, { c: C.rule, w: 1, fill: "#FAFBFC" });
  g += L.circle(cx0, cy0, (dmm * k) / 2, { fill: "rgba(208,38,58,0.55)", c: C.beam, w: 1 });
  g += L.line(cx0 - 21, cy0 + 84, cx0 + 21, cy0 + 84, { c: C.mid, w: 1.4 });
  g += L.text(cx0, cy0 + 100, "10 mm", { size: 12, c: C.mid, anchor: "middle" });
  g += L.text(cx0, cy0 + 130, `${dmm.toFixed(1)} mm`, { size: 22, weight: 500, c: C.beam, anchor: "middle" });
  if (sub) g += L.text(cx0, cy0 + 152, sub, { size: 13, c: C.mid, anchor: "middle" });
  return g;
}

function hud(phi, xHit) {
  const t = phi * 90 / Math.PI;                                   // 镜片机械转角 = 光学角 / 2
  const sg = (v, n = 1) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(n);
  return L.text(612, 40, `振镜转角 θ = ${sg(t)}°`, { size: 15, c: C.ink }) +
    L.text(612, 63, `光束偏转 2θ = ${sg(2 * t)}°`, { size: 15, c: C.ink }) +
    L.text(612, 86, `落点 x = ${sg(xHit, 0)} mm`, { size: 15, c: C.ink });
}

module.exports = function (mode) {
  const frames = 80, fps = 20;
  return {
    name: { parallel: "光路_平行光", post: "光路_后聚焦", pre: "光路_前聚焦" }[mode],
    width: W, height: H, fps, frames, still: 14,
    frame(i) {
      const phi = PHI_MAX * Math.sin((2 * Math.PI * i) / frames);
      const dx = Math.sin(phi), dz = Math.cos(phi);
      let g = ground(), xHit = 0, spot = 0, sub = "";

      if (mode === "parallel") {
        g += fiberAndCollimator(-A_IN);
        g += band(-A_IN, 0, 1, 0, A_IN, (s) => L.qW(L.qProp(qColl, s)));
        const len = HW / dz;
        g += band(0, 0, dx, dz, len, (s) => L.qW(L.qProp(qColl, A_IN + s)));
        xHit = HW * Math.tan(phi);
        spot = 2 * L.qW(L.qProp(qColl, A_IN + len));
        sub = "准直光，几乎不随高度变化";
        g += L.label(px(-A_IN) - 10, pz(0) + 12, px(-A_IN) - 40, pz(0) + 70, "单镜片准直", { anchor: "end" });
      }

      if (mode === "post") {
        g += fiberAndCollimator(-A_IN);
        g += band(-A_IN, 0, 1, 0, A_IN, (s) => L.qW(L.qProp(qColl, s)));
        const zl = 52, zl2 = 76;                                   // 场镜上下表面
        g += band(0, 0, dx, dz, zl / dz, (s) => L.qW(L.qProp(qColl, A_IN + s)));
        // F-θ：落点 x = f·θ，焦点始终在平面上；出射段按焦点处束腰反推包络
        xHit = F_THETA * phi;
        const xe = zl2 * Math.tan(phi);
        const ex = xHit - xe, ez = HW - zl2, len = Math.hypot(ex, ez);
        const w0 = OPT["后聚焦"]["焦点光斑_mm"] / 2, zr = OPT["后聚焦"]["瑞利长度_mm"];
        g += band(xe, zl2, ex / len, ez / len, len, (s) => w0 * Math.sqrt(1 + ((s - len) / zr) ** 2));
        // 场镜（两片），画在光束之上
        g += L.lensShape(px(0), pz(zl + 5), S * 128, S * 10, "convex", Math.PI / 2);
        g += L.lensShape(px(0), pz(zl2 - 6), S * 138, S * 12, "convex", Math.PI / 2);
        g += L.label(px(64), pz(zl + 8), px(130), pz(zl + 8), `F-θ 场镜  f = ${F_THETA} mm`);
        spot = 2 * w0;
        sub = "x = f·θ，焦点始终落在平面上";
      }

      if (mode === "pre") {
        const xc = -A_IN - 70;
        g += fiberAndCollimator(xc);
        const qL = L.qLens(L.qProp(qColl, 70), OPT["前聚焦"]["聚焦镜焦距_mm"]);
        g += band(xc, 0, 1, 0, 70, (s) => L.qW(L.qProp(qColl, s)));
        g += band(-A_IN, 0, 1, 0, A_IN, (s) => L.qW(L.qProp(qL, s)));
        const len = HW / dz;
        g += band(0, 0, dx, dz, len, (s) => L.qW(L.qProp(qL, A_IN + s)));
        g += L.lensShape(px(-A_IN), pz(0), S * 22, S * 6, "convex", 0);
        g += L.label(px(-A_IN), pz(0) - 12, px(-A_IN) - 30, pz(0) - 52, "聚焦镜", { anchor: "end" });
        g += L.label(px(xc) - 10, pz(0) + 12, px(xc) - 30, pz(0) + 70, "准直镜", { anchor: "end" });
        // 焦点轨迹：以振镜为圆心、半径 650 mm 的圆弧
        const R = OPT["前聚焦"]["工作距离_mm"], a = PHI_MAX * 1.12;
        const arcPts = [];
        for (let k = 0; k <= 60; k++) { const t = -a + (2 * a * k) / 60; arcPts.push([px(R * Math.sin(t)), pz(R * Math.cos(t))]); }
        g += L.pline(arcPts, { c: C.glassLine, w: 1.2, dash: "6 4" });
        g += L.circle(px(R * dx), pz(R * dz), 3.2, { fill: C.glassLine });
        g += L.text(px(-185), pz(R) - 52, "焦点轨迹：半径 650 mm 的圆弧", { size: 14, c: C.glassLine });
        // 边缘离焦标注（固定在 +φmax 处）
        const xe = R * Math.sin(PHI_MAX), ze = R * Math.cos(PHI_MAX);
        g += L.line(px(xe) + 8, pz(ze), px(xe) + 40, pz(ze), { c: C.faint, w: 0.8 });
        g += L.line(px(HW * Math.tan(PHI_MAX)) + 6, pz(HW), px(xe) + 40, pz(HW), { c: C.faint, w: 0.8 });
        g += L.dim(px(xe) + 34, pz(ze), px(xe) + 34, pz(HW), "", { c: C.mid });
        g += L.text(px(xe) + 44, (pz(ze) + pz(HW)) / 2 + 5, `离焦 ${OPT["前聚焦"]["边缘离焦_mm"].toFixed(0)} mm`, { size: 13, c: C.mid });
        xHit = HW * Math.tan(phi);
        spot = 2 * L.qW(L.qProp(qL, A_IN + len));
        sub = `焦深 ±${OPT["前聚焦"]["焦深_±mm"].toFixed(0)} mm，边缘只增大 ${OPT["前聚焦"]["边缘光斑增大_%"].toFixed(1)}%`;
      }

      g += mirror(phi);
      g += L.label(px(-8), pz(-12), px(-60), pz(-62), "振镜", { anchor: "end" });
      if (mode !== "pre") g += L.label(px(-A_IN - 46) - 18, pz(0) - 8, px(-A_IN - 46) - 40, pz(0) - 52, "光纤", { anchor: "end" });
      // 落点
      g += L.circle(px(xHit), pz(HW), 3, { fill: C.beam });
      g += spotInset(spot, sub);
      g += hud(phi, xHit);
      return L.svg(W, H, g);
    },
  };
};
