// 动态聚焦（B 方案真实镜组，915 nm）：目标距离 1 → 10 → 1 m，动镜跟着移动
// 上：BICV-FS04 + LA4904 + LB4842 按真实面形画，11 条光线逐面折射追迹（Snell 定律）
// 下：915 nm 多模光束（M² ≈ 58）光斑直径随距离变化，按厚透镜 ABCD 矩阵 + q 参数计算
// 空气隙表来自 工具/动态聚焦追迹.json（与 Zemax 1064 nm 结果核对过）
const fs = require("fs");
const path = require("path");
const L = require("./lib");
const { C, OPT } = L;
const TR = JSON.parse(fs.readFileSync(path.join(__dirname, "../工具/动态聚焦追迹.json"), "utf8"));
const NG = TR["折射率"]["915nm"];
const PW = OPT["光源"]["功率_W"];

const W = 1600, H = 900;

// ---------- 空气隙：按距离插值 ----------
const GT = TR["空气隙表_915"];
function gapOf(Lmm) {
  if (Lmm <= GT[0]["距离_mm"]) return GT[0]["空气隙_915"];
  for (let k = 1; k < GT.length; k++) {
    const a = GT[k - 1], b = GT[k];
    if (Lmm <= b["距离_mm"]) {
      const u = (Lmm - a["距离_mm"]) / (b["距离_mm"] - a["距离_mm"]);
      return a["空气隙_915"] + u * (b["空气隙_915"] - a["空气隙_915"]);
    }
  }
  return GT[GT.length - 1]["空气隙_915"];
}
const GAP10 = gapOf(10000), GAP3 = gapOf(3000);

// ---------- 处方（光从左到右） ----------
function surfs(gap) {
  return [
    { R: -18.71, t: 2.0, n: NG, a: 6.35 },
    { R: 18.71, t: gap, n: 1, a: 6.35 },
    { R: Infinity, t: 7.84, n: NG, a: 25.4 },
    { R: -69.01, t: 6.8822842, n: 1, a: 25.4 },
    { R: 182.99, t: 6.54, n: NG, a: 25.4 },
    { R: -182.99, t: 0, n: 1, a: 25.4 },
  ];
}

// 精确光线追迹（子午面）：返回各面交点
function traceRay(y0, gap, z0) {
  let z = z0, y = y0, dz = 1, dy = 0, zc = zFront(gap), n1 = 1;
  const pts = [[z, y]];
  for (const S of surfs(gap)) {
    let s;
    if (!isFinite(S.R)) s = (zc - z) / dz;
    else {
      const cz = zc + S.R, ox = z - cz, b = ox * dz + y * dy, c = ox * ox + y * y - S.R * S.R;
      const d = Math.sqrt(b * b - c);
      s = S.R > 0 ? -b - d : -b + d;
    }
    z += s * dz; y += s * dy; pts.push([z, y]);
    let nz = 1, ny = 0;
    if (isFinite(S.R)) { nz = (z - (zc + S.R)) / S.R; ny = y / S.R; }
    const mu = n1 / S.n;
    let ci = -(nz * dz + ny * dy);
    if (ci < 0) { nz = -nz; ny = -ny; ci = -ci; }
    const ct = Math.sqrt(1 - mu * mu * (1 - ci * ci));
    dz = mu * dz + (mu * ci - ct) * nz; dy = mu * dy + (mu * ci - ct) * ny;
    n1 = S.n; zc += S.t;
  }
  return { pts, z, y, dz, dy };
}

