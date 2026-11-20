"""新建一个 deck：复制 decks/_template，并把标题填好。

用法：
    python new_deck.py 动态聚焦_中期汇报
"""
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).parent


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    name = sys.argv[1]
    dst = ROOT / "decks" / name
    if dst.exists():
        sys.exit(f"[错误] {dst} 已经存在")
    shutil.copytree(ROOT / "decks" / "_template", dst)
    yml = dst / "content.yaml"
    yml.write_text(yml.read_text(encoding="utf-8").replace("{{标题}}", name),
                   encoding="utf-8")
    print(f"已创建 {dst}\n下一步：编辑 {yml}，图片放进 {dst / 'assets'}，然后运行\n"
          f"    python build.py {dst.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
