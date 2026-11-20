// 动图共用：配色、SVG 绘图小工具、高斯光束计算
// 所有长度单位 mm，画图时乘以比例尺 s（px/mm）

const fs = require("fs");
const path = require("path");

// 光学参数统一从光学计算.json 读取，动图里的数字和 PPT 正文是同一来源
const OPT = JSON.parse(fs.readFileSync(path.join(__dirname, "../工具/光学计算.json"), "utf8"));

// ---------------- 配色（和 PPT 主题一致） ----------------
const C = {
  ink: "#111111",      // 主要文字、轮廓（和 PPT 正文一样用黑色）
  mid: "#444444",      // 次要文字
  faint: "#9AA3AE",    // 辅助线
  rule: "#D9DEE4",     // 网格、地面填充
  glass: "#E6EFF8",    // 镜片填充
  glassLine: "#4F7DB3",
  metal: "#7F8A97",
  metalDark: "#59636F",
  beam: "#D0263A",     // 激光（915 nm 不可见，按惯例画成红色）
  beamFill: "rgba(208,38,58,0.26)",
  ground: "#8B7D6B",
  bg: "#FFFFFF",
};

const FONT = "'Noto Sans SC', 'Microsoft YaHei', sans-serif";

// ---------------- SVG 小工具 ----------------
const f2 = (v) => (Math.round(v * 100) / 100).toString();

function svg(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="${C.bg}"/>${body}</svg>`;
}

function line(x1, y1, x2, y2, o = {}) {
  return `<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="${o.c || C.ink}" ` +
    `stroke-width="${o.w || 1.2}" ${o.dash ? `stroke-dasharray="${o.dash}"` : ""} ` +
    `stroke-linecap="${o.cap || "butt"}" ${o.op ? `opacity="${o.op}"` : ""}/>`;
}

function poly(pts, o = {}) {
  const d = pts.map((p) => `${f2(p[0])},${f2(p[1])}`).join(" ");
  return `<polygon points="${d}" fill="${o.fill || "none"}" stroke="${o.c || "none"}" ` +
    `stroke-width="${o.w || 1}" ${o.op ? `opacity="${o.op}"` : ""} stroke-linejoin="round"/>`;
}

function pline(pts, o = {}) {
  const d = pts.map((p) => `${f2(p[0])},${f2(p[1])}`).join(" ");
  return `<polyline points="${d}" fill="none" stroke="${o.c || C.ink}" stroke-width="${o.w || 1.2}" ` +
    `${o.dash ? `stroke-dasharray="${o.dash}"` : ""} ${o.op ? `opacity="${o.op}"` : ""} stroke-linejoin="round"/>`;
}

function rect(x, y, w, h, o = {}) {
  return `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" ` +
    `fill="${o.fill || "none"}" stroke="${o.c || "none"}" stroke-width="${o.w || 1}" ` +
    `${o.rx ? `rx="${o.rx}"` : ""} ${o.tr ? `transform="${o.tr}"` : ""}/>`;
}

function circle(x, y, r, o = {}) {
  return `<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(r)}" fill="${o.fill || "none"}" ` +
    `stroke="${o.c || "none"}" stroke-width="${o.w || 1}" ${o.op ? `opacity="${o.op}"` : ""}/>`;
}

function text(x, y, s, o = {}) {
  return `<text x="${f2(x)}" y="${f2(y)}" font-family="${FONT}" font-size="${o.size || 15}" ` +
    `font-weight="${o.weight || 400}" fill="${o.c || C.ink}" text-anchor="${o.anchor || "start"}" ` +
    `${o.tr ? `transform="${o.tr}"` : ""} dominant-baseline="${o.base || "alphabetic"}">${s}</text>`;
}