// ---------- 高斯光束：厚透镜 ABCD ----------
const FC = 2.0 / OPT["光源"]["NA"];                            // 4 mm 输入光束的准直镜焦距
const qC0 = L.qLens(L.qProp(L.qWaist(L.CORE_R), FC), FC);
const D0 = 30 + GAP10;                                          // 准直镜出口到物镜第一面（固定）
function qOut(gap) {
  let q = L.qProp(qC0, D0 - gap - 2.0);                         // 到动镜前表面
  let n1 = 1;
  for (const S of surfs(gap)) {
    // 球面折射（约化形式）：q' = q / (C q + D)，C = (n1 − n2)/(R·n2)，D = n1/n2；介质内按 t 传播
    const Cm = isFinite(S.R) ? (n1 - S.n) / (S.R * S.n) : 0, Dm = n1 / S.n;
    const den = { re: Cm * q.re + Dm, im: Cm * q.im };
    const d2 = den.re * den.re + den.im * den.im;
    q = { re: (q.re * den.re + q.im * den.im) / d2, im: (q.im * den.re - q.re * den.im) / d2 };
    q = L.qProp(q, S.t);
    n1 = S.n;
  }
  return q;
}
const dAt = (gap, zmm) => 2 * L.qW(L.qProp(qOut(gap), zmm));
const dens = (dmm) => PW / (Math.PI * (dmm / 20) ** 2);

// ---------- 上：镜组 ----------
const S = 6.2, AY = 250;
function zFront(gap) { return -(gap + 2.0); }                   // 动镜前表面 z（物镜第一面在 z = 0）
const X = (z) => 230 + S * (z + 75), Y = (y) => AY - S * y;

function lensPath(z1, R1, z2, R2, a) {
  const pts = [];
  const sag = (R, y) => (isFinite(R) ? R - Math.sign(R) * Math.sqrt(R * R - y * y) : 0);
  for (let k = 0; k <= 30; k++) { const y = -a + (2 * a * k) / 30; pts.push([X(z1 + sag(R1, y)), Y(y)]); }
  for (let k = 30; k >= 0; k--) { const y = -a + (2 * a * k) / 30; pts.push([X(z2 + sag(R2, y)), Y(y)]); }
  return L.poly(pts, { fill: C.glass, c: C.glassLine, w: 1.4 });
}

function module_(gap, Lm) {
  let g = "";
  const zML = zFront(gap);
  g += L.line(60, AY, W - 40, AY, { c: C.faint, w: 0.9, dash: "12 5 3 5" });
  const N = 11;
  for (let k = 0; k < N; k++) {
    const y0 = -2 + (4 * k) / (N - 1);
    const r = traceRay(y0, gap, zML - 40);
    const pts = r.pts.map(([z, y]) => [X(z), Y(y)]);
    const zEnd = 150;
    pts.push([X(zEnd), Y(r.y + (zEnd - r.z) * r.dy / r.dz)]);
    g += L.pline(pts, { c: C.beam, w: 1.3, op: 0.9 });
  }
  g += lensPath(zML, -18.71, zML + 2.0, 18.71, 6.35);
  g += lensPath(0, Infinity, 7.84, -69.01, 25.4);
  g += lensPath(7.84 + 6.8822842, 182.99, 7.84 + 6.8822842 + 6.54, -182.99, 25.4);
  // 动镜滑座、丝杆、电机
  const railY = Y(-31);
  g += L.rect(X(zML) - 9, Y(-7.2), 18, railY - Y(-7.2) - 12, { fill: "#E9ECEF", c: C.metalDark, w: 1.2 });   // 镜座
  g += L.rect(X(zML) - 26, railY - 12, 52, 14, { fill: "#D3D8DE", c: C.metalDark, w: 1.2 });               // 滑块
  g += L.rect(X(-84), railY, X(-12) - X(-84), 10, { fill: "#DDE1E6", c: C.metalDark, w: 1 });
  for (let x = X(-83); x < X(-13); x += 7) g += L.line(x, railY + 1, x + 4, railY + 9, { c: C.faint, w: 0.8 });
  g += L.rect(X(-84) - 74, railY - 16, 70, 42, { fill: "#D9DDE2", c: C.metalDark, w: 1.2 });
  g += L.text(X(-84) - 39, railY + 11, "步进电机", { size: 16, c: C.ink, anchor: "middle" });
  g += L.text(X(zML + 1), Y(9.6), "动镜", { size: 20, c: C.ink, anchor: "middle", weight: 500 });
  g += L.text(X(zML + 1), Y(-2.5) + 2, "", {});
  g += L.text(X(zML + 1) + 18, Y(-9), "BICV-FS04", { size: 15, c: C.mid });
  g += L.text(X(10.6), Y(27.6) - 2, "物镜（固定）LA4904 + LB4842", { size: 20, c: C.ink, anchor: "middle", weight: 500 });
  // 动镜位置刻度尺（放大 5.5 倍）：动镜停在哪个刻度，就对焦到哪个距离
  const K = 5.5 * S, xs0 = 760, ys = railY + 52;
  const xOf = (p) => xs0 - K * p;                                  // p：相对 10 m 位置的后退量 mm
  g += L.line(xOf(8.4), ys, xOf(-0.3), ys, { c: C.ink, w: 1.2 });
  for (const Lt of [1, 1.5, 2, 3, 5, 10]) {
    const xt = xOf(gapOf(Lt * 1000) - GAP10);
    g += L.line(xt, ys - 7, xt, ys + 7, { c: C.ink, w: 1.2 });
    g += L.text(xt + (Lt === 10 ? 8 : 0), ys + 27, Lt === 10 ? "10 m" : `${Lt}`, { size: 15, c: C.ink, anchor: "middle" });
  }
  for (let mm = 0; mm <= 8; mm++) g += L.line(xOf(mm), ys - 3, xOf(mm), ys, { c: C.faint, w: 0.8 });
  g += L.poly([[xOf(gap - GAP10), ys - 2], [xOf(gap - GAP10) - 7, ys - 15], [xOf(gap - GAP10) + 7, ys - 15]], { fill: C.beam });
  g += L.text(xOf(8.4) - 12, ys + 5, "动镜位置（放大 5.5 倍）", { size: 15, c: C.mid, anchor: "end" });
  // 空气隙尺寸线（在镜组上方）
  const yd = Y(33.5);
  g += L.line(X(zML + 2), Y(7), X(zML + 2), yd - 6, { c: C.faint, w: 0.9 });
  g += L.line(X(0), Y(25.6), X(0), yd - 6, { c: C.faint, w: 0.9 });
  g += L.dim(X(zML + 2), yd, X(0), yd, `镜间空气隙 ${gap.toFixed(2)} mm`, { size: 18, c: C.ink, dy: -10 });
  g += L.text(W - 30, Y(18), `光线去往 ${Lm.toFixed(1)} m 处的焦点 →`, { size: 20, c: C.ink, anchor: "end" });
  return g;
}

