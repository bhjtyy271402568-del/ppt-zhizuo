"""工程汇报风格（meta.style: report）。

和 layouts.py 的套版式思路不同：内容页用 canvas 版式，每个元素（图、文字、表格、
标注、箭头、占位框、图表）在 content.yaml 里按英寸坐标摆放。工程汇报一页一图、
构图各不相同，固定版式反而限制表达；样式（字体、颜色、字号、线宽）仍然全部来自 theme.py。
"""
from __future__ import annotations

import math
import re
from pathlib import Path

from lxml import etree
from PIL import Image
from pptx import Presentation
from pptx.chart.data import CategoryChartData, XyChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

from . import theme as T
from .layouts import _style_run

IN = 914400
COLORS = {"ink": "R_INK", "mid": "R_MID", "faint": "R_FAINT", "accent": "R_ACCENT", "red": "R_ACCENT",
          "blue": "R_BLUE", "green": "R_GREEN", "white": "WHITE"}
ALIGN = {"left": PP_ALIGN.LEFT, "center": PP_ALIGN.CENTER, "right": PP_ALIGN.RIGHT}
ANCHOR = {"top": MSO_ANCHOR.TOP, "middle": MSO_ANCHOR.MIDDLE, "bottom": MSO_ANCHOR.BOTTOM}


def _c(name):
    if isinstance(name, RGBColor):
        return name
    return getattr(T, COLORS.get(name, name))


def _i(v):
    return int(round(v * IN))


_EMPH = re.compile(r"(\*\*.+?\*\*|__.+?__)")


def _rich(p, text, size, color, bold=False):
    """**文字**：激光红加粗（关键数字）；__文字__：只加粗。"""
    for piece in _EMPH.split(str(text)):
        if not piece:
            continue
        r = p.add_run()
        if piece.startswith("**"):
            r.text = piece[2:-2]
            _style_run(r, size, T.R_ACCENT, True)
        elif piece.startswith("__"):
            r.text = piece[2:-2]
            _style_run(r, size, color, True)
        else:
            r.text = piece
            _style_run(r, size, color, bold)


def _est_width(text, size_pt):
    """估算一行文字宽度（英寸）：汉字 1 个字号宽，字母数字约 0.55 个。"""
    em = 0.0
    for ch in str(text).replace("**", "").replace("__", ""):
        em += 1.0 if ord(ch) >= 0x2E80 else (0.3 if ch == " " else 0.62)
    return em * size_pt / 72


def _box(slide, x, y, w, h, anchor="top"):
    tb = slide.shapes.add_textbox(_i(x), _i(y), _i(w), _i(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = ANCHOR[anchor]
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    return tf


def _no_style(shape):
    st = shape._element.find(qn("p:style"))
    if st is not None:
        shape._element.remove(st)


def _rect(slide, x, y, w, h, fill=None, line=None, lw=0.75, dash=False):
    s = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, _i(x), _i(y), _i(w), _i(h))
    if fill is None:
        s.fill.background()
    else:
        s.fill.solid()
        s.fill.fore_color.rgb = _c(fill)
    if line is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = _c(line)
        s.line.width = Pt(lw)
        if dash:
            s.line.dash_style = 7  # MSO_LINE.DASH
    _no_style(s)
    return s


def _line(slide, x1, y1, x2, y2, color="faint", lw=0.75, head=False):
    c = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, _i(x1), _i(y1), _i(x2), _i(y2))
    c.line.color.rgb = _c(color)
    c.line.width = Pt(lw)
    _no_style(c)
    if head:
        ln = c.line._get_or_add_ln()
        tail = etree.SubElement(ln, qn("a:tailEnd"))
        tail.set("type", "triangle")
        tail.set("w", "med")
        tail.set("len", "med")
    return c


