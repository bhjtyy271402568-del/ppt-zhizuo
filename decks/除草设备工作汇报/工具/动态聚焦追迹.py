"""B 方案镜组（BICV-FS04 + LA4904 + LB4842）真实面形光线追迹

处方来自 jiguangdongtaijujiao 仓库 设计/Zemax/结果_v0.2_Codex/模型/B_熔石英空气双片_1064nm.zmx。
先在 1064 nm 下复算 Zemax 给出的镜间空气隙（核对本程序），再换成 915 nm 折射率，
求 1–10 m 各距离的空气隙和动镜行程。输出：动态聚焦追迹.json
"""
import json
import math
from pathlib import Path

HERE = Path(__file__).parent


def n_fs(lam_um):
    """熔石英 Sellmeier 色散公式（Malitson 1965）。"""
    l2 = lam_um ** 2
    return math.sqrt(1 + 0.6961663 * l2 / (l2 - 0.0684043 ** 2)
                     + 0.4079426 * l2 / (l2 - 0.1162414 ** 2)
                     + 0.8974794 * l2 / (l2 - 9.896161 ** 2))


# 面：(半径 mm，到下一面的距离 mm，之后的介质)；gap 为动镜与物镜间的可变空气隙
def surfaces(gap):
    inf = float("inf")
    return [
        (-18.71, 2.0, "FS"),       # BICV-FS04 前面
        (18.71, gap, "AIR"),       # BICV-FS04 后面
        (inf, 7.84, "FS"),         # LA4904 平面（反放）
        (-69.01, 6.8822842, "AIR"),
        (182.99, 6.54, "FS"),      # LB4842
        (-182.99, 0.0, "AIR"),
    ]


SEMI = [6.35, 6.35, 25.4, 25.4, 25.4, 25.4]   # 半口径 mm


def trace(y0, gap, n_glass, u0=0.0):
    """追一条子午光线：入射高度 y0、角度 u0。返回各面交点和最后的 (y, 斜率)。"""
    z = 0.0
    pts = []
    y, dz, dy = y0, math.cos(u0), math.sin(u0)
    zc = 0.0       # 当前面顶点
    n1 = 1.0
    for (R, t, med) in surfaces(gap):
        # 与球面（或平面）求交
        if math.isinf(R):
            s = (zc - z) / dz
        else:
            cz = zc + R
            ox, oy = z - cz, y
            b = ox * dz + oy * dy
            c = ox * ox + oy * oy - R * R
            disc = b * b - c
            s = -b - math.copysign(math.sqrt(disc), R) if R > 0 else -b + math.sqrt(disc)
            s = -b - math.sqrt(disc) if R > 0 else -b + math.sqrt(disc)
        z, y = z + s * dz, y + s * dy
        pts.append((z, y))
        # 法线（指向入射侧之外的方向统一取 +z 侧）
        if math.isinf(R):
            nz, ny = 1.0, 0.0
        else:
            nz, ny = (z - (zc + R)) / R, y / R
        n2 = n_glass if med == "FS" else 1.0
        mu = n1 / n2
        cosi = -(nz * dz + ny * dy)
        if cosi < 0:
            nz, ny, cosi = -nz, -ny, -cosi
        k = 1 - mu * mu * (1 - cosi * cosi)
        ct = math.sqrt(k)
        dz, dy = mu * dz + (mu * cosi - ct) * nz, mu * dy + (mu * cosi - ct) * ny
        n1 = n2
        zc += t
    return pts, (z, y, dz, dy)


def focus_dist(gap, n_glass, h=0.05):
    """近轴焦点到物镜最后一面顶点的距离（小高度光线）。"""
    pts, (z, y, dz, dy) = trace(h, gap, n_glass)
    return -y * dz / dy          # 光线与光轴交点离最后一面的距离


def power(gap, n_glass, h=0.05):
    """出射光线的会聚度 = 1 / 焦点距离（随间距单调增大；无焦时为 0，发散时为负）。"""
    pts, (z, y, dz, dy) = trace(h, gap, n_glass)
    return -(dy / dz) / y


def gap_for(L_mm, n_glass):
    lo, hi = 50.0, 80.0
    for _ in range(100):
        mid = (lo + hi) / 2
        if power(mid, n_glass) < 1 / L_mm:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


n1064, n915 = n_fs(1.064), n_fs(0.915)
DIST = [1000, 1500, 2000, 3000, 5000, 10000]
ZEMAX_1064 = [68.175993, 65.110088, 63.639616, 62.208818, 61.091785, 60.269652]   # 结果_v0.2 表
rows = []
for L, gz in zip(DIST, ZEMAX_1064):
    rows.append({"距离_mm": L, "Zemax_1064_空气隙": gz, "近轴_1064_空气隙": gap_for(L, n1064),
                 "近轴_915_空气隙": gap_for(L, n915)})
fine = [{"距离_mm": L, "空气隙_915": gap_for(L, n915)} for L in
        [1000 + 250 * k for k in range(37)]]
out = {
    "折射率": {"915nm": n915, "1064nm": n1064},
    "核对与915": rows,
    "行程_1064_Zemax": ZEMAX_1064[0] - ZEMAX_1064[-1],
    "行程_1064_近轴": rows[0]["近轴_1064_空气隙"] - rows[-1]["近轴_1064_空气隙"],
    "行程_915_近轴": rows[0]["近轴_915_空气隙"] - rows[-1]["近轴_915_空气隙"],
    "空气隙表_915": fine,
    "处方": [{"R": R if not math.isinf(R) else None, "t": t, "介质": m} for R, t, m in surfaces(0)],
    "半口径": SEMI,
}
(HERE / "动态聚焦追迹.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"熔石英 n(915) = {n915:.5f}，n(1064) = {n1064:.5f}")
print("距离 | Zemax 1064 | 本程序 1064 | 本程序 915")
for r in rows:
    print(f"{r['距离_mm']/1000:>4g} m | {r['Zemax_1064_空气隙']:.3f} | {r['近轴_1064_空气隙']:.3f} | {r['近轴_915_空气隙']:.3f}")
print(f"行程：Zemax 1064 {out['行程_1064_Zemax']:.3f} mm；本程序 1064 {out['行程_1064_近轴']:.3f}；915 {out['行程_915_近轴']:.3f} mm")