function poly_pointer(x, y) {               // 滑座指针
  return L.poly([[x, y + 1], [x - 7, y + 12], [x + 7, y + 12]], { fill: C.beam });
}

// ---------- 下：光斑—距离 ----------
const GX0 = 150, GX1 = 1180, GY0 = 845, GY1 = 585, ZMAX = 10, DMAX = 60;
const gx = (m) => GX0 + (GX1 - GX0) * m / ZMAX, gy = (d) => GY0 - (GY0 - GY1) * d / DMAX;
const LOCUS = [];
for (let m = 0.8; m <= 10.001; m += 0.1) LOCUS.push([gx(m), gy(dAt(gapOf(m * 1000), m * 1000))]);

function chart(gap, Lm) {
  let g = "";
  for (let m = 0; m <= ZMAX; m++) {
    g += L.line(gx(m), GY0, gx(m), GY0 + 6, { c: C.ink, w: 1 });
    g += L.text(gx(m), GY0 + 26, `${m}`, { size: 17, c: C.ink, anchor: "middle" });
  }
  for (let d = 0; d <= DMAX; d += 20) {
    g += L.line(GX0, gy(d), GX1, gy(d), { c: d ? "#E6E6E6" : C.ink, w: 1 });
    g += L.text(GX0 - 12, gy(d) + 6, `${d}`, { size: 17, c: C.ink, anchor: "end" });
  }
  g += L.text((GX0 + GX1) / 2, GY0 + 54, "离物镜的距离 / m", { size: 18, c: C.ink, anchor: "middle" });
  g += L.text(GX0 - 70, GY1 - 20, "光斑直径 / mm", { size: 18, c: C.ink });
  const cur = [], fix = [];
  for (let m = 0.2; m <= ZMAX + 0.001; m += 0.05) {
    const a = dAt(gap, m * 1000), b = dAt(GAP3, m * 1000);
    if (a <= DMAX) cur.push([gx(m), gy(a)]);
    if (b <= DMAX) fix.push([gx(m), gy(b)]);
  }
  g += L.pline(LOCUS, { c: C.beam, w: 1.4, dash: "2 5" });
  g += L.pline(fix, { c: "#7A7A7A", w: 2.2, dash: "8 6" });
  g += L.pline(cur, { c: C.beam, w: 3 });
  const dd = dAt(gap, Lm * 1000), df = dAt(GAP3, Lm * 1000);
  g += L.line(gx(Lm), GY1 - 4, gx(Lm), GY0, { c: C.ink, w: 1.2, dash: "4 4" });
  g += L.circle(gx(Lm), gy(df), 6, { fill: "#fff", c: "#7A7A7A", w: 2.4 });
  g += L.circle(gx(Lm), gy(dd), 6.5, { fill: C.beam });
  // 曲线旁直接标注（MIT 第 13 页的做法，不用图例）
  g += L.text(gx(7.0), gy(dAt(GAP3, 7000)) - 16, "动镜不动（对焦 3 m）", { size: 17, c: "#555", anchor: "middle" });
  g += L.text(gx(8.3), gy(dAt(gapOf(8300), 8300)) + 32, "各距离对焦后的最小光斑", { size: 17, c: C.beam, anchor: "middle" });
  g += L.text(gx(Math.min(Lm, 8.6)) + 10, GY1 + 2, "当前光束", { size: 16, c: C.beam });
  return g;
}

