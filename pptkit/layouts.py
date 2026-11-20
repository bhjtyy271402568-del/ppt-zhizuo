"""版式库：每个函数往演示文稿里加一页。

所有版式都基于空白页自己画，不依赖 PowerPoint 模板文件，
这样样式完全由 theme.py 决定，换电脑打开也不会走样。
"""
from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from lxml import etree
from PIL import Image
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Pt

from . import theme as T

BLANK = 6  # 默认模板里第 7 个版式是“空白”


# ====================================================================
# 底层小工具
# ====================================================================
def _style_run(run, size, color=T.TEXT, bold=False):
    """给一段文字设字号、颜色、粗细，并同时指定中文和西文字体。"""
    f = run.font
    f.size = size
    f.bold = bold
    f.color.rgb = color
    f.name = T.FONT_EN  # 写入 <a:latin>
    rPr = run._r.get_or_add_rPr()
    latin = rPr.find(qn("a:latin"))
    ea = rPr.find(qn("a:ea"))
    if ea is None:
        ea = etree.SubElement(rPr, qn("a:ea"))
        latin.addnext(ea)  # XML 里 ea 必须紧跟在 latin 后面
    ea.set("typeface", T.FONT_CN)


_EMPH = re.compile(r"(\*\*.+?\*\*)")


def _write(paragraph, text, size, color=T.TEXT, bold=False):
    """写一段文字，支持 **加粗强调**：被两对星号包住的部分用橙色加粗。"""
    for piece in _EMPH.split(str(text)):
        if not piece:
            continue
        run = paragraph.add_run()
        if piece.startswith("**") and piece.endswith("**"):
            run.text = piece[2:-2]
            _style_run(run, size, T.HIGHLIGHT, True)
        else:
            run.text = piece
            _style_run(run, size, color, bold)


def _textbox(slide, left, top, width, height, anchor=MSO_ANCHOR.TOP):
    box = slide.shapes.add_textbox(left, top, width, height)
    tf = box.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = Emu(0)
    tf.margin_top = tf.margin_bottom = Emu(0)
    return tf


def _text(slide, left, top, width, height, text, size, color=T.TEXT,
          bold=False, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP):
    tf = _textbox(slide, left, top, width, height, anchor)
    lines = text if isinstance(text, list) else [text]
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        _write(p, line, size, color, bold)
    return tf


def _rect(slide, left, top, width, height, color):
    shp = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    shp.fill.solid()
    shp.fill.fore_color.rgb = color
    shp.line.fill.background()
    # 去掉 <p:style>：它会让形状继承主题里的阴影（effectRef），
    # 有的软件（如 LibreOffice、WPS）不认 <a:effectLst/> 的覆盖。
    style = shp._element.find(qn("p:style"))
    if style is not None:
        shp._element.remove(style)
    return shp


def _set_bullet(paragraph, level):
    """给段落加项目符号。文本框默认没有符号，要直接写 XML。"""
    pPr = paragraph._p.get_or_add_pPr()
    indent = Emu(285750)                       # 符号与文字的间距
    pPr.set("marL", str(int(indent * (level + 1))))
    pPr.set("indent", str(-int(indent)))
    for tag in ("a:buNone", "a:buChar", "a:buAutoNum"):
        for el in pPr.findall(qn(tag)):
            pPr.remove(el)
    buClr = etree.SubElement(pPr, qn("a:buClr"))
    clr = etree.SubElement(buClr, qn("a:srgbClr"))
    clr.set("val", str(T.ACCENT if level == 0 else T.MUTED))
    buFont = etree.SubElement(pPr, qn("a:buFont"))
    buFont.set("typeface", "Arial")
    bu = etree.SubElement(pPr, qn("a:buChar"))
    bu.set("char", "•" if level == 0 else "–")


def _bullets(slide, left, top, width, height, items, size=None):
    """items 是列表；列表里再嵌一个列表就是二级要点。"""
    tf = _textbox(slide, left, top, width, height)
    first = True

    def emit(seq, level):
        nonlocal first
        for it in seq:
            if isinstance(it, list):
                emit(it, level + 1)
                continue
            p = tf.paragraphs[0] if first else tf.add_paragraph()
            first = False
            _set_bullet(p, level)
            p.space_before = Pt(10 if level == 0 else 4)
            p.line_spacing = 1.15
            sz = size or (T.SIZE_BODY if level == 0 else T.SIZE_BODY_2)
            _write(p, it, sz, T.TEXT if level == 0 else T.MUTED)

    emit(items, 0)
    return tf


