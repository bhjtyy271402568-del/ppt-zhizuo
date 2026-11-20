# 给 Claude 的说明

这个仓库用 python-pptx 按 YAML 生成汇报 PPT。用户用中文交流，偏好在做事过程中顺带讲清原理。

- 做新 PPT：`python new_deck.py <名字>` → 写 `decks/<名字>/content.yaml` → `python build.py decks/<名字> --preview`。
- 内容只写进 content.yaml；样式只改 `pptkit/theme.py`，不要在单个 deck 里硬编码颜色、字号。
- 每次生成后看 `output/preview/page-*.png` 检查排版（文字溢出、图片过小、页面过空），确认没问题再交付。
- 新版式加在 `pptkit/layouts.py` 的 `Deck` 类里，并登记到 `build.py` 的 `LAYOUTS`，同时更新 README 的版式表和 `decks/_template/content.yaml`。
- 数据（尺寸、光斑、电压等）必须来自用户提供的材料或其他仓库的计算结果，不确定时问用户，不要编。
- 生成的 .pptx 提交进仓库，方便用户在 GitHub 上下载；`output/preview/` 不提交。