function readout(gap, Lm) {
  const dd = dAt(gap, Lm * 1000), df = dAt(GAP3, Lm * 1000);
  const x = 1240;
  let g = "";
  const rows = [
    ["目标距离", `${Lm.toFixed(1)} m`],
    ["动镜位移", `${(gap - GAP10).toFixed(2)} mm`],
    ["光斑（动态聚焦）", `${dd.toFixed(1)} mm`],
    ["光斑（动镜不动）", `${df.toFixed(1)} mm`],
    ["平均功率密度", `${dens(dd).toFixed(0)} W/cm²`],
  ];
  rows.forEach(([k, v], i) => {
    const y = 610 + i * 46;
    g += L.text(x, y, k, { size: 18, c: C.ink });
    g += L.text(W - 40, y, v, { size: 22, c: i === 2 ? C.beam : C.ink, anchor: "end", weight: 500 });
  });
  g += L.text(x, 610 + 5 * 46 + 2, "915 nm，M² ≈ 58，260 W", { size: 15, c: C.mid });
  return g;
}

const FR = 140;
function Lof(i) {
  const seg = [14, 56, 14, 56];
  let t = i;
  if (t < seg[0]) return 1; t -= seg[0];
  if (t < seg[1]) return Math.pow(10, L.ease(t / seg[1])); t -= seg[1];
  if (t < seg[2]) return 10; t -= seg[2];
  return Math.pow(10, 1 - L.ease(t / seg[3]));
}

// 导出各距离的数值，PPT 正文用同一组数
function table() {
  return [1, 1.5, 2, 3, 5, 10].map((Lm) => {
    const g = gapOf(Lm * 1000), dd = dAt(g, Lm * 1000), df = dAt(GAP3, Lm * 1000);
    return { 距离_m: Lm, 空气隙_mm: +g.toFixed(3), 动镜位移_mm: +(g - GAP10).toFixed(2),
      动态聚焦光斑_mm: +dd.toFixed(2), 动镜不动光斑_mm: +df.toFixed(2),
      动态功率密度_W_cm2: Math.round(dens(dd)), 不动功率密度_W_cm2: Math.round(dens(df)) };
  });
}

module.exports = {
  table,
  name: "原理_动态聚焦", width: W, height: H, fps: 25, frames: FR, still: 6, colors: 160,
  frame(i) {
    const Lm = Lof(i), gap = gapOf(Lm * 1000);
    return L.svg(W, H, module_(gap, Lm) + chart(gap, Lm) + readout(gap, Lm));
  },
};