def _fit(img_w, img_h, box_l, box_t, box_w, box_h, valign="center"):
    """把图按原比例缩放到框里，水平居中；valign="top" 时贴顶。
    返回 (left, top, width, height)。"""
    scale = min(box_w / img_w, box_h / img_h)
    w, h = int(img_w * scale), int(img_h * scale)
    top = box_t if valign == "top" else box_t + (box_h - h) // 2
    return box_l + (box_w - w) // 2, top, w, h


def _picture(slide, path, box_l, box_t, box_w, box_h, valign="center"):
    with Image.open(path) as im:
        iw, ih = im.size
    l, t, w, h = _fit(iw, ih, box_l, box_t, box_w, box_h, valign)
    return slide.shapes.add_picture(str(path), l, t, w, h)


CAPTION_H = Emu(400000)


def _caption_below(slide, shape, text, left, width):
    """图注紧贴在图片（或视频）正下方。"""
    _text(slide, left, shape.top + shape.height + Emu(90000), width, CAPTION_H,
          text, T.SIZE_CAPTION, T.MUTED, align=PP_ALIGN.CENTER)


def _notes(slide, notes):
    if notes:
        slide.notes_slide.notes_text_frame.text = str(notes).strip()


# ====================================================================
# 内容页的公共框架：标题 + 页脚 + 页码
# ====================================================================
class Deck:
    """包一层 Presentation，记住页脚文字和页码。"""

    def __init__(self, footer: str = ""):
        from pptx import Presentation

        self.prs = Presentation()
        self.prs.slide_width = T.SLIDE_W
        self.prs.slide_height = T.SLIDE_H
        self.footer = footer

    @property
    def body_w(self):
        return T.SLIDE_W - 2 * T.MARGIN_X

    def _new(self):
        return self.prs.slides.add_slide(self.prs.slide_layouts[BLANK])

    def _content_slide(self, title):
        s = self._new()
        # 标题左侧的竖条：给每页一个固定的视觉锚点
        _rect(s, T.MARGIN_X, T.TITLE_TOP + Emu(150000), Emu(76200),
              T.TITLE_H - Emu(300000), T.ACCENT)
        _text(s, T.MARGIN_X + Emu(228600), T.TITLE_TOP, self.body_w - Emu(228600),
              T.TITLE_H, title, T.SIZE_TITLE, T.PRIMARY, True,
              anchor=MSO_ANCHOR.MIDDLE)
        # 标题下的细分隔线
        _rect(s, T.MARGIN_X, T.TITLE_TOP + T.TITLE_H + Emu(60000), self.body_w,
              Emu(9525), T.LIGHT_BG)
        # 页脚
        n = len(self.prs.slides)
        y = T.SLIDE_H - Emu(480000)
        if self.footer:
            _text(s, T.MARGIN_X, y, self.body_w // 2, Emu(300000), self.footer,
                  T.SIZE_FOOTER, T.MUTED)
        _text(s, T.SLIDE_W // 2, y, T.SLIDE_W // 2 - T.MARGIN_X, Emu(300000),
              str(n), T.SIZE_FOOTER, T.MUTED, align=PP_ALIGN.RIGHT)
        return s

    # ----------------------------------------------------------------
    # 版式
    # ----------------------------------------------------------------
    def cover(self, title, subtitle=None, author=None, org=None, date=None, notes=None):
        s = self._new()
        _rect(s, 0, 0, T.SLIDE_W, T.SLIDE_H, T.PRIMARY)
        _rect(s, T.MARGIN_X, Emu(3350000), Emu(1200000), Emu(57150), T.ACCENT)
        _text(s, T.MARGIN_X, Emu(1500000), self.body_w, Emu(1750000), title,
              T.SIZE_COVER_TITLE, T.WHITE, True, anchor=MSO_ANCHOR.BOTTOM)
        if subtitle:
            _text(s, T.MARGIN_X, Emu(3550000), self.body_w, Emu(700000), subtitle,
                  T.SIZE_COVER_SUB, T.WHITE)
        meta = [x for x in (author, org, date) if x]
        if meta:
            _text(s, T.MARGIN_X, Emu(5300000), self.body_w, Emu(900000), meta,
                  T.SIZE_BODY_2, T.ON_DARK)
        _notes(s, notes)
        return s

    def section(self, title, number=None, subtitle=None, notes=None):
        s = self._new()
        panel_w = Emu(3600000)
        _rect(s, 0, 0, panel_w, T.SLIDE_H, T.PRIMARY)
        if number is not None:
            _text(s, 0, 0, panel_w, T.SLIDE_H, f"{int(number):02d}", Pt(96),
                  T.WHITE, True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
        left = panel_w + Emu(700000)
        _text(s, left, Emu(2400000), T.SLIDE_W - left - T.MARGIN_X, Emu(1100000),
              title, T.SIZE_SECTION, T.PRIMARY, True, anchor=MSO_ANCHOR.BOTTOM)
        _rect(s, left, Emu(3650000), Emu(900000), Emu(57150), T.ACCENT)
        if subtitle:
            _text(s, left, Emu(3850000), T.SLIDE_W - left - T.MARGIN_X, Emu(900000),
                  subtitle, T.SIZE_BODY, T.MUTED)
        _notes(s, notes)
        return s

    def bullets(self, title, items, note=None, notes=None):
        s = self._content_slide(title)
        bottom = T.BODY_BOTTOM - (Emu(500000) if note else 0)
        _bullets(s, T.MARGIN_X, T.BODY_TOP, self.body_w, bottom - T.BODY_TOP, items)
        if note:
            self._callout(s, note)
        _notes(s, notes)
        return s

    def image(self, title, image, caption=None, bullets=None, notes=None):
        s = self._content_slide(title)
        cap_h = CAPTION_H if caption else 0
        box_h = T.BODY_BOTTOM - T.BODY_TOP - cap_h
        if bullets:
            # 左图右文：图片贴顶，和右侧第一条要点对齐
            img_w = int(self.body_w * 0.58)
            gap = Emu(380000)
            pic = _picture(s, image, T.MARGIN_X, T.BODY_TOP, img_w, box_h, "top")
            _bullets(s, T.MARGIN_X + img_w + gap, T.BODY_TOP,
                     self.body_w - img_w - gap, T.BODY_BOTTOM - T.BODY_TOP, bullets,
                     size=T.SIZE_BODY_2)
            cap_l, cap_w = T.MARGIN_X, img_w
        else:
            pic = _picture(s, image, T.MARGIN_X, T.BODY_TOP, self.body_w, box_h)
            cap_l, cap_w = T.MARGIN_X, self.body_w
        if caption:
            _caption_below(s, pic, caption, cap_l, cap_w)
        _notes(s, notes)
        return s

    def two_column(self, title, left, right, notes=None):
        s = self._content_slide(title)
        gap = Emu(457200)
        col_w = (self.body_w - gap) // 2
        for i, col in enumerate((left, right)):
            x = T.MARGIN_X + i * (col_w + gap)
            y = T.BODY_TOP
            if col.get("heading"):
                _rect(s, x, y, col_w, Emu(520000), T.LIGHT_BG)
                _text(s, x + Emu(160000), y, col_w - Emu(320000), Emu(520000),
                      col["heading"], T.SIZE_BODY, T.PRIMARY, True,
                      anchor=MSO_ANCHOR.MIDDLE)
                y += Emu(620000)
            h = T.BODY_BOTTOM - y
            if col.get("image"):
                cap_h = CAPTION_H if col.get("caption") else 0
                pic = _picture(s, col["image"], x, y, col_w, h - cap_h, "top")
                if col.get("caption"):
                    _caption_below(s, pic, col["caption"], x, col_w)
            elif col.get("items"):
                _bullets(s, x, y, col_w, h, col["items"], size=T.SIZE_BODY_2)
        _notes(s, notes)
        return s

    def table(self, title, rows, caption=None, col_widths=None, notes=None):
        s = self._content_slide(title)
        n_rows, n_cols = len(rows), max(len(r) for r in rows)
        cap_h = Emu(400000) if caption else 0
        row_h = Emu(480000)
        height = min(row_h * n_rows, T.BODY_BOTTOM - T.BODY_TOP - cap_h)
        gf = s.shapes.add_table(n_rows, n_cols, T.MARGIN_X, T.BODY_TOP,
                                self.body_w, height)
        tbl = gf.table
        # 去掉默认表格样式，自己上色
        tblPr = gf._element.graphic.graphicData.tbl.tblPr
        tblPr.set("bandRow", "0")
        tblPr.set("firstRow", "0")
        if col_widths:
            total = sum(col_widths)
            for j, wgt in enumerate(col_widths):
                tbl.columns[j].width = int(self.body_w * wgt / total)
        for i, row in enumerate(rows):
            for j in range(n_cols):
                cell = tbl.cell(i, j)
                cell.fill.solid()
                if i == 0:
                    cell.fill.fore_color.rgb = T.PRIMARY
                else:
                    cell.fill.fore_color.rgb = T.LIGHT_BG if i % 2 == 0 else T.WHITE
                cell.vertical_anchor = MSO_ANCHOR.MIDDLE
                cell.margin_left = cell.margin_right = Emu(91440)
                tf = cell.text_frame
                tf.word_wrap = True
                p = tf.paragraphs[0]
                p.alignment = PP_ALIGN.CENTER
                val = row[j] if j < len(row) else ""
                _write(p, val, T.SIZE_TABLE, T.WHITE if i == 0 else T.TEXT, i == 0)
        if caption:
            _text(s, T.MARGIN_X, T.BODY_TOP + height + Emu(120000), self.body_w,
                  cap_h, caption, T.SIZE_CAPTION, T.MUTED, align=PP_ALIGN.CENTER)
        _notes(s, notes)
        return s

    def video(self, title, video, poster=None, caption=None, notes=None):
        s = self._content_slide(title)
        cap_h = CAPTION_H if caption else 0
        vw, vh = _video_size(video)
        l, t, w, h = _fit(vw, vh, T.MARGIN_X, T.BODY_TOP, self.body_w,
                          T.BODY_BOTTOM - T.BODY_TOP - cap_h)
        poster = poster or _grab_frame(video)
        movie = s.shapes.add_movie(str(video), l, t, w, h,
                                   poster_frame_image=str(poster) if poster else None,
                                   mime_type="video/mp4")
        if caption:
            _caption_below(s, movie, caption, T.MARGIN_X, self.body_w)
        _notes(s, notes)
        return s

    def end(self, title="谢谢", subtitle="敬请各位老师批评指正", notes=None):
        s = self._new()
        _rect(s, 0, 0, T.SLIDE_W, T.SLIDE_H, T.PRIMARY)
        _text(s, 0, Emu(2300000), T.SLIDE_W, Emu(1200000), title, Pt(54), T.WHITE,
              True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.BOTTOM)
        _rect(s, (T.SLIDE_W - Emu(900000)) // 2, Emu(3700000), Emu(900000),
              Emu(57150), T.ACCENT)
        if subtitle:
            _text(s, 0, Emu(3950000), T.SLIDE_W, Emu(700000), subtitle,
                  T.SIZE_COVER_SUB, T.ON_DARK, align=PP_ALIGN.CENTER)
        _notes(s, notes)
        return s

    # ----------------------------------------------------------------
    def _callout(self, s, text):
        """页面底部的结论条：一句话告诉观众这一页要记住什么。"""
        y = T.BODY_BOTTOM - Emu(420000)
        _rect(s, T.MARGIN_X, y, Emu(57150), Emu(420000), T.HIGHLIGHT)
        _text(s, T.MARGIN_X + Emu(200000), y, self.body_w - Emu(200000), Emu(420000),
              text, T.SIZE_BODY_2, T.TEXT, True, anchor=MSO_ANCHOR.MIDDLE)

    def save(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.prs.save(str(path))


# ====================================================================
# 视频辅助：用 ffprobe 读尺寸，用 ffmpeg 截封面帧（没装就跳过）
# ====================================================================
def _video_size(path):
    if shutil.which("ffprobe"):
        try:
            out = subprocess.run(
                ["ffprobe", "-v", "error", "-select_streams", "v:0",
                 "-show_entries", "stream=width,height", "-of", "csv=p=0", str(path)],
                capture_output=True, text=True, timeout=30, check=True).stdout
            w, h = (int(x) for x in out.strip().split(",")[:2])
            return w, h
        except Exception:
            pass
    return 16, 9


def _grab_frame(path):
    if not shutil.which("ffmpeg"):
        return None
    out = Path(tempfile.mkdtemp()) / "poster.png"
    try:
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "0.5", "-i",
                        str(path), "-frames:v", "1", str(out)],
                       check=True, timeout=60)
        return out if out.exists() else None
    except Exception:
        return None
