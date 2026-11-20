// Z 轴测距聚焦（原理.pptx 方案）：地面起伏，传感器测斜距 L → H = L·cosβ → Z 轴升降使 H = F
// 传感器在激光头侧面，水平距离 D，光束固定倾斜 β，使 H = F 时测距光点与激光焦点重合。
// 地面平整时 H = L·cosβ；不在焦点时，测距光点与激光点不重合（倾斜安装的必然结果）。
const L = require("./lib");
const { C, OPT } = L;
const ZA = OPT["Z轴测距"];

const W = 1240, H = 740;
const D = ZA["示意_D_mm"], F = ZA["示意_F_mm"];
const BETA = Math.atan(D / F);
const S = 0.68;                                  // px/mm
const AX = 440;                                  // 激光轴的像素 x
const Y_DATUM = 650;                             // 地面基准（高度 0）的像素 y
const sx = (x) => AX + S * x, sy = (z) => Y_DATUM - S * z;

// 地面：向左移动（设备向右行进），周期 1200 mm，4 s 一个循环
const LAMBDA = 1200, V = 300, FPS = 25, FR = 100;
const ground = (x, t) => {
  const u = (2 * Math.PI * (x + V * t)) / LAMBDA;
  return 42 * Math.sin(u) + 18 * Math.sin(2 * u + 1.1);
};

// 传感器光线与地面的交点：从 (−D, zh) 沿 (sinβ, −cosβ) 走 s
function hit(zh, t) {
  let a = 0, b = 2 * F;
  const f = (s) => (zh - s * Math.cos(BETA)) - ground(-D + s * Math.sin(BETA), t);
  for (let k = 0; k < 60; k++) { const m = (a + b) / 2; if (f(m) > 0) a = m; else b = m; }
  return (a + b) / 2;
}

// 闭环仿真：dzh/dt = −K·(H测 − F)，先跑一个周期进入稳态，再记录一个周期
const K = 3.2, SUB = 20;
const rec = [];
let zh = F + 30, t = 0;
const dt = 1 / FPS / SUB;
for (let i = 0; i < 2 * FR; i++) {
  for (let k = 0; k < SUB; k++) {
    const Ls = hit(zh, t), Hm = Ls * Math.cos(BETA);
    zh -= K * (Hm - F) * dt;
    t += dt;
  }
  if (i >= FR) {
    const Ls = hit(zh, t);
    rec.push({ zh, t, Ls, Hm: Ls * Math.cos(BETA), Htrue: zh - ground(0, t) });
  }
}

