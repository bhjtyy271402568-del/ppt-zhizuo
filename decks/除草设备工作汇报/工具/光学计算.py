"""除草设备光路计算（915 nm 多模光纤耦合激光器）

输出：光学计算.json（动图和 PPT 共用）、光学计算结果.md（给人看）
标注：【资料】有出处 ·【推算】本脚本计算 ·【假设】待确认，确认后改下面的参数重跑

方法：带 M² 的高斯光束（嵌入高斯法）。把 λ 换成 M²·λ，就能用单模高斯光束的
q 参数公式计算多模光束的光束半径。不用远场近似 4M²λL/(πD)：M² 约 58 时，
远处光斑会比出光口还大，远场近似在那里不成立。
"""
import json
import math
from pathlib import Path

HERE = Path(__file__).parent

# ---------------- 光源【资料：张道勇中期汇报 第 8 页】 ----------------
LAM = 0.915e-6          # 波长 m
CORE = 155e-6           # 光纤芯径 m
NA = 0.22               # 光纤数值孔径（按规格上限计，实际出光发散通常略小）
P = 260.0               # 最大输出功率 W

W_F = CORE / 2                                  # 光纤端面“束腰”半径
M2 = math.pi * W_F * NA / LAM                   # M² = π·w·θ / λ
BPP = W_F * NA * 1e6                            # mm·mrad
LAM_E = M2 * LAM                                # 等效波长

# ---------------- 平台光路【资料：中期汇报 第 8 页】 ----------------
F_THETA = 0.650         # 场镜焦距 m
FIELD = 0.350           # 扫描范围 350 mm × 350 mm
GALVO_AP = 20e-3        # 振镜最大入射光斑 20 mm

# ---------------- 待确认的量【假设】 ----------------
D_BEAM = 12e-3          # 准直（扩束）后进振镜的光束直径：取振镜口径的 60%
L_COLL_TO_GALVO = 0.10  # 准直镜（或前聚焦的聚焦镜）到振镜的距离
H_WORK = 0.65           # 振镜到地面的高度（与场镜焦距相同，便于三种光路对比）
L_COLL_TO_GROUND = L_COLL_TO_GALVO + H_WORK

# ---------------- 动态聚焦镜组【资料：jiguangdongtaijujiao Zemax 第 2 轮审查，B 方案】 ----------------
F1 = -20.5e-3           # 动镜（双凹）
F2 = 90e-3              # 物镜（两片合成）
D_IN_DF = 4e-3          # 进动镜光束直径（B 方案按 4 mm 优化）


# ====================================================================
# 高斯光束（q 参数）
# ====================================================================
def q_waist(w0, z=0.0):
    """束腰半径 w0，当前位置在束腰之后 z 处。"""
    zr = math.pi * w0 ** 2 / LAM_E
    return complex(z, zr)


def prop(q, d):
    return q + d


def lens(q, f):
    return 1 / (1 / q - 1 / f)


def radius(q):
    """光束半径 w（1/e²）。"""
    inv = 1 / q
    return math.sqrt(-LAM_E / (math.pi * inv.imag))


def waist_of(q):
    """返回 (束腰半径, 束腰在当前位置之后多远)。"""
    zr = q.imag
    return math.sqrt(zr * LAM_E / math.pi), -q.real


def zr_of(w0):
    return math.pi * w0 ** 2 / LAM_E


DOF_K = 0.458  # 光斑变大 10% 时偏离束腰的距离 = 0.458·z_R


def density(w):
    """平均功率密度 W/cm²：功率 ÷ 1/e² 圆面积。"""
    return P / (math.pi * (w * 100) ** 2)


# ====================================================================
# 1. 单镜片准直：平行光光路
# ====================================================================
f_coll = (D_BEAM / 2) / NA                       # 光束半径 = f·NA
q0 = q_waist(W_F)
q = lens(prop(q0, f_coll), f_coll)               # 光纤端面在准直镜前焦面
w_out, z_w = waist_of(q)                         # 出射束腰（在后焦面附近）
div = W_F / f_coll                               # 出射发散半角
para_spots = {}
for dz in (-0.1, 0.0, 0.1):                      # 地面起伏 ±100 mm
    L = L_COLL_TO_GROUND + dz
    para_spots[f"{dz:+.1f}"] = 2 * radius(prop(q, L))
w_ground = radius(prop(q, L_COLL_TO_GROUND))

