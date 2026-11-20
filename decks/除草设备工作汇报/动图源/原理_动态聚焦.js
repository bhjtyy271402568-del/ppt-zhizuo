// 动态聚焦（动镜 + 物镜）：目标距离 1 → 10 → 1 m，动镜跟着前后移动
// 上：调焦镜组（真实尺寸 × 4.2 px/mm），光束包络按 M² 高斯光束计算
// 下：物镜后光斑直径随距离的变化；红 = 当前设定，灰虚线 = 固定对焦 3 m
const L = require("./lib");
const { C, OPT } = L;
const DF = OPT["动态聚焦"];

const W = 1400, H = 820;
const F1 = DF["动镜焦距_mm"], F2 = DF["物镜焦距_mm"];
const FC = DF["配套准直镜焦距_mm"], C2O = DF["准直镜到物镜_mm"], DINF = DF["无焦间距_mm"];
const PW = OPT["光源"]["功率_W"];

// ---------- 光学链（与 光学计算.py 相同） ----------
const qC0 = L.qLens(L.qProp(L.qWaist(L.CORE_R), FC), FC);          // 准直镜出口
function chain(gap) {                                               // 返回物镜出口的 q
  let q = L.qProp(qC0, C2O - gap);
  q = L.qLens(q, F1);
  q = L.qProp(q, gap);
  return L.qLens(q, F2);
}
const dAt = (gap, zmm) => 2 * L.qW(L.qProp(chain(gap), zmm));
function bestGap(Lmm) {
  let a = DINF - 2, b = DINF + 14; const g = (Math.sqrt(5) - 1) / 2;
  for (let k = 0; k < 70; k++) {
    const c = b - g * (b - a), d = a + g * (b - a);
    if (dAt(c, Lmm) < dAt(d, Lmm)) b = d; else a = c;
  }
  return (a + b) / 2;
}
const GAP_FIX = bestGap(3000);
const density = (dmm) => PW / (Math.PI * (dmm / 20) ** 2);         // W/cm²

// ---------- 上：镜组 ----------
const S = 4.2, MX = 150, MY = 168;                                  // 光纤端面在 (MX, MY)
const X = (mm) => MX + S * mm;
const X_OBJ = C2O + FC;                                             // 物镜位置（从光纤端面量）

function beamPoly(gap) {
  const up = [], dn = [];
  const xs = [];
  for (let x = 0; x <= X_OBJ + 75; x += 0.5) xs.push(x);
  const xML = X_OBJ - gap;
  for (const x of xs) {
    let w;
    if (x < FC) w = L.CORE_R + x * L.NA;                            // 光纤出射光锥（几何）
    else if (x < xML) w = L.qW(L.qProp(qC0, x - FC));
    else if (x < X_OBJ) w = L.qW(L.qProp(L.qLens(L.qProp(qC0, xML - FC), F1), x - xML));
    else w = L.qW(L.qProp(chain(gap), x - X_OBJ));
    up.push([X(x), MY - S * w]); dn.push([X(x), MY + S * w]);
  }
  return L.poly(up.concat(dn.reverse()), { fill: C.beamFill, c: C.beam, w: 0.8 });
}

