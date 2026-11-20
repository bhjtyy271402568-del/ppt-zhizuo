"""全局样式：颜色、字体、字号、页面尺寸。

这里是整套 PPT 的“样式表”。所有版式都从这里取值，
所以想换配色或字体，只改这一个文件，所有 deck 重新生成后就都变了。
"""
from pptx.dml.color import RGBColor
from pptx.util import Emu, Pt

# ---------- 页面 ----------
# 16:9 宽屏。PowerPoint 内部单位是 EMU（English Metric Unit），1 英寸 = 914400 EMU。
SLIDE_W = Emu(12192000)   # 13.333 in
SLIDE_H = Emu(6858000)    # 7.5 in

# ---------- 颜色 ----------
# 一套颜色只保留“主色 + 强调色 + 灰阶”，页面才显得统一。
PRIMARY = RGBColor(0x1F, 0x3A, 0x5F)     # 深蓝：标题、色块
ACCENT = RGBColor(0x2E, 0x86, 0xC1)      # 亮蓝：强调线、编号
HIGHLIGHT = RGBColor(0xD9, 0x6C, 0x1E)   # 橙：需要观众注意的数字或结论
TEXT = RGBColor(0x22, 0x22, 0x22)        # 正文
MUTED = RGBColor(0x6B, 0x72, 0x80)       # 次要文字：图注、页脚
LIGHT_BG = RGBColor(0xF3, 0xF5, 0xF8)    # 浅灰底：表格隔行、卡片
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
ON_DARK = RGBColor(0xC9, 0xD6, 0xE8)    # 深色底上的次要文字

# ---------- 字体 ----------
# 中文和西文要分别指定：PowerPoint 对汉字用 East Asian 字体，对字母数字用 Latin 字体。
FONT_CN = "微软雅黑"
FONT_EN = "Arial"

# ---------- 字号 ----------
SIZE_COVER_TITLE = Pt(40)
SIZE_COVER_SUB = Pt(22)
SIZE_SECTION = Pt(36)
SIZE_TITLE = Pt(28)       # 内容页标题
SIZE_BODY = Pt(20)        # 一级要点
SIZE_BODY_2 = Pt(17)      # 二级要点
SIZE_CAPTION = Pt(13)     # 图注
SIZE_FOOTER = Pt(11)
SIZE_TABLE = Pt(15)

# ---------- 版心 ----------
# 四周留白统一，所有版式都在这个框里排。
MARGIN_X = Emu(609600)     # 0.667 in
TITLE_TOP = Emu(380000)
TITLE_H = Emu(760000)
BODY_TOP = Emu(1400000)    # 标题下方内容区起点
BODY_BOTTOM = Emu(6250000) # 页脚上方
