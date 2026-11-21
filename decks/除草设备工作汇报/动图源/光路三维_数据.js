// 给 光路三维.html 预先算好每一帧的光学数据（浏览器里不方便直接调用 B镜组.js）
// 运行：node 光路三维_数据.js → 光路三维_数据.json
const fs = require("fs");
const path = require("path");
const L = require("./lib");
const B = require("./B镜组");
const { OPT } = L;

const FR = 96;
const HW = OPT["假设"]["振镜到地面_mm"];
const PHI_MAX = OPT["后聚焦"]["单轴光学扫描角_deg"] * Math.PI / 180;
const D_BEAM = OPT["假设"]["进振镜光束直径_mm"];
const fColl = (D_BEAM / 2) / L.NA;
const qColl = L.qLens(L.qProp(L.qWaist(L.CORE_R), fColl), fColl);
const OBJ_TO_GALVO = 40;
const Z0 = -OBJ_TO_GALVO - B.OBJ_LEN;
const ZC = Z0 - B.D0;

// 准直光（平行光、后聚焦）：离准直镜 s mm 处的半径，每 10 mm 一个点
const coll = [];
for (let s = 0; s <= 900; s += 10) coll.push(+L.qW(L.qProp(qColl, s)).toFixed(4));

const frames = [];
const gap0 = B.gapOf(OBJ_TO_GALVO + HW);
for (let i = 0; i < FR; i++) {
  const phi = PHI_MAX * Math.sin((2 * Math.PI * i) / FR);
  const Lf = OBJ_TO_GALVO + HW / Math.cos(phi);
  const gap = B.gapOf(Lf);
  const head = [], tail = [];                       // 前聚焦：准直镜→振镜（32 点）、振镜→地面（40 点）
  for (let k = 0; k <= 32; k++) { const z = ZC + (0 - ZC) * k / 32; head.push(+B.radiusAt(gap, z - Z0).toFixed(4)); }
  const rmax = HW / Math.cos(phi);
  for (let k = 0; k <= 40; k++) tail.push(+B.radiusAt(gap, B.OBJ_LEN + OBJ_TO_GALVO + rmax * k / 40).toFixed(4));
  frames.push({ phi, gap, dg: gap - gap0, zML: Z0 + B.zFront(gap), head, tail, dFront: B.dAt(gap, Lf) });
}

const out = {
  HW, PHI_MAX, fColl, A_IN: 100, coll,
  dPar: 2 * L.qW(L.qProp(qColl, 100 + HW)),
  w0: OPT["后聚焦"]["焦点光斑_mm"] / 2, zr: OPT["后聚焦"]["瑞利长度_mm"], F: OPT["后聚焦"]["场镜焦距_mm"],
  CORE_R: L.CORE_R, NA: L.NA, FC: B.FC, Z0, ZC, OBJ_LEN: B.OBJ_LEN, OBJ_TO_GALVO,
  frames,
};
fs.writeFileSync(path.join(__dirname, "光路三维_数据.json"), JSON.stringify(out));
console.log("帧数", frames.length, "前聚焦光斑", frames[0].dFront.toFixed(2), "~", Math.min(...frames.map((f) => f.dFront)).toFixed(2), "mm");