parallel = {
    "准直镜焦距_mm": f_coll * 1e3,
    "准直后光束直径_mm": D_BEAM * 1e3,
    "发散半角_mrad": div * 1e3,
    "地面光斑_mm": 2 * w_ground * 1e3,
    "地面起伏±100mm光斑_mm": {k: v * 1e3 for k, v in para_spots.items()},
    "平均功率密度_W_cm2": density(w_ground),
}

# ====================================================================
# 2. 后聚焦：准直 + 振镜 + F-θ 场镜
# ====================================================================
w_in = D_BEAM / 2
FT_GAP = 0.052                                   # 振镜到场镜 52 mm（和动图一致）
q_ft = lens(prop(q, L_COLL_TO_GALVO + FT_GAP), F_THETA)
w0_ft, z_ft = waist_of(q_ft)                     # 实际束腰（考虑残余发散）
zr_ft = zr_of(w0_ft)
theta_opt = (FIELD / 2) / F_THETA                # 单轴最大光学扫描角（f-θ：x = f·θ）
post = {
    "场镜焦距_mm": F_THETA * 1e3,
    "焦点光斑_mm": 2 * w0_ft * 1e3,
    "场镜到束腰_mm": z_ft * 1e3,
    "瑞利长度_mm": zr_ft * 1e3,
    "焦深_光斑增大10%_±mm": DOF_K * zr_ft * 1e3,
    "平均功率密度_W_cm2": density(w0_ft),
    "单轴光学扫描角_deg": math.degrees(theta_opt),
    "单轴振镜机械转角_deg": math.degrees(theta_opt) / 2,   # 反射：光线偏转 = 2 × 镜片转角
    "与平行光功率密度之比": density(w0_ft) / density(w_ground),
}

# ====================================================================
# 3. 前聚焦：聚焦镜在振镜前，焦点落在以振镜为圆心的球面上
# ====================================================================
R = H_WORK                                       # 振镜到焦点
PRE_COLL_GAP = 0.07                              # 准直镜到聚焦镜 70 mm（和动图一致）
q_pre_in = prop(q, PRE_COLL_GAP)
target = L_COLL_TO_GALVO + R                     # 聚焦镜到焦点（光程）


def _waist_dist(f):
    return waist_of(lens(q_pre_in, f))[1]


# 准直光并非严格平行：它的束腰在准直镜后不远处，瑞利长度只有约 2 m。
# 这样的光束经透镜聚焦后，束腰会落在焦距以内（比焦距近）。
# 所以反求焦距，使束腰正好落在地面上
lo, hi = 0.3, 1.5
for _ in range(80):
    mid = (lo + hi) / 2
    if _waist_dist(mid) > target:
        hi = mid
    else:
        lo = mid
f_pre = (lo + hi) / 2
w0_pre, _ = waist_of(lens(q_pre_in, f_pre))
zr_pre = zr_of(w0_pre)
x_edge = FIELD / 2
defocus_edge = math.hypot(R, x_edge) - R         # 平面边缘的离焦量
theta_edge = math.atan(x_edge / R)
pre = {
    "工作距离_mm": R * 1e3,
    "聚焦镜焦距_mm": f_pre * 1e3,
    "焦点光斑_mm": 2 * w0_pre * 1e3,
    "边缘离焦_mm": defocus_edge * 1e3,
    "边缘光斑增大_%": (math.sqrt(1 + (defocus_edge / zr_pre) ** 2) - 1) * 100,
    "焦深_±mm": DOF_K * zr_pre * 1e3,
    "平均功率密度_W_cm2": density(w0_pre),
    "边缘位置非线性_%": (R * math.tan(theta_edge) / (R * theta_edge) - 1) * 100,
}

# ====================================================================
# 4. 动态聚焦：动镜（负）+ 物镜（正），B 方案镜组
# ====================================================================
f_c2 = (D_IN_DF / 2) / NA                        # 给动态聚焦头配的准直镜焦距
q_c0 = lens(prop(q_waist(W_F), f_c2), f_c2)      # 准直镜出口
D_INF = F2 + F1                                  # 两镜间距：出射平行光（无焦）
C2O = 0.030 + D_INF                              # 准直镜到物镜（固定）：动镜在“无焦”位置时离准直镜 30 mm【假设】


def spot_at(L, gap):
    """动镜—物镜间距 gap（准直镜和物镜固定，动镜在中间移动），物镜后 L 处的光束直径。"""
    qq = prop(q_c0, C2O - gap)
    qq = lens(qq, F1)
    qq = prop(qq, gap)
    qq = lens(qq, F2)
    return 2 * radius(prop(qq, L)), qq