def _cell_borders(cell, top=None, bottom=None):
    tcPr = cell._tc.get_or_add_tcPr()
    for tag in ("a:lnL", "a:lnR", "a:lnT", "a:lnB"):
        for el in tcPr.findall(qn(tag)):
            tcPr.remove(el)
    for i, (side, spec) in enumerate((("L", None), ("R", None), ("T", top), ("B", bottom))):
        ln = etree.Element(qn(f"a:ln{side}"))
        if spec is None:
            ln.set("w", "0")
            etree.SubElement(ln, qn("a:noFill"))
        else:
            w, color = spec
            ln.set("w", str(int(w)))
            sf = etree.SubElement(ln, qn("a:solidFill"))
            etree.SubElement(sf, qn("a:srgbClr")).set("val", str(color))
        tcPr.insert(i, ln)


class ReportDeck:
    def __init__(self, footer="", logo=None, base=Path(".")):
        self.prs = Presentation()
        self.prs.slide_width = T.SLIDE_W
        self.prs.slide_height = T.SLIDE_H
        self.footer = footer
        self.base = Path(base)
        self.logo = self.base / logo if logo else None
        self.W = T.SLIDE_W / IN
        self.H = T.SLIDE_H / IN

    def _path(self, p):
        return self.base / p

    def _new(self):
        return self.prs.slides.add_slide(self.prs.slide_layouts[6])

    # ----------------------------------------------------------------
    # MIT 模板的外框：顶部红条 + 灰色标题条（白字）+ 红线；底部渐变页脚条 + 页码 + 校徽
    # ----------------------------------------------------------------
    def _chrome(self, s, title):
        W = self.W
        _rect(s, 0, 0, W, T.R_TOP_BAR, fill=T.R_ACCENT)
        _rect(s, 0, T.R_TOP_BAR, W, T.R_BAND_BOTTOM - T.R_TOP_BAR, fill=T.R_BAND)
        _rect(s, 0, T.R_BAND_BOTTOM, W, T.R_RED_LINE, fill=T.R_ACCENT)
        tw = W - T.R_TITLE_X - 0.4
        size = T.R_SIZE_TITLE
        for cand in (T.R_SIZE_TITLE, Pt(26), Pt(24)):
            size = cand
            if _est_width(title, cand.pt) <= tw:
                break
        if _est_width(title, size.pt) > tw:
            print(f"  [提醒] 第 {len(self.prs.slides)} 页标题可能放不下一行：{title}")
        tf = _box(s, T.R_TITLE_X, T.R_TOP_BAR, tw, T.R_BAND_BOTTOM - T.R_TOP_BAR, "middle")
        _rich(tf.paragraphs[0], title, size, T.WHITE, False)
        self._footer(s)

    def _footer(self, s):
        W, y, h = self.W, T.R_FOOT_Y, T.R_FOOT_H
        band = _rect(s, 0, y, W, h, fill=T.R_BAND)
        # 渐变：右上浅、左下深（PDF 上量得：左 178 → 右 237，上 205 → 下 150）
        spPr = band._element.spPr
        for tag in ("a:solidFill", "a:noFill", "a:gradFill"):
            for el in spPr.findall(qn(tag)):
                spPr.remove(el)
        grad = etree.Element(qn("a:gradFill"))
        grad.set("rotWithShape", "1")
        gs = etree.SubElement(grad, qn("a:gsLst"))
        for pos, col in ((0, "F1F1F1"), (100000, "959697")):
            g = etree.SubElement(gs, qn("a:gs"))
            g.set("pos", str(pos))
            etree.SubElement(g, qn("a:srgbClr")).set("val", col)
        lin = etree.SubElement(grad, qn("a:lin"))
        lin.set("ang", str(int(92.4 * 60000)))
        lin.set("scaled", "0")
        spPr.insert(1, grad)
        # 页码：红色，居中偏左（MIT 在 6.45 in）
        tf = _box(s, 6.05, y, 0.8, h, "middle")
        tf.paragraphs[0].alignment = PP_ALIGN.CENTER
        _rich(tf.paragraphs[0], str(len(self.prs.slides)), T.R_SIZE_PAGE, T.R_ACCENT)
        if self.logo and self.logo.exists():
            with Image.open(self.logo) as im:
                iw, ih = im.size
            lh = 0.50
            lw = lh * iw / ih
            s.shapes.add_picture(str(self.logo), _i(W - 0.23 - lw), _i(y + 0.02), _i(lw), _i(lh))

    # ================================================================
    # 版式
    # ================================================================
    def cover(self, title, authors=None, affiliation=None, event=None, date=None,
              logo=None, notes=None):
        """MIT 封面：上方居中校徽；中间灰色标题带（上下红线、白色粗体标题）；
        下方作者、单位；底部汇报场合与日期。"""
        s = self._new()
        W = self.W
        if logo:
            p = self._path(logo)
            with Image.open(p) as im:
                iw, ih = im.size
            h = 1.25
            w = h * iw / ih
            s.shapes.add_picture(str(p), _i((W - w) / 2), _i(0.62), _i(w), _i(h))
        _rect(s, 0, 2.39, W, 0.07, fill=T.R_COVER_RED)
        _rect(s, 0, 2.46, W, 2.20, fill=T.R_COVER_BAND)
        _rect(s, 0, 4.66, W, 0.07, fill=T.R_COVER_RED)
        tf = _box(s, 0.45, 2.46, W - 0.9, 2.20, "middle")
        for k, part in enumerate(str(title).split("<br>")):
            p = tf.paragraphs[0] if k == 0 else tf.add_paragraph()
            p.alignment = PP_ALIGN.CENTER
            p.line_spacing = 1.08
            _rich(p, part, Pt(40), T.WHITE, True)
        y = 5.0
        if authors:
            tf = _box(s, 0, y, W, 0.45, "middle")
            tf.paragraphs[0].alignment = PP_ALIGN.CENTER
            _rich(tf.paragraphs[0], authors, Pt(22), T.R_INK)
            y += 0.48
        if affiliation:
            tf = _box(s, 0, y, W, 0.35, "middle")
            tf.paragraphs[0].alignment = PP_ALIGN.CENTER
            _rich(tf.paragraphs[0], affiliation, Pt(16), T.R_INK)
        lines = [x for x in (event, date) if x]
        if lines:
            tf = _box(s, 0, 6.28, W, 0.7, "middle")
            for k, ln in enumerate(lines):
                p = tf.paragraphs[0] if k == 0 else tf.add_paragraph()
                p.alignment = PP_ALIGN.CENTER
                p.space_before = Pt(4) if k else Pt(0)
                _rich(p, ln, Pt(18), T.R_INK)
        self._notes(s, notes)
        return s

    def end(self, title="谢谢", subtitle="敬请批评指正", logo=None, notes=None):
        s = self._new()
        W = self.W
        if logo:
            p = self._path(logo)
            with Image.open(p) as im:
                iw, ih = im.size
            h = 1.25
            w = h * iw / ih
            s.shapes.add_picture(str(p), _i((W - w) / 2), _i(0.62), _i(w), _i(h))
        _rect(s, 0, 2.39, W, 0.07, fill=T.R_COVER_RED)
        _rect(s, 0, 2.46, W, 2.20, fill=T.R_COVER_BAND)
        _rect(s, 0, 4.66, W, 0.07, fill=T.R_COVER_RED)
        tf = _box(s, 0, 2.46, W, 2.20, "middle")
        tf.paragraphs[0].alignment = PP_ALIGN.CENTER
        _rich(tf.paragraphs[0], title, Pt(44), T.WHITE, True)
        if subtitle:
            tf = _box(s, 0, 5.1, W, 0.5, "middle")
            tf.paragraphs[0].alignment = PP_ALIGN.CENTER
            _rich(tf.paragraphs[0], subtitle, Pt(20), T.R_INK)
        self._notes(s, notes)
        return s

    def canvas(self, title, items=(), note=None, refs=None, notes=None):
        s = self._new()
        self._chrome(s, title)
        for it in items:
            getattr(self, "_" + it["type"])(s, it)
        if note:
            self._note(s, note)
        if refs:
            self._refs(s, refs)
        self._notes(s, notes)
        return s

    # ================================================================
    # canvas 元素
    # ================================================================
    def _image(self, s, it):
        p = self._path(it["src"])
        with Image.open(p) as im:
            iw, ih = im.size
        x, y = it["x"], it["y"]
        if "w" in it and "h" in it:
            sc = min(it["w"] / iw, it["h"] / ih)
            w, h = iw * sc, ih * sc
            x += (it["w"] - w) / 2 if it.get("halign", "center") == "center" else 0
            if it.get("valign", "top") == "middle":
                y += (it["h"] - h) / 2
        elif "w" in it:
            w, h = it["w"], it["w"] * ih / iw
        else:
            h = it["h"]
            w = h * iw / ih
        pic = s.shapes.add_picture(str(p), _i(x), _i(y), _i(w), _i(h))
        if it.get("border"):
            pic.line.color.rgb = T.R_RULE
            pic.line.width = Pt(0.75)
        if it.get("caption"):
            cw = max(w, it.get("cap_w", 0))
            cx = x + (w - cw) / 2
            tf = _box(s, cx, y + h + 0.06, cw, 0.4)
            tf.paragraphs[0].alignment = PP_ALIGN.CENTER
            _rich(tf.paragraphs[0], it["caption"], Pt(it.get("cap_size", 13)), T.R_INK)
        return pic

    def _text(self, s, it):
        tf = _box(s, it["x"], it["y"], it["w"], it.get("h", 0.5), it.get("anchor", "top"))
        lines = it["text"] if isinstance(it["text"], list) else [it["text"]]
        size = Pt(it.get("size", 16))
        for k, ln in enumerate(lines):
            p = tf.paragraphs[0] if k == 0 else tf.add_paragraph()
            p.alignment = ALIGN[it.get("align", "left")]
            p.line_spacing = it.get("spacing", 1.15)
            if k and it.get("gap"):
                p.space_before = Pt(it["gap"])
            _rich(p, ln, size, _c(it.get("color", "ink")), it.get("bold", False))

    def _bullets(self, s, it):
        tf = _box(s, it["x"], it["y"], it["w"], it.get("h", 2.0))
        size = Pt(it.get("size", 16))
        first = True

        def emit(seq, level):
            nonlocal first
            for item in seq:
                if isinstance(item, list):
                    emit(item, level + 1)
                    continue
                p = tf.paragraphs[0] if first else tf.add_paragraph()
                first = False
                pPr = p._p.get_or_add_pPr()
                ind = 0.2 if level == 0 else 0.18
                pPr.set("marL", str(_i(ind + 0.22 * level)))
                pPr.set("indent", str(-_i(ind)))
                bc = etree.SubElement(pPr, qn("a:buClr"))
                etree.SubElement(bc, qn("a:srgbClr")).set("val", str(T.R_MID))
                etree.SubElement(pPr, qn("a:buFont")).set("typeface", "Arial")
                etree.SubElement(pPr, qn("a:buChar")).set("char", "•" if level == 0 else "–")
                p.space_before = Pt(it.get("gap", 6) if level == 0 else 2)
                p.line_spacing = 1.12
                sz = size if level == 0 else Pt(size.pt - 2)
                _rich(p, item, sz, T.R_INK if level == 0 else T.R_MID)

        emit(it["items"], 0)

    def _table(self, s, it):
        rows = it["rows"]
        nr, nc = len(rows), max(len(r) for r in rows)
        rh = it.get("row_h", 0.36)
        gf = s.shapes.add_table(nr, nc, _i(it["x"]), _i(it["y"]), _i(it["w"]), _i(rh * nr))
        tbl = gf.table
        el = gf._element.graphic.graphicData.tbl
        el.tblPr.set("bandRow", "0")
        el.tblPr.set("firstRow", "0")
        sid = el.tblPr.find(qn("a:tableStyleId"))
        if sid is not None:
            el.tblPr.remove(sid)
        if it.get("widths"):
            tot = sum(it["widths"])
            for j, wg in enumerate(it["widths"]):
                tbl.columns[j].width = _i(it["w"] * wg / tot)
        for r in range(nr):
            tbl.rows[r].height = _i(rh)
        size = Pt(it.get("size", 13))
        style = it.get("style", "three_line")
        thick, thin = (Pt(1.25), T.R_INK), (Pt(0.6), T.R_INK)
        aligns = it.get("align")
        hl = set(map(int, it.get("highlight_rows", [])))
        for r, row in enumerate(rows):
            for j in range(nc):
                cell = tbl.cell(r, j)
                cell.fill.background()
                head = r == 0 and style != "plain"
                if style == "three_line":
                    top = thick if r == 0 else thin if r == 1 else None
                    bot = thin if r == 0 else thick if r == nr - 1 else None
                    _cell_borders(cell, top, bot)
                else:
                    _cell_borders(cell)
                cell.vertical_anchor = MSO_ANCHOR.MIDDLE
                cell.margin_left = cell.margin_right = Emu(_i(0.06))
                cell.margin_top = cell.margin_bottom = Emu(_i(0.02))
                tf = cell.text_frame
                tf.word_wrap = True
                p = tf.paragraphs[0]
                a = aligns[j] if aligns else ("left" if j == 0 else "center")
                p.alignment = ALIGN[a]
                val = row[j] if j < len(row) else ""
                if style == "plain":
                    color = T.R_MID if j == 0 else T.R_INK
                    _rich(p, val, size, color, False)
                else:
                    color = T.R_ACCENT if r in hl else T.R_INK
                    _rich(p, val, size, color, head or r in hl)
        return gf

    def _label(self, s, it):
        """图上标注：文字 + 可选引线（to: [x, y] 指向的点）。"""
        size = Pt(it.get("size", 12))
        w = it.get("w", 1.8)
        align = it.get("align", "left")
        x = it["x"] - (w if align == "right" else w / 2 if align == "center" else 0)
        tf = _box(s, x, it["y"], w, 0.3, "middle")
        tf.paragraphs[0].alignment = ALIGN[align]
        _rich(tf.paragraphs[0], it["text"], size, _c(it.get("color", "ink")), it.get("bold", False))
        if it.get("to"):
            fx = it.get("from", [it["x"], it["y"] + 0.15])
            _line(s, fx[0], fx[1], it["to"][0], it["to"][1], color="faint", lw=0.75)
            dot = s.shapes.add_shape(MSO_SHAPE.OVAL, _i(it["to"][0] - 0.025), _i(it["to"][1] - 0.025), _i(0.05), _i(0.05))
            dot.fill.solid()
            dot.fill.fore_color.rgb = T.R_FAINT
            dot.line.fill.background()
            _no_style(dot)

    def _arrow(self, s, it):
        (x1, y1), (x2, y2) = it["from"], it["to"]
        _line(s, x1, y1, x2, y2, color=it.get("color", "ink"), lw=it.get("lw", 2.0), head=True)
        if it.get("text"):
            w = it.get("w", 1.4)
            tf = _box(s, (x1 + x2) / 2 - w / 2, min(y1, y2) - 0.62, w, 0.56, "bottom")
            lines = it["text"] if isinstance(it["text"], list) else [it["text"]]
            for k, ln in enumerate(lines):
                p = tf.paragraphs[0] if k == 0 else tf.add_paragraph()
                p.alignment = PP_ALIGN.CENTER
                _rich(p, ln, Pt(it.get("size", 12)), T.R_INK, True)

    def _placeholder(self, s, it):
        """待补内容的占位框（如 Zemax 结果），虚线框 + 说明。"""
        _rect(s, it["x"], it["y"], it["w"], it["h"], fill=T.R_PANEL, line=T.R_FAINT, lw=1, dash=True)
        tf = _box(s, it["x"] + 0.2, it["y"], it["w"] - 0.4, it["h"], "middle")
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        _rich(p, it.get("title", "待补"), Pt(it.get("size", 14)), T.R_MID, True)
        for ln in ([it["note"]] if isinstance(it.get("note"), str) else it.get("note", [])):
            q = tf.add_paragraph()
            q.alignment = PP_ALIGN.CENTER
            q.space_before = Pt(4)
            _rich(q, ln, T.R_SIZE_CAPTION, T.R_FAINT)

    def _rule(self, s, it):
        _rect(s, it["x"], it["y"], it.get("w", 0.01), it.get("h", 0.01), fill=it.get("color", "R_RULE"))

    def _chart(self, s, it):
        kind = it.get("kind", "bar")
        if kind == "bar":
            data = CategoryChartData()
            data.categories = it["categories"]
            for se in it["series"]:
                data.add_series(se["name"], se["values"])
            ct = XL_CHART_TYPE.COLUMN_CLUSTERED
        else:
            data = XyChartData()
            for se in it["series"]:
                ser = data.add_series(se["name"])
                for xv, yv in zip(se["x"], se["y"]):
                    ser.add_data_point(xv, yv)
            ct = XL_CHART_TYPE.XY_SCATTER_LINES_NO_MARKERS
        gf = s.shapes.add_chart(ct, _i(it["x"]), _i(it["y"]), _i(it["w"]), _i(it["h"]), data)
        ch = gf.chart
        ch.has_title = False
        ch.font.size = Pt(it.get("size", 11))
        ch.font.color.rgb = T.R_MID
        ch.font.name = T.FONT_EN
        ch.has_legend = len(it["series"]) > 1
        if ch.has_legend:
            ch.legend.position = XL_LEGEND_POSITION.TOP
            ch.legend.include_in_layout = False
        va, ca = ch.value_axis, ch.category_axis
        va.has_major_gridlines = True
        va.major_gridlines.format.line.color.rgb = RGBColor(0xE6, 0xE9, 0xED)
        va.format.line.fill.background()
        ca.format.line.color.rgb = T.R_FAINT
        ca.has_major_gridlines = False
        va.tick_labels.font.size = Pt(it.get("size", 11))
        ca.tick_labels.font.size = Pt(it.get("size", 11))
        if "y_max" in it:
            va.maximum_scale = it["y_max"]
        if "y_min" in it:
            va.minimum_scale = it["y_min"]
        if "x_max" in it:
            ca.maximum_scale = it["x_max"]
        if "x_min" in it:
            ca.minimum_scale = it["x_min"]
        for ax, key in ((va, "y_title"), (ca, "x_title")):
            if it.get(key):
                ax.has_title = True
                ax.axis_title.text_frame.text = it[key]
                r = ax.axis_title.text_frame.paragraphs[0].runs[0]
                _style_run(r, Pt(it.get("size", 11)), T.R_MID)
        for k, se in enumerate(it["series"]):
            ser = ch.plots[0].series[k]
            col = _c(se.get("color", "ink"))
            if kind == "bar":
                ser.format.fill.solid()
                ser.format.fill.fore_color.rgb = col
                ch.plots[0].gap_width = it.get("gap", 60)
            else:
                ser.format.line.color.rgb = col
                ser.format.line.width = Pt(se.get("lw", 2))
                ser.smooth = True
                if se.get("dash"):
                    ser.format.line.dash_style = 7
        if it.get("labels") and kind == "bar":
            pl = ch.plots[0]
            pl.has_data_labels = True
            pl.data_labels.font.size = Pt(it.get("size", 11) - 1)
            pl.data_labels.font.color.rgb = T.R_MID
            pl.data_labels.number_format = it.get("fmt", "0.0")
            pl.data_labels.number_format_is_linked = False
        return gf

    def _note(self, s, text):
        """页底关键结论：黑色粗体（MIT 范例第 4、13 页）。"""
        tf = _box(s, T.R_MARGIN, 6.27, self.W - 2 * T.R_MARGIN, 0.5, "middle")
        tf.paragraphs[0].alignment = PP_ALIGN.CENTER
        _rich(tf.paragraphs[0], text, T.R_SIZE_NOTE, T.R_INK, True)

    def _refs(self, s, refs):
        """参考文献 / 出处：放在页脚条左侧（MIT 范例第 3 页）。"""
        refs = refs if isinstance(refs, list) else [refs]
        n = len(refs)
        tf = _box(s, 0.25, T.R_FOOT_Y + 0.04, 5.6, T.R_FOOT_H - 0.08, "middle")
        for k, r in enumerate(refs):
            p = tf.paragraphs[0] if k == 0 else tf.add_paragraph()
            _rich(p, r, T.R_SIZE_REF if n == 1 else Pt(9), T.R_INK)

    @staticmethod
    def _notes(s, notes):
        if notes:
            s.notes_slide.notes_text_frame.text = str(notes).strip()

    def save(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.prs.save(str(path))