// 带引线的标注：从 (x1,y1) 指向部件，文字放在 (x2,y2)
function label(x1, y1, x2, y2, s, o = {}) {
  const anchor = o.anchor || (x2 >= x1 ? "start" : "end");
  const tx = x2 + (anchor === "start" ? 4 : anchor === "end" ? -4 : 0);
  return line(x1, y1, x2, y2, { c: C.faint, w: 0.9 }) + circle(x1, y1, 1.6, { fill: C.faint }) +
    text(tx, y2 + 6, s, { size: o.size || 19, c: o.c || C.ink, anchor, weight: o.weight });
}

// 箭头（实心三角头）
function arrow(x1, y1, x2, y2, o = {}) {
  const a = Math.atan2(y2 - y1, x2 - x1), L = o.head || 7, sp = 0.42;
  const p1 = [x2 - L * Math.cos(a - sp), y2 - L * Math.sin(a - sp)];
  const p2 = [x2 - L * Math.cos(a + sp), y2 - L * Math.sin(a + sp)];
  const xe = x2 - L * 0.8 * Math.cos(a), ye = y2 - L * 0.8 * Math.sin(a);
  return line(x1, y1, xe, ye, o) + poly([[x2, y2], p1, p2], { fill: o.c || C.ink });
}

// 尺寸线（工程图）：两端箭头 + 中间文字
function dim(x1, y1, x2, y2, s, o = {}) {
  const c = o.c || C.mid;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  return arrow(mx, my, x1, y1, { c, w: 0.9, head: 6 }) + arrow(mx, my, x2, y2, { c, w: 0.9, head: 6 }) +
    (s ? text(mx + (o.dx || 0), my + (o.dy || -7), s, { size: o.size || 17, c, anchor: "middle" }) : "");
}

// 透镜截面（双凸 / 平凸 / 双凹），中心 (x,y)，光轴方向角 ang（弧度），口径 h，中心厚 t
function lensShape(x, y, h, t, kind = "convex", ang = 0, o = {}) {
  const n = 24, pts = [];
  const sag = kind === "concave" ? -t * 0.55 : t * 0.5;
  const edge = kind === "concave" ? t * 0.75 : t * 0.12;
  // 右表面（从上到下），左表面（从下到上）
  for (let i = 0; i <= n; i++) {
    const v = -h / 2 + (h * i) / n, k = 1 - (2 * v / h) ** 2;
    pts.push([edge / 2 + sag * k, v]);
  }
  for (let i = n; i >= 0; i--) {
    const v = -h / 2 + (h * i) / n, k = 1 - (2 * v / h) ** 2;
    const left = kind === "plano" ? -edge / 2 - sag * 0.15 : -edge / 2 - sag * k;
    pts.push([left, v]);
  }
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const P = pts.map(([u, v]) => [x + u * ca - v * sa, y + u * sa + v * ca]);
  return poly(P, { fill: o.fill || C.glass, c: o.c || C.glassLine, w: o.w || 1.3 });
}

// ---------------- 高斯光束（嵌入高斯，λ → M²·λ） ----------------
const LAM = OPT["光源"]["波长_nm"] * 1e-6;     // mm
const M2 = OPT["光源"]["M2"];
const LE = LAM * M2;                           // 等效波长 mm
const CORE_R = OPT["光源"]["芯径_um"] / 2000;  // mm
const NA = OPT["光源"]["NA"];

const cx = (re, im) => ({ re, im });
const cdiv = (a, b) => { const d = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
const inv = (q) => cdiv(cx(1, 0), q);
const qWaist = (w0, z = 0) => cx(z, Math.PI * w0 * w0 / LE);
const qProp = (q, d) => cx(q.re + d, q.im);
const qLens = (q, f) => { const i = inv(q); return inv(cx(i.re - 1 / f, i.im)); };
const qW = (q) => { const i = inv(q); return Math.sqrt(-LE / (Math.PI * i.im)); };

// ---------------- 时间曲线 ----------------
const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, u)));
const lerp = (a, b, u) => a + (b - a) * u;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

module.exports = {
  OPT, C, FONT, svg, line, poly, pline, rect, circle, text, label, arrow, dim, lensShape,
  LAM, M2, LE, CORE_R, NA, qWaist, qProp, qLens, qW, ease, lerp, clamp, f2,
};
