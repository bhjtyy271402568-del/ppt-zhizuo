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


# ====================================================================
# 工程汇报风格（meta.style: report）：照 MIT 航空航天系会议报告的模板
# 尺寸和颜色从那份 PDF 上量取：顶部 0.08 in 红条 + 灰色标题条（白字）+ 0.07 in 红线；
# 底部渐变灰页脚条，页码红色居中偏左，校徽贴在页脚右侧，参考文献在页脚左侧。
# ====================================================================
R_INK = RGBColor(0x11, 0x11, 0x11)       # 正文（MIT 用黑色，不用灰）
R_MID = RGBColor(0x40, 0x40, 0x40)       # 少量次要文字
R_FAINT = RGBColor(0x8C, 0x8C, 0x8C)     # 引线、占位框
R_RULE = RGBColor(0xBF, 0xBF, 0xBF)
R_ACCENT = RGBColor(0xA6, 0x01, 0x1C)    # MIT 红：标题条红线、页码、图上红色标注
R_COVER_RED = RGBColor(0xC0, 0x00, 0x00) # 封面红线
R_BAND = RGBColor(0x8A, 0x8B, 0x8C)      # 标题灰条
R_COVER_BAND = RGBColor(0x7F, 0x7F, 0x7F)
R_BLUE = RGBColor(0x1F, 0x4E, 0x9A)      # 图上蓝色标注
R_GREEN = RGBColor(0x1B, 0x7F, 0x3B)
R_PANEL = RGBColor(0xF2, 0xF2, 0xF2)     # 占位框底色

R_MARGIN = 0.55                          # 英寸
R_TOP_BAR, R_BAND_BOTTOM, R_RED_LINE = 0.08, 0.96, 0.07
R_TITLE_X = 0.96
R_FOOT_Y, R_FOOT_H = 6.86, 0.55
R_BODY_TOP, R_BODY_BOTTOM = 1.25, 6.75

R_SIZE_TITLE = Pt(28)
R_SIZE_BODY = Pt(18)
R_SIZE_SMALL = Pt(14)
R_SIZE_CAPTION = Pt(13)
R_SIZE_LABEL = Pt(14)
R_SIZE_NOTE = Pt(18)
R_SIZE_REF = Pt(10)
R_SIZE_PAGE = Pt(16)
