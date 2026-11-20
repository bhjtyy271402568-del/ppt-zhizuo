// 单镜片准直 / 双镜片聚焦：用“纤芯上一个发光点”的光线说明光斑从哪里来
// 几何关系（傍轴）：
//   准直：发光点高 h，出射光线全部平行，方向角 = −h / f1 → 整束光的发散半角 = r / f1
//   聚焦：再经 f2 会聚到焦平面上 y = −h · f2 / f1 → 光斑就是纤芯的像，d = 芯径 × f2 / f1
// 纤芯尺寸和角度放大画（真实纤芯 155 μm），比例关系保持正确。
const L = require("./lib");
const { C, OPT } = L;

const W = 1240, H = 560, Y0 = 268;          // 光轴高度
const FX = 190;                              // 光纤端面
const R = 17;                                // 纤芯半高（放大画）
const F1 = 290, X1 = FX + F1;                // 准直镜
const F2 = 360, X2 = 720, XF = X2 + F2;      // 聚焦镜、焦平面
const NA_A = Math.asin(OPT["光源"]["NA"]);   // 真实 NA 角
const NR = 9;                                // 每个发光点画几条光线

function fiber() {
  let g = L.rect(30, Y0 - 32, FX - 30, 64, { fill: "#EEF1F4", c: C.faint, w: 1 });   // 包层
  g += L.rect(30, Y0 - R, FX - 30, 2 * R, { fill: "rgba(208,38,58,0.12)", c: "none" }); // 纤芯
  g += L.line(30, Y0 - R, FX, Y0 - R, { c: C.faint, w: 0.8 }) + L.line(30, Y0 + R, FX, Y0 + R, { c: C.faint, w: 0.8 });
  g += L.line(FX, Y0 - 32, FX, Y0 + 32, { c: C.ink, w: 1.4 });
  g += L.label(110, Y0 - 32, 92, Y0 - 78, "包层", { anchor: "end" });
  g += L.label(150, Y0 - R + 4, 172, Y0 - 104, "纤芯 Ø155 μm（放大画）");
  return g;
}

// 一个发光点 h 的一束光线：返回各段折线
function rays(h, mode) {
  const out = [];
  for (let k = 0; k < NR; k++) {
    const a = -NA_A + (2 * NA_A * k) / (NR - 1);
    const y1 = h + F1 * Math.tan(a);                  // 到准直镜的高度（向下为正）
    const b = Math.atan(Math.tan(a) - y1 / F1);       // 准直后方向：tan b = −h / F1
    if (mode === "collimate") {
      out.push([[FX, Y0 + h], [X1, Y0 + y1], [W - 30, Y0 + y1 + (W - 30 - X1) * Math.tan(b)]]);
    } else {
      const y2 = y1 + (X2 - X1) * Math.tan(b);
      const yi = F2 * Math.tan(b);                    // 焦平面上的像高 = −h·F2/F1
      const c = Math.atan((yi - y2) / F2);
      const xe = W - 30;
      out.push([[FX, Y0 + h], [X1, Y0 + y1], [X2, Y0 + y2], [XF, Y0 + yi], [xe, Y0 + yi + (xe - XF) * Math.tan(c)]]);
    }
  }
  return out;
}

function bundle(rs, o) {
  // 用最外两条光线围成光束包络，中间光线画细线
  const top = rs[0], bot = rs[rs.length - 1];
  let g = L.poly(top.concat([...bot].reverse()), { fill: o.fill, c: "none" });
  for (const r of rs) g += L.pline(r, { c: o.c, w: o.w, op: o.op });
  return g;
}

module.exports = function (mode) {
  const frames = 80, fps = 20;
  return {
    name: mode === "collimate" ? "原理_单镜片准直" : "原理_双镜片聚焦",
    width: W, height: H, fps, frames, still: 12,
    frame(i) {
      const h = R * Math.sin((2 * Math.PI * i) / frames);
      let g = "";
      // 光轴
      g += L.line(20, Y0, W - 20, Y0, { c: C.faint, w: 0.8, dash: "10 4 2 4" });
      // 纤芯两端发光点的光束（淡色），说明整束光的范围
      for (const hh of [-R, R]) g += bundle(rays(hh, mode), { fill: "rgba(208,38,58,0.07)", c: C.beam, w: 0.5, op: 0.25 });
      // 当前发光点
      g += bundle(rays(h, mode), { fill: "rgba(208,38,58,0.20)", c: C.beam, w: 1.1, op: 0.85 });
      g += fiber();
      g += L.circle(FX, Y0 + h, 4, { fill: C.beam, c: C.bg, w: 1.2 });
      g += L.text(FX - 12, Y0 + h + 5, "发光点", { size: 13, c: C.beam, anchor: "end" });

      g += L.lensShape(X1, Y0, 220, 16, "convex", 0);
      g += L.text(X1, Y0 + 136, "准直镜 f₁", { size: 15, c: C.ink, anchor: "middle", weight: 500 });
      g += L.dim(FX, Y0 + 160, X1, Y0 + 160, "f₁", { dy: -6 });

      if (mode === "collimate") {
        // 两处光束宽度：越远越宽 → 发散角 = r / f1
        for (const x of [620, 1150]) {
          const a = rays(-R, mode)[0], b = rays(R, mode)[NR - 1];
          const yTop = a[1][1] + (x - X1) * (a[2][1] - a[1][1]) / (a[2][0] - X1);
          const yBot = b[1][1] + (x - X1) * (b[2][1] - b[1][1]) / (b[2][0] - X1);
          g += L.dim(x, Math.min(yTop, yBot) - 4, x, Math.max(yTop, yBot) + 4, "", { c: C.mid });
        }
        g += L.text(640, 120, "整束光的宽度随距离慢慢变大", { size: 14, c: C.mid });
        g += L.text(860, 54, "光束直径  D = 2 f₁ · NA", { size: 17, c: C.ink });
        g += L.text(860, 84, "发散半角  θ = r / f₁", { size: 17, c: C.ink });
        g += L.text(860, 108, "r 为纤芯半径", { size: 13, c: C.mid });
      } else {
        g += L.lensShape(X2, Y0, 220, 16, "convex", 0);
        g += L.text(X2, Y0 + 136, "聚焦镜 f₂", { size: 15, c: C.ink, anchor: "middle", weight: 500 });
        g += L.dim(X2, Y0 + 160, XF, Y0 + 160, "f₂", { dy: -6 });
        // 焦平面 + 纤芯的像
        g += L.line(XF, Y0 - 120, XF, Y0 + 120, { c: C.glassLine, w: 1, dash: "5 4" });
        g += L.text(XF, Y0 - 128, "焦平面", { size: 13, c: C.glassLine, anchor: "middle" });
        const yi = R * F2 / F1;
        g += L.line(XF, Y0 - yi, XF, Y0 + yi, { c: C.beam, w: 5, op: 0.55, cap: "round" });
        g += L.label(XF + 4, Y0 - yi + 6, XF + 34, Y0 - 70, "纤芯的像 = 光斑");
        g += L.circle(XF, Y0 - h * F2 / F1, 4, { fill: C.beam, c: C.bg, w: 1.2 });
        g += L.text(560, 54, "光斑直径  d = 芯径 × f₂ / f₁", { size: 17, c: C.ink });
        g += L.text(560, 80, "发光点在纤芯上移动，像点在焦平面上反向移动", { size: 13, c: C.mid });
      }
      g += L.text(30, H - 22, "示意：纤芯与光线角度放大画，比例关系按傍轴公式", { size: 12, c: C.faint });
      return L.svg(W, H, g);
    },
  };
};