function weeds(t) {
  let g = "";
  for (let k = -3; k <= 3; k++) {
    let x = ((k * 230 - V * t) % 1610 + 1610) % 1610 - 805 + 40;
    if (x < -540 || x > 500) continue;
    const yb = sy(ground(x, t));
    for (let j = -2; j <= 2; j++) {
      const a = j * 0.45, len = 16 + (2 - Math.abs(j)) * 6;
      g += `<path d="M ${sx(x)} ${yb} q ${Math.sin(a) * len * 0.5} ${-len * 0.6} ${Math.sin(a) * len} ${-len * Math.cos(a)}" stroke="#4F8A2E" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    }
  }
  return g;
}

function soil(t) {
  const top = [];
  for (let x = -560; x <= 520; x += 6) top.push([sx(x), sy(ground(x, t))]);
  const pts = top.concat([[sx(520), H - 20], [sx(-560), H - 20]]);
  return L.poly(pts, { fill: "#F1EBE1", c: "none" }) + L.pline(top, { c: C.ground, w: 1.6 });
}

module.exports = {
  name: "原理_Z轴测距聚焦", width: W, height: H, fps: FPS, frames: FR, offset: 30, colors: 160,
  frame(i) {
    const r = rec[i];
    const zh = r.zh, tt = r.t;
    let g = soil(tt) + weeds(tt);
    // Z 轴立柱 + 滑台
    const colX = sx(-D - 120);
    g += L.rect(colX - 14, 46, 28, sy(F - 90) - 46, { fill: "#EEF1F4", c: C.metalDark, w: 1.2 });          // 立柱
    for (let yy = 52; yy < sy(F - 90) - 6; yy += 7) g += L.line(colX - 4, yy, colX + 4, yy + 4, { c: C.faint, w: 0.8 }); // 丝杆
    g += L.rect(colX - 26, 18, 52, 26, { fill: "#E3E7EC", c: C.metalDark, w: 1.2 });
    g += L.text(colX, 37, "Z 电机", { size: 16, c: C.ink, anchor: "middle" });
    // 激光头（随 zh 上下）
    const yh = sy(zh);
    g += L.rect(colX - 20, yh - 124, 40, 44, { fill: "#D3D8DE", c: C.metalDark, w: 1.2 });                 // 滑块
    g += L.rect(colX + 20, yh - 110, sx(-34) - colX - 20, 16, { fill: "#D5DBE2", c: C.metalDark, w: 1 });   // 横梁
    g += L.rect(sx(-34), yh - 120, S * 68, 84, { fill: "#E3E7EC", c: C.metalDark, w: 1.2 });               // 头部
    g += L.rect(sx(-14), yh - 36, S * 28, 36, { fill: "#D5DBE2", c: C.metalDark, w: 1.2 });                // 镜筒
    g += L.text(sx(0), yh - 72, "激光头", { size: 17, c: C.ink, anchor: "middle" });
    // 传感器（与镜筒下端同高，在左侧 D 处）
    const xs = sx(-D), ys = yh;
    g += L.rect(xs, yh - 46, sx(-34) - xs, 9, { fill: "#D5DBE2", c: C.metalDark, w: 1 });                  // 传感器支架
    g += `<rect x="${xs - 12}" y="${ys - 30}" width="24" height="30" fill="#F4E9D2" stroke="#9A7420" stroke-width="1.2" transform="rotate(${-BETA * 180 / Math.PI} ${xs} ${ys})"/>`;
    g += L.text(xs - 22, ys - 34, "测距传感器", { size: 19, c: "#8A6A1E", anchor: "end" });
    // 激光：从镜筒会聚到焦点 F，再到地面
    const yFocus = sy(zh - F), yG = sy(ground(0, tt));
    g += L.poly([[sx(-9), yh], [sx(9), yh], [sx(0) + 1.2, yFocus], [sx(0) - 1.2, yFocus]], { fill: C.beamFill, c: C.beam, w: 0.8 });
    if (Math.abs(yG - yFocus) > 1) {
      const k = Math.abs(yG - yFocus) / (yFocus - yh) * 9;
      g += L.poly([[sx(0) - 1.2, yFocus], [sx(0) + 1.2, yFocus], [sx(k), yG], [sx(-k), yG]], { fill: C.beamFill, c: C.beam, w: 0.8 });
    }
    g += L.circle(sx(0), yG, 3.2, { fill: C.beam });
    // 测距光束
    const Ls = r.Ls, xh = -D + Ls * Math.sin(BETA), zhit = zh - Ls * Math.cos(BETA);
    g += L.line(xs, ys, sx(xh), sy(zhit), { c: "#B7791F", w: 1.4, dash: "6 4" });
    g += L.circle(sx(xh), sy(zhit), 3.2, { fill: "#B7791F" });
    // 焦平面参考线 + 尺寸
    g += L.line(sx(-60), yFocus, sx(70), yFocus, { c: C.glassLine, w: 1, dash: "4 3" });
    g += L.text(sx(-64), yFocus + 6, "焦平面", { size: 17, c: C.glassLine, anchor: "end" });
    g += L.dim(sx(150), yh, sx(150), yG, "", { c: C.mid });
    g += L.line(sx(12), yh, sx(156), yh, { c: C.faint, w: 0.8 }) + L.line(sx(6), yG, sx(156), yG, { c: C.faint, w: 0.8 });
    g += L.text(sx(160), (yh + yG) / 2 + 8, "H", { size: 22, c: C.ink, weight: 500 });
    g += L.label((xs + sx(xh)) / 2 - 2, (ys + sy(zhit)) / 2, (xs + sx(xh)) / 2 - 60, (ys + sy(zhit)) / 2 + 30, "斜距 L", { anchor: "end", c: "#8A6A1E" });
    // β 角
    g += `<path d="M ${xs} ${ys + 46} A 46 46 0 0 0 ${xs + 46 * Math.sin(BETA)} ${ys + 46 * Math.cos(BETA)}" fill="none" stroke="#9A7420" stroke-width="1"/>`;
    g += L.line(xs, ys, xs, ys + 60, { c: C.faint, w: 0.8, dash: "3 3" });
    g += L.text(xs + 8, ys + 70, "β", { size: 20, c: "#8A6A1E" });
    g += L.text(sx(-520), H - 28, "设备行进方向 →（地面相对向左移动）", { size: 17, c: C.ink });

    // 右侧读数
    const px0 = 820; let y = 86;
    const delta = r.Hm - F;
    g += L.text(px0, y, "H = L · cos β", { size: 32, c: C.ink, weight: 500 }); y += 36;
    g += L.text(px0, y, "β：传感器安装倾角（固定）", { size: 18, c: C.ink }); y += 56;
    g += L.text(px0, y, `测得斜距 L　${r.Ls.toFixed(1)} mm`, { size: 21, c: C.ink }); y += 36;
    g += L.text(px0, y, `换算高度 H　${r.Hm.toFixed(1)} mm`, { size: 21, c: C.ink }); y += 36;
    g += L.text(px0, y, `焦距 F　　　${F.toFixed(0)} mm`, { size: 21, c: C.ink }); y += 48;
    const act = Math.abs(delta) < 0.5 ? "在焦点上" : delta > 0 ? "离得太远 → Z 轴下降" : "离得太近 → Z 轴上升";
    g += L.text(px0, y, `Δ = H − F = ${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)} mm`, { size: 25, c: C.beam, weight: 500 }); y += 34;
    g += L.text(px0, y, act, { size: 20, c: C.ink }); y += 46;
    // Δ 指示条
    const bx = px0, bw = 320, by = y;
    g += L.line(bx, by, bx + bw, by, { c: C.rule, w: 6, cap: "round" });
    g += L.line(bx + bw / 2, by - 10, bx + bw / 2, by + 10, { c: C.mid, w: 1 });
    const kx = L.clamp(delta / 40, -1, 1) * bw / 2;
    g += L.circle(bx + bw / 2 + kx, by, 7, { fill: C.beam });
    g += L.text(bx, by + 28, "−40", { size: 16, c: C.ink }) + L.text(bx + bw, by + 28, "+40 mm", { size: 16, c: C.ink, anchor: "end" });
    y += 80;
    g += L.text(px0, y, "测距光点与激光点只在 H = F 时重合；", { size: 17, c: C.ink }); y += 28;
    g += L.text(px0, y, "闭环把 Δ 压到 0，两点重合在焦点上。", { size: 17, c: C.ink }); y += 40;
    g += L.text(px0, y, `示意尺寸：D = ${D} mm，F = ${F} mm，β = ${(BETA * 180 / Math.PI).toFixed(1)}°`, { size: 15, c: C.mid });
    return L.svg(W, H, g);
  },
};