function module_(gap, delta) {
  const xML = X_OBJ - gap;
  let g = L.line(40, MY, X(X_OBJ + 80), MY, { c: C.faint, w: 0.8, dash: "10 4 2 4" });
  g += beamPoly(gap);
  // 光纤与准直镜
  g += L.rect(40, MY - 7, MX - 40, 14, { fill: "#EEF1F4", c: C.faint });
  g += L.lensShape(X(FC), MY, S * 9, S * 2.4, "convex", 0);
  g += L.label(X(FC), MY - S * 4.8, X(FC) - 20, MY - 74, `准直镜 f ${FC.toFixed(1)}`, { anchor: "end" });
  g += L.label(90, MY - 7, 70, MY - 40, "光纤", { anchor: "end" });
  // 动镜（双凹）+ 镜座 + 滑台 + 丝杆 + 电机
  const railY = MY + 78;
  g += L.rect(X(FC + 6), railY + 10, X(X_OBJ - 22) - X(FC + 6), 7, { fill: "#E7EAEE", c: C.faint });     // 导轨
  for (let x = X(FC + 8); x < X(X_OBJ - 24); x += 6) g += L.line(x, railY + 1, x + 3, railY + 8, { c: C.faint, w: 0.8 }); // 丝杆螺纹
  g += L.line(X(FC + 6), railY + 4.5, X(X_OBJ - 22), railY + 4.5, { c: C.faint, w: 1 });
  g += L.rect(X(FC + 6) - 64, railY - 14, 58, 40, { fill: "#E3E7EC", c: C.metalDark, w: 1.2 });            // 电机
  g += L.text(X(FC + 6) - 35, railY + 11, "步进电机", { size: 12, c: C.mid, anchor: "middle" });
  g += L.rect(X(xML) - 14, railY - 6, 28, 24, { fill: "#D5DBE2", c: C.metalDark, w: 1.2 });                // 滑块
  g += L.rect(X(xML) - 5, MY - S * 7.4, 10, railY - 6 - (MY - S * 7.4), { fill: "#EEF1F4", c: C.metalDark, w: 1 }); // 镜座
  g += L.lensShape(X(xML), MY, S * 12.7, S * 3, "concave", 0);
  g += L.text(X(xML), MY - S * 7.4 - 12, "动镜 f −20.5", { size: 14, c: C.ink, anchor: "middle", weight: 500 });
  // 物镜（两片，固定）
  g += L.lensShape(X(X_OBJ - 3.5), MY, S * 50.8, S * 6, "plano", Math.PI);
  g += L.lensShape(X(X_OBJ + 3.5), MY, S * 50.8, S * 7, "convex", 0);
  g += L.text(X(X_OBJ), MY - S * 25.4 - 14, "物镜 f 90（固定）", { size: 14, c: C.ink, anchor: "middle", weight: 500 });
  // 后退量尺寸线：以 10 m 对焦位置为零点
  const x10 = X_OBJ - bestGap(10000);
  g += L.line(X(x10), railY + 24, X(x10), railY + 46, { c: C.faint, w: 0.8 });
  g += L.line(X(xML), railY + 18, X(xML), railY + 46, { c: C.faint, w: 0.8 });
  if (X(x10) - X(xML) > 6) g += L.dim(X(xML), railY + 40, X(x10), railY + 40, "", { c: C.mid });
  g += L.text(X(x10) + 8, railY + 45, "10 m 位置", { size: 12, c: C.faint });
  g += L.text(X(X_OBJ + 80) + 8, MY + 5, "→ 振镜 → 目标", { size: 13, c: C.mid });
  return g;
}

// ---------- 右上：目标上的光斑（同一比例） ----------
function spots(dDyn, dFix) {
  const k = 2.1, y = 186;
  let g = L.text(1189, 52, "目标上的光斑（同一比例）", { size: 14, c: C.mid, anchor: "middle" });
  g += L.circle(1110, y, (dDyn * k) / 2, { fill: "rgba(208,38,58,0.6)", c: C.beam });
  g += L.circle(1268, y, (dFix * k) / 2, { fill: "rgba(120,130,142,0.35)", c: C.metal });
  g += L.text(1110, 300, `动态聚焦 ${dDyn.toFixed(1)} mm`, { size: 13, c: C.beam, anchor: "middle" });
  g += L.text(1268, 300, `动镜不动 ${dFix.toFixed(1)} mm`, { size: 13, c: C.mid, anchor: "middle" });
  g += L.line(1168, 322, 1168 + 20 * k, 322, { c: C.mid, w: 1.4 });
  g += L.text(1168 + 10 * k, 338, "20 mm", { size: 11, c: C.mid, anchor: "middle" });
  return g;
}

// ---------- 下：光斑—距离曲线 ----------
const GX0 = 150, GX1 = 1330, GY0 = 760, GY1 = 440, ZMAX = 10, DMAX = 60;
const gx = (m) => GX0 + (GX1 - GX0) * m / ZMAX, gy = (d) => GY0 - (GY0 - GY1) * d / DMAX;

const LOCUS = [];
for (let m = 0.6; m <= 10.001; m += 0.1) LOCUS.push([gx(m), gy(dAt(bestGap(m * 1000), m * 1000))]);

