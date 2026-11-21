// 三维动图渲染：node render3d.js <页面.html> <输出目录> <名字>
// 起一个本地 http 服务（ES 模块不能从 file:// 加载），逐帧调用页面里的 setFrame(i) 截图，再用 ffmpeg 合成
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".woff": "font/woff" };

async function main() {
  const [page, outDir, name, w = "1600", h = "900", fps = "25", scale = "1.5"] = process.argv.slice(2);
  const root = __dirname;
  const server = http.createServer((req, res) => {
    const f = path.join(root, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  }).listen(0);
  const port = server.address().port;
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const pg = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +scale });   // 输出像素 = 逻辑尺寸 × scale
  await pg.goto(`http://127.0.0.1:${port}/${encodeURIComponent(page)}`);
  await pg.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
  await pg.evaluate(() => document.fonts.ready);
  const frames = await pg.evaluate(() => window.FRAMES);
  if (process.env.PREVIEW) {                       // 只出一帧预览：PREVIEW=帧号
    await pg.evaluate((k) => window.setFrame(k), +process.env.PREVIEW);
    const out = path.join(outDir, `${name}_预览.png`);
    fs.mkdirSync(outDir, { recursive: true });
    await pg.screenshot({ path: out });
    await browser.close(); server.close();
    return console.log(out);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "a3d-"));
  const off = await pg.evaluate(() => window.OFFSET || 0);   // 第一帧落在出光画面上
  for (let i = 0; i < frames; i++) {
    await pg.evaluate((k) => window.setFrame(k), (i + off) % frames);
    await pg.screenshot({ path: path.join(tmp, `f${String(i).padStart(4, "0")}.png`) });
  }
  await browser.close(); server.close();
  fs.mkdirSync(outDir, { recursive: true });
  const gif = path.join(outDir, `${name}.gif`);
  const still = 0;
  fs.copyFileSync(path.join(tmp, `f${String(still).padStart(4, "0")}.png`), path.join(outDir, `${name}_静帧.png`));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", fps, "-i", path.join(tmp, "f%04d.png"),
    "-vf", "split[a][b];[a]palettegen=max_colors=200:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a",
    "-loop", "0", gif]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${gif}  ${frames} 帧  ${Math.round(fs.statSync(gif).size / 1024)} KB`);
}
main().catch((e) => { console.error(e); process.exit(1); });
