// 渲染器：node render.js <动图脚本.js> <输出目录>
// 1) 逐帧生成 SVG  2) Chromium 截图成 PNG  3) ffmpeg 合成 GIF（两遍调色板）  4) 存一张静帧 PNG
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

async function main() {
  const [script, outDir] = process.argv.slice(2);
  if (!script || !outDir) {
    console.error("用法：node render.js <动图脚本.js> <输出目录>");
    process.exit(1);
  }
  const anim = require(path.resolve(script));
  const name = anim.name || path.basename(script, ".js");
  const { width: W, height: H, fps, frames } = anim;
  const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "anim-"));

  const svgs = [];
  for (let i = 0; i < frames; i++) svgs.push(anim.frame(i, frames));

  // 先把所有用到的字放进隐藏层，等字体子集全部加载完再截图
  const allText = [...new Set(svgs.join("").match(/>([^<>]+)</g)?.join("") || "")].join("");
  const fontDir = path.join(__dirname, "node_modules/@fontsource/noto-sans-sc");
  const css = ["400", "500", "700"].map((w) =>
    fs.readFileSync(path.join(fontDir, `${w}.css`), "utf8").replace(/url\(\.\/files\//g, `url(file://${fontDir}/files/`)).join("\n");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}
    html,body{margin:0;padding:0;background:#fff}
    #pre{position:absolute;left:-9999px;font-family:'Noto Sans SC'}
  </style></head><body><div id="c"></div>
  <div id="pre"><span style="font-weight:400">${allText}</span><span style="font-weight:500">${allText}</span><span style="font-weight:700">${allText}</span></div></body></html>`;
  const htmlPath = path.join(tmp, "page.html");
  fs.writeFileSync(htmlPath, html);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto("file://" + htmlPath);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);

  for (let i = 0; i < frames; i++) {
    await page.evaluate((s) => { document.getElementById("c").innerHTML = s; }, svgs[i]);
    await page.screenshot({ path: path.join(tmp, `f${String(i).padStart(4, "0")}.png`), clip: { x: 0, y: 0, width: W, height: H } });
  }
  await browser.close();

  fs.mkdirSync(outDir, { recursive: true });
  const gif = path.join(outDir, `${name}.gif`);
  const still = path.join(outDir, `${name}_静帧.png`);
  const stillIdx = anim.still ?? Math.floor(frames * 0.3);
  fs.copyFileSync(path.join(tmp, `f${String(stillIdx).padStart(4, "0")}.png`), still);
  // 两遍调色板：先统计全部帧的颜色，再按这套调色板编码，细线和半透明光束才不会发花
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", path.join(tmp, "f%04d.png"),
    "-vf", `split[a][b];[a]palettegen=max_colors=${anim.colors || 128}:stats_mode=full[p];[b][p]paletteuse=dither=none`,
    "-loop", "0", gif]);
  if (anim.mp4) {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", path.join(tmp, "f%04d.png"),
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", path.join(outDir, `${name}.mp4`)]);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  const kb = Math.round(fs.statSync(gif).size / 1024);
  console.log(`${gif}  ${W}×${H}  ${frames} 帧 @ ${fps} fps  ${kb} KB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
