# ppt-zhizuo · PPT 制作

用脚本生成风格统一的汇报 PPT：**内容写在 YAML 里，样式集中在一个 Python 文件里**。

```
content.yaml（说什么） ──►  build.py  ──►  .pptx
                               ▲
                 pptkit/theme.py（长什么样）
```

改内容只动 `content.yaml`；想换配色、字体，只改 `pptkit/theme.py`，然后重新生成，所有页面一起变。

## 快速开始

```bash
pip install -r requirements.txt
```

```bash
python build.py decks/00_使用示例 --preview
```

成品在 `decks/00_使用示例/output/` 里。`--preview` 会另外导出 PDF 和每页 PNG（需要 LibreOffice），方便不开 PowerPoint 也能检查排版。

## 新建一份 PPT

```bash
python new_deck.py 动态聚焦_中期汇报
```

然后：

1. 编辑 `decks/动态聚焦_中期汇报/content.yaml`
2. 图片、视频放进同一文件夹的 `assets/`
3. 运行 `python build.py decks/动态聚焦_中期汇报 --preview`

## 目录结构

```
ppt-zhizuo/
├── build.py              # 生成 PPT
├── new_deck.py           # 从模板新建 deck
├── pptkit/
│   ├── theme.py          # 颜色、字体、字号、页边距 —— 全局样式
│   └── layouts.py        # 八种版式的具体画法
└── decks/
    ├── _template/        # 新建 deck 时复制的模板
    └── 00_使用示例/       # 每种版式都用了一遍的示例
        ├── content.yaml
        ├── assets/       # 图片、视频
        └── output/       # 生成的 .pptx（preview/ 不进仓库）
```

## content.yaml 怎么写

```yaml
meta:
  title: 动态聚焦系统中期汇报
  footer: 动态聚焦 · 中期汇报     # 每页左下角

slides:
  - layout: bullets
    title: 不调焦时光斑会变大
    items:
      - 焦点固定在 3 m 时，10 m 处光斑约 **42 mm**
      - 带子要点的一级:
          - 二级要点
    note: 这一页的结论（显示在底部橙色条里）
    notes: 演讲者备注，放映时只有自己看得到
```

| layout | 用途 | 必填字段 | 可选字段 |
|---|---|---|---|
| `cover` | 封面 | `title` | `subtitle` `author` `org` `date` |
| `section` | 章节过渡页 | `title` | `number` `subtitle` |
| `bullets` | 要点列表 | `title` `items` | `note` |
| `image` | 大图；写了 `bullets` 就是左图右文 | `title` `image` | `caption` `bullets` |
| `two_column` | 左右对比，每栏放要点或图 | `title` `left` `right` | 每栏 `heading` `items` / `image` `caption` |
| `table` | 表格，第一行是表头 | `title` `rows` | `caption` `col_widths` |
| `video` | 嵌入 MP4，封面帧自动截取 | `title` `video` | `caption` `poster` |
| `end` | 结束页 | — | `title` `subtitle` |

所有版式都能加 `notes`。完整写法见 `decks/_template/content.yaml` 里的注释。

几个小规则：

- `**文字**` 显示为橙色加粗，用来标关键数字和结论。
- 要点里有半角冒号加空格（如 `电压: 54.6 V`）时，YAML 会把它当成“键: 值”，脚本已经自动还原成原句；也可以用中文冒号“：”，或者给整句加引号。
- 图片按原比例缩放，不会变形。原图分辨率建议宽度 ≥ 1600 px。

## 工程汇报风格（style: report）

在 `meta` 里写 `style: report`，换成参考 MIT 会议报告的版式：白底、标题下一条细线、图占主体，只用激光红标关键数字。内容页用 `canvas` 版式，每个元素按英寸坐标摆放（页面 13.333 × 7.5）：

| 元素 type | 用途 | 主要字段 |
|---|---|---|
| `image` | 图片 / GIF 动图 | `src x y`，`w` 或 `h`（都写则按比例放进框里），`caption` |
| `text` | 文字（可多行） | `x y w text size color bold align` |
| `bullets` | 要点 | `x y w h items size` |
| `table` | 三线表 / 无线参数表 | `x y w rows widths style(three_line/plain) highlight_rows` |
| `label` | 图上标注，可带引线 | `x y text to:[x,y]` |
| `arrow` | 流程箭头 | `from:[x,y] to:[x,y] text` |
| `placeholder` | 待补内容的虚线框 | `x y w h title note` |
| `chart` | 原生柱状图 / 折线图 | `kind categories series y_title` |
| `rule` | 细分隔线 | `x y w h` |

每页还可以写 `kicker`（标题上方的章节名）、`note`（页底关键结论）、`refs`（页底出处）、`notes`（讲稿）。另有 `cover`、`agenda`、`end` 三种整页版式。完整示例见 `decks/除草设备工作汇报/content.yaml`。

## 改样式

全部在 `pptkit/theme.py`：

- `PRIMARY` / `ACCENT` / `HIGHLIGHT`：主色、强调色、提醒色
- `FONT_CN` / `FONT_EN`：中文字体（默认微软雅黑）和西文字体（默认 Arial）
- `SIZE_*`：各级字号

想加新版式，在 `pptkit/layouts.py` 的 `Deck` 类里加一个方法，再把名字加到 `build.py` 的 `LAYOUTS` 里。

## 注意

- **字体**：生成的文件指定了“微软雅黑”。Windows 上直接显示；Mac 上 PowerPoint 会自动替换成相近字体。`--preview` 的 PNG 用的是 Linux 上的替代字体，字距略有不同，以 PowerPoint 打开为准。
- **视频体积**：GitHub 单个文件上限 100 MB。视频大的话先压缩，例如：
  `ffmpeg -i 原视频.mp4 -vcodec libx264 -crf 26 -preset slow 压缩后.mp4`
- **生成后再手动微调**：完全可以。但下次重新生成会覆盖手动修改，所以要反复改的内容尽量写进 YAML。