def best_gap(L):
    """在 ±12 mm 范围内找让 L 处光斑最小的间距（黄金分割搜索）。"""
    a, b = D_INF - 2e-3, D_INF + 14e-3
    g = (math.sqrt(5) - 1) / 2
    for _ in range(80):
        c, d = b - g * (b - a), a + g * (b - a)
        if spot_at(L, c)[0] < spot_at(L, d)[0]:
            b = d
        else:
            a = c
    return (a + b) / 2


dist = [1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9, 10]
L_FIX = 3.0
gap_fix = best_gap(L_FIX)
rows = []
for L in dist:
    gap = best_gap(L)
    d_dyn, qq = spot_at(L, gap)
    d_fix, _ = spot_at(L, gap_fix)
    geo = F2 ** 2 / (L - F2)                     # 几何成像：动镜后退量
    w0, zw = waist_of(qq)
    rows.append({
        "距离_m": L,
        "动镜后退_几何_mm": geo * 1e3,
        "动镜后退_光斑最小_mm": (gap - D_INF) * 1e3,
        "动态聚焦光斑_mm": d_dyn * 1e3,
        f"固定对焦{L_FIX:g}m光斑_mm": d_fix * 1e3,
        "动态聚焦功率密度_W_cm2": density(d_dyn / 2),
        f"固定对焦功率密度_W_cm2": density(d_fix / 2),
        "焦深_±mm": DOF_K * zr_of(d_dyn / 2) * 1e3,
    })
d_out = 2 * radius(lens(prop(lens(prop(q_c0, C2O - D_INF), F1), D_INF), F2))
dyn = {
    "镜组": "动镜 f −20.5 mm + 物镜 f 90 mm（B 方案，薄透镜近似）",
    "进动镜光束_mm": D_IN_DF * 1e3,
    "配套准直镜焦距_mm": f_c2 * 1e3,
    "动镜焦距_mm": F1 * 1e3, "物镜焦距_mm": F2 * 1e3,
    "准直镜到物镜_mm": C2O * 1e3, "无焦间距_mm": D_INF * 1e3,
    "出光口光束_mm": d_out * 1e3,
    "扩束倍率": -F2 / F1,
    "1到10m行程_几何_mm": (F2 ** 2 / (1 - F2) - F2 ** 2 / (10 - F2)) * 1e3,
    "各距离": rows,
    "固定对焦距离_m": L_FIX,
}

# ====================================================================
# 5. Z 轴测距聚焦（原理.pptx 第 6 页）：几何核对
# ====================================================================
# 传感器装在激光头一侧，水平距离 D，光束固定朝下倾斜 β，使 H = F 时
# 测距光点与激光焦点重合。传感器沿自己的光束测得斜距 L。
D_S, F_S = 0.150, 0.650                          # 【假设】示意尺寸，用于说明误差量级
beta = math.atan(D_S / F_S)
geo_rows = []
for H in (0.55, 0.60, 0.65, 0.70, 0.75):
    L = H / math.cos(beta)                       # 实际测到的斜距（地面平整时）
    H_true = L * math.cos(beta)
    H_cos = math.sqrt(L ** 2 - D_S ** 2)         # 原 PPT 公式（θ = 90° 时）
    geo_rows.append({"真实高度_mm": H * 1e3, "测得斜距_mm": L * 1e3,
                     "按 H=L·cosβ_mm": H_true * 1e3, "按余弦定理_mm": H_cos * 1e3,
                     "误差_mm": (H_cos - H) * 1e3})
zaxis = {"示意_D_mm": D_S * 1e3, "示意_F_mm": F_S * 1e3, "倾角β_deg": math.degrees(beta),
         "核对": geo_rows}

