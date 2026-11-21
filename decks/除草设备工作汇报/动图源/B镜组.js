// B 方案动态聚焦镜组（BICV-FS04 + LA4904 + LB4842），915 nm
// 处方来自 jiguangdongtaijujiao 仓库 Zemax 结果 v0.2；空气隙表来自 工具/动态聚焦追迹.json
// 坐标：物镜第一面顶点 z = 0，光从左（z < 0）向右传播；单位 mm
const fs = require("fs");
const path = require("path");
const L = require("./lib");

const TR = JSON.parse(fs.readFileSync(path.join(__dirname, "../工具/动态聚焦追迹.json"), "utf8"));
const NG = TR["折射率"]["915nm"];
const GT = TR["空气隙表_915"];

// 空气隙随目标距离（从物镜最后一面量起）插值
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
const GAP10 = gapOf(10000);
const OBJ_LEN = 7.84 + 6.8822842 + 6.54;          // 物镜第一面到最后一面

function surfs(gap) {
  return [
    { R: -18.71, t: 2.0, n: NG, a: 6.35 },          // 动镜前面
    { R: 18.71, t: gap, n: 1, a: 6.35 },            // 动镜后面
    { R: Infinity, t: 7.84, n: NG, a: 25.4 },       // LA4904 平面（反放）
    { R: -69.01, t: 6.8822842, n: 1, a: 25.4 },
    { R: 182.99, t: 6.54, n: NG, a: 25.4 },         // LB4842
    { R: -182.99, t: 0, n: 1, a: 25.4 },
  ];
}
const zFront = (gap) => -(gap + 2.0);               // 动镜前表面

// 子午面精确光线追迹（Snell 定律逐面折射）
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

// 高斯光束：4 mm 准直光进动镜，厚透镜 ABCD 逐面计算
const FC = 2.0 / L.NA;                                // 4 mm 输入光束对应的准直镜焦距
const qC0 = L.qLens(L.qProp(L.qWaist(L.CORE_R), FC), FC);
const D0 = 30 + GAP10;                                // 准直镜出口到物镜第一面（固定）

function refract(q, n1, S) {
  const Cm = isFinite(S.R) ? (n1 - S.n) / (S.R * S.n) : 0, Dm = n1 / S.n;
  const den = { re: Cm * q.re + Dm, im: Cm * q.im };
  const d2 = den.re * den.re + den.im * den.im;
  return { re: (q.re * den.re + q.im * den.im) / d2, im: (q.im * den.re - q.re * den.im) / d2 };
}

function qOut(gap) {                                  // 物镜最后一面出口的 q
  let q = L.qProp(qC0, D0 - gap - 2.0), n1 = 1;
  for (const S of surfs(gap)) { q = L.qProp(refract(q, n1, S), S.t); n1 = S.n; }
  return q;
}

// 任意轴向位置 z 的光束半径（准直镜出口 z = −D0 起）；镜片内部按两侧线性插值
function radiusAt(gap, z) {
  const zs = [zFront(gap), zFront(gap) + 2.0, 0, 7.84, 7.84 + 6.8822842, OBJ_LEN];
  let q = L.qProp(qC0, zs[0] + D0), n1 = 1, k = 0;
  if (z <= zs[0]) return L.qW(L.qProp(qC0, z + D0));
  const S = surfs(gap);
  const ws = [];
  for (k = 0; k < S.length; k++) {
    ws.push(L.qW(q));
    q = refract(q, n1, S[k]);
    n1 = S[k].n;
    if (k < S.length - 1) {
      const zn = zs[k + 1];
      if (n1 === 1 && z < zn) return L.qW(L.qProp(q, z - zs[k]));
      if (n1 !== 1 && z < zn) {
        const w0 = L.qW(q), w1 = L.qW(L.qProp(q, zn - zs[k]));
        return w0 + (w1 - w0) * (z - zs[k]) / (zn - zs[k]);
      }
      q = L.qProp(q, zn - zs[k]);
    }
  }
  return L.qW(L.qProp(q, z - OBJ_LEN));
}

const dAt = (gap, zmm) => 2 * L.qW(L.qProp(qOut(gap), zmm));   // 物镜后 zmm 处光斑直径

// 镜片截面轮廓（mm）：两个球面 + 侧边
function lensOutline(z1, R1, z2, R2, a) {
  const pts = [];
  const sag = (R, y) => (isFinite(R) ? R - Math.sign(R) * Math.sqrt(R * R - y * y) : 0);
  for (let k = 0; k <= 30; k++) { const y = -a + (2 * a * k) / 30; pts.push([z1 + sag(R1, y), y]); }
  for (let k = 30; k >= 0; k--) { const y = -a + (2 * a * k) / 30; pts.push([z2 + sag(R2, y), y]); }
  return pts;
}

module.exports = { NG, GT, gapOf, GAP10, OBJ_LEN, surfs, zFront, traceRay, FC, qC0, D0, qOut, radiusAt, dAt, lensOutline };