function chart(gap, Lm) {
  let g = "";
  for (let m = 0; m <= ZMAX; m++) {
    g += L.line(gx(m), GY0, gx(m), GY0 + 5, { c: C.mid, w: 1 });
    g += L.text(gx(m), GY0 + 22, `${m}`, { size: 13, c: C.mid, anchor: "middle" });
  }
  for (let d = 0; d <= DMAX; d += 20) {
    g += L.line(GX0, gy(d), GX1, gy(d), { c: d ? "#EEF0F3" : C.mid, w: 1 });
    g += L.text(GX0 - 10, gy(d) + 5, `${d}`, { size: 13, c: C.mid, anchor: "end" });
  }
  g += L.text(GX1, GY0 + 46, "离物镜的距离 / m", { size: 14, c: C.mid, anchor: "end" });
  g += L.text(GX0 - 10, GY1 - 18, "光斑直径 / mm", { size: 14, c: C.mid, anchor: "start" });
  const cur = [], fix = [];
  // 超出纵轴范围就截断，不压成平线（压平会让人误以为光斑“饱和”）
  for (let m = 0.2; m <= ZMAX + 0.001; m += 0.05) {
    const a = dAt(gap, m * 1000), b = dAt(GAP_FIX, m * 1000);
    if (a <= DMAX) cur.push([gx(m), gy(a)]);
    if (b <= DMAX) fix.push([gx(m), gy(b)]);
  }
  g += L.pline(LOCUS, { c: C.beam, w: 1, dash: "2 4", op: 0.7 });
  g += L.pline(fix, { c: C.metal, w: 2, dash: "7 5" });
  g += L.pline(cur, { c: C.beam, w: 2.4 });
  // 目标
  const dd = dAt(gap, Lm * 1000), dfx = dAt(GAP_FIX, Lm * 1000);
  g += L.line(gx(Lm), GY1 - 6, gx(Lm), GY0, { c: C.ink, w: 1, dash: "3 3" });
  g += L.rect(gx(Lm) - 3, GY1 - 30, 6, 24, { fill: C.ink });
  const right = gx(Lm) > GX1 - 120;
  g += L.text(gx(Lm) + (right ? -9 : 9), GY1 - 12, `目标 ${Lm.toFixed(1)} m`, { size: 14, c: C.ink, weight: 500, anchor: right ? "end" : "start" });
  g += L.circle(gx(Lm), gy(dfx), 4.5, { fill: C.bg, c: C.metal, w: 2 });
  g += L.circle(gx(Lm), gy(dd), 5, { fill: C.beam });
  // 图例
  g += L.line(820, 470, 860, 470, { c: C.beam, w: 2.4 }) + L.text(868, 475, "当前动镜位置下的光束", { size: 13, c: C.mid });
  g += L.line(820, 494, 860, 494, { c: C.metal, w: 2, dash: "7 5" }) + L.text(868, 499, "动镜不动（对焦 3 m）", { size: 13, c: C.mid });
  g += L.line(820, 518, 860, 518, { c: C.beam, w: 1, dash: "2 4" }) + L.text(868, 523, "各距离对焦后能达到的最小光斑", { size: 13, c: C.mid });
  return g;
}

// ---------- 时间线：1 m 停 → 对数扫到 10 m → 停 → 回到 1 m ----------
const FR = 132;
function Lof(i) {
  const segs = [12, 54, 12, 54];
  let t = i;
  if (t < segs[0]) return 1;
  t -= segs[0];
  if (t < segs[1]) return Math.pow(10, L.ease(t / segs[1]));
  t -= segs[1];
  if (t < segs[2]) return 10;
  t -= segs[2];
  return Math.pow(10, 1 - L.ease(t / segs[3]));
}

module.exports = {
  name: "原理_动态聚焦", width: W, height: H, fps: 22, frames: FR, still: 6, colors: 160,
  frame(i) {
    const Lm = Lof(i), gap = bestGap(Lm * 1000);
    const delta = gap - bestGap(10000);
    const dd = dAt(gap, Lm * 1000), dfx = dAt(GAP_FIX, Lm * 1000);
    let g = module_(gap, delta) + spots(dd, dfx) + chart(gap, Lm);
    // 读数
    g += L.text(150, 360, `目标距离 ${Lm.toFixed(1)} m　·　动镜后退 ${delta.toFixed(2)} mm（丝杆导程 1 mm，电机转 ${delta.toFixed(1)} 圈）`, { size: 16, c: C.ink });
    g += L.text(150, 388, `光斑 ${dd.toFixed(1)} mm，平均功率密度 ${density(dd).toFixed(0)} W/cm²　｜　动镜不动时 ${dfx.toFixed(1)} mm，${density(dfx).toFixed(0)} W/cm²`, { size: 15, c: C.mid });
    return L.svg(W, H, g);
  },
};