out = {
    "光源": {"波长_nm": LAM * 1e9, "芯径_um": CORE * 1e6, "NA": NA, "功率_W": P,
             "M2": M2, "BPP_mm_mrad": BPP},
    "假设": {"进振镜光束直径_mm": D_BEAM * 1e3, "准直镜到振镜_mm": L_COLL_TO_GALVO * 1e3,
             "振镜到地面_mm": H_WORK * 1e3},
    "平行光": parallel, "后聚焦": post, "前聚焦": pre, "动态聚焦": dyn, "Z轴测距": zaxis,
}
(HERE / "光学计算.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

# ---------------- 给人看的结果 ----------------
r = lambda x, n=1: f"{x:.{n}f}"
md = [
    "# 除草设备光路计算结果（自动生成）", "",
    "> 由 `光学计算.py` 生成。915 nm、芯径 155 μm、NA 0.22、260 W【资料：中期汇报】；"
    f"M² = {r(M2)}，BPP = {r(BPP, 2)} mm·mrad【推算】。",
    f"> 【假设】进振镜光束直径 {r(D_BEAM*1e3, 0)} mm（振镜口径 20 mm 的 60%）；拿到准直镜/扩束规格后改参数重跑。", "",
    "## 1. 平行光（单镜片准直）",
    f"- 准直镜焦距 ≈ {r(f_coll*1e3)} mm → 光束 {r(D_BEAM*1e3, 0)} mm，发散半角 {r(div*1e3, 2)} mrad",
    f"- 地面光斑 {r(2*w_ground*1e3)} mm；地面起伏 ±100 mm 时 "
    + " / ".join(f"{v*1e3:.1f}" for v in para_spots.values()) + " mm（几乎不变）",
    f"- 平均功率密度 {r(density(w_ground), 0)} W/cm²", "",
    "## 2. 后聚焦（准直 + 振镜 + F-θ 场镜 f 650）",
    f"- 焦点光斑 {r(2*w0_ft*1e3, 2)} mm，焦深（光斑增大 10%）±{r(DOF_K*zr_ft*1e3, 0)} mm",
    f"- 平均功率密度 {r(density(w0_ft), 0)} W/cm²，是平行光的 {r(post['与平行光功率密度之比'])} 倍",
    f"- 扫 350 mm：单轴光学扫描角 ±{r(math.degrees(theta_opt))}°，振镜机械转角 ±{r(math.degrees(theta_opt)/2)}°", "",
    "## 3. 前聚焦（聚焦镜在振镜前）",
    f"- 聚焦镜在振镜前 {r(L_COLL_TO_GALVO*1e3, 0)} mm，焦距 {r(f_pre*1e3, 0)} mm → 焦点光斑 {r(2*w0_pre*1e3, 2)} mm",
    f"- 焦点落在半径 {r(R*1e3, 0)} mm 的球面上；平面边缘（175 mm）离焦 {r(defocus_edge*1e3)} mm",
    f"- 对这台激光器：焦深 ±{r(DOF_K*zr_pre*1e3, 0)} mm，边缘光斑只增大 {r(pre['边缘光斑增大_%'], 1)}%",
    f"- 位置与转角不成正比（x = R·tanθ），边缘偏差 {r(pre['边缘位置非线性_%'], 1)}%，由控制卡查表校正", "",
    "## 4. 动态聚焦（动镜 f −20.5 + 物镜 f 90）",
    f"- 进动镜 4 mm（配准直镜 f ≈ {r(f_c2*1e3, 1)} mm），出光口 {r(d_out*1e3, 1)} mm",
    f"- 1–10 m 几何行程 {r(dyn['1到10m行程_几何_mm'], 2)} mm", "",
    "| 距离 | 动镜后退（几何） | 动镜后退（光斑最小） | 动态聚焦光斑 | 固定对焦 3 m 光斑 | 功率密度 动态 / 固定 | 焦深 |",
    "|---|---|---|---|---|---|---|",
]
for x in rows:
    md.append(f"| {x['距离_m']:g} m | {x['动镜后退_几何_mm']:.2f} mm | {x['动镜后退_光斑最小_mm']:.2f} mm | "
              f"{x['动态聚焦光斑_mm']:.1f} mm | {x['固定对焦3m光斑_mm']:.1f} mm | "
              f"{x['动态聚焦功率密度_W_cm2']:.0f} / {x['固定对焦功率密度_W_cm2']:.0f} W/cm² | ±{x['焦深_±mm']:.0f} mm |")
md += ["", "## 5. Z 轴测距聚焦：公式核对（示意 D = 150 mm、F = 650 mm）",
       f"- 传感器光束倾角 β = {r(math.degrees(beta), 2)}°；地面平整时，传感器测到的是沿自己光束的斜距 L，"
       "高度应为 **H = L·cosβ**。余弦定理式只在 H = F 时成立。", "",
       "| 真实高度 | 测得斜距 | H = L·cosβ | 余弦定理式 | 余弦定理式误差 |", "|---|---|---|---|---|"]
for g in geo_rows:
    md.append(f"| {g['真实高度_mm']:.0f} | {g['测得斜距_mm']:.1f} | {g['按 H=L·cosβ_mm']:.1f} | {g['按余弦定理_mm']:.1f} | {g['误差_mm']:+.1f} mm |")
(HERE / "光学计算结果.md").write_text("\n".join(md) + "\n", encoding="utf-8")
print("\n".join(md))
