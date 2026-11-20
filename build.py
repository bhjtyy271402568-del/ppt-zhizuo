"""把一个 deck 文件夹里的 content.yaml 生成 .pptx。

用法：
    python build.py decks/00_使用示例            # 生成 PPT
    python build.py decks/00_使用示例 --preview  # 另外导出 PDF 和每页 PNG，方便检查
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

import yaml

from pptkit import Deck

LAYOUTS = {"cover", "section", "bullets", "image", "two_column", "table", "video", "end"}
PATH_KEYS = {"image", "video", "poster"}  # 这些字段是文件路径，相对 deck 文件夹解析


def normalize_items(items):
    """把 YAML 里写的要点整理成版式要的格式：字符串 = 一级，紧跟的列表 = 二级。

    YAML 里这样写：
        - 一级要点
        - 带子要点的一级:
            - 二级要点
    第二项会被 YAML 读成字典 {"带子要点的一级": ["二级要点"]}，这里把它拆开。
    """
    out = []
    for it in items or []:
        if isinstance(it, dict):
            for k, v in it.items():
                if isinstance(v, list):
                    out.append(str(k))
                    out.append(normalize_items(v))
                else:
                    # 半角冒号后跟空格会被 YAML 当成字典，这里还原成原句
                    out.append(f"{k}: {v}")
        elif isinstance(it, list):
            out.append(normalize_items(it))
        else:
            out.append(str(it))
    return out


def resolve(deck_dir: Path, spec: dict, where: str) -> dict:
    spec = dict(spec)
    for k in PATH_KEYS & spec.keys():
        p = deck_dir / spec[k]
        if not p.exists():
            sys.exit(f"[错误] {where}：找不到文件 {p}")
        spec[k] = p
    for k in ("items", "bullets"):
        if k in spec:
            spec[k] = normalize_items(spec[k])
    return spec


def build(deck_dir: Path) -> Path:
    cfg = yaml.safe_load((deck_dir / "content.yaml").read_text(encoding="utf-8"))
    meta = cfg.get("meta", {})
    title = meta.get("title", deck_dir.name)
    deck = Deck(footer=meta.get("footer", title))

    for i, raw in enumerate(cfg.get("slides", []), start=1):
        where = f"第 {i} 页"
        spec = dict(raw)
        layout = spec.pop("layout", None)
        if layout not in LAYOUTS:
            sys.exit(f"[错误] {where}：layout 写的是 {layout!r}，可选：{', '.join(sorted(LAYOUTS))}")
        spec = resolve(deck_dir, spec, where)
        for side in ("left", "right"):
            if side in spec:
                spec[side] = resolve(deck_dir, spec[side], f"{where} {side}")
        try:
            getattr(deck, layout)(**spec)
        except TypeError as e:
            sys.exit(f"[错误] {where}（{layout}）字段不对：{e}")

    out = deck_dir / "output" / f"{meta.get('output', title)}.pptx"
    deck.save(out)
    print(f"已生成 {out}（{len(deck.prs.slides)} 页）")
    return out


def preview(pptx: Path):
    """用 LibreOffice 转 PDF，再用 pdftoppm 拆成每页 PNG。
    LibreOffice 的渲染和 PowerPoint 略有差别（尤其字体），只用来快速检查排版。"""
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        print("没装 LibreOffice，跳过预览")
        return
    out_dir = pptx.parent / "preview"
    out_dir.mkdir(exist_ok=True)
    subprocess.run([soffice, "--headless", "--convert-to", "pdf", "--outdir",
                    str(out_dir), str(pptx)], check=True, capture_output=True)
    pdf = out_dir / (pptx.stem + ".pdf")
    print(f"已导出 {pdf}")
    if shutil.which("pdftoppm"):
        for old in out_dir.glob("page-*.png"):
            old.unlink()
        subprocess.run(["pdftoppm", "-png", "-r", "60", str(pdf), str(out_dir / "page")],
                       check=True)
        print(f"每页 PNG 在 {out_dir}/")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("deck", type=Path, help="deck 文件夹，里面要有 content.yaml")
    ap.add_argument("--preview", action="store_true", help="同时导出 PDF 和每页 PNG")
    args = ap.parse_args()
    if not (args.deck / "content.yaml").exists():
        sys.exit(f"[错误] {args.deck} 里没有 content.yaml")
    out = build(args.deck)
    if args.preview:
        preview(out)


if __name__ == "__main__":
    main()
