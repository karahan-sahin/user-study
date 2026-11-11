import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

df = pd.read_csv("experiment1.csv")
df = df[df["signing_level"] != "debug"]

CATEGORY_LABELS = {"iso": "Isolated", "cntd": "Continuous", "gt": "Ground Truth"}
COLORS = {"iso": "#4C72B0", "cntd": "#DD8452", "gt": "#55A868"}
ORDER = ["iso", "cntd", "gt"]
LABELS = [CATEGORY_LABELS[c] for c in ORDER]
LANGUAGES = ["bsl", "dgs"]
LANG_STYLE = {"bsl": dict(alpha=1.0, hatch=""), "dgs": dict(alpha=0.55, hatch="//")}

bar_w = 0.35   # vertical bar width (preference)
bar_h = 0.35   # horizontal bar height (naturalness)
group_gap = 0.2

fig, (ax2, ax1) = plt.subplots(1, 2, figsize=(13, 5),
                                gridspec_kw={"width_ratios": [2, 1]})

# --- Plot 1: Preference — vertical grouped bars ---
for ci, cat in enumerate(ORDER):
    for li, lang in enumerate(LANGUAGES):
        sub  = df[(df["language"] == lang) & (df["category"] == cat)]
        total = df[(df["language"] == lang) & (df["is_selected"] == 1)].shape[0]
        val  = sub[sub["is_selected"] == 1].shape[0] / total * 100 if total else 0
        x    = ci + (li - 0.5) * bar_w
        style = LANG_STYLE[lang]
        ax1.bar(x, val, width=bar_w, color=COLORS[cat], edgecolor="white",
                linewidth=1.0, hatch=style["hatch"], alpha=style["alpha"])
        ax1.text(x, val + 0.6, f"{val:.1f}%",
                 ha="center", va="bottom", fontsize=8, fontweight="bold")

ax1.set_xticks(range(len(ORDER)))
ax1.set_xticklabels(LABELS, fontsize=10)
ax1.set_ylabel("Selected as preferred (%)", fontsize=10)
ax1.set_title("Preference", fontsize=13, fontweight="bold", pad=10)
ax1.spines[["top", "right"]].set_visible(False)
ax1.tick_params(axis="y", labelsize=9)

# --- Plot 2: Naturalness — horizontal grouped bars ---
positions = {}
centers   = []
y = 0
for i in range(len(ORDER)):
    pos = [y + j * bar_h for j in range(len(LANGUAGES))]
    positions[i] = pos
    centers.append(y + (len(LANGUAGES) - 1) * bar_h / 2)
    y += len(LANGUAGES) * bar_h + group_gap

for ci, cat in enumerate(ORDER):
    for li, lang in enumerate(LANGUAGES):
        sub   = df[(df["language"] == lang) & (df["category"] == cat)]
        mean  = sub["rating"].mean()
        q25   = sub["rating"].quantile(0.25)
        q75   = sub["rating"].quantile(0.75)
        ypos  = positions[ci][li]
        style = LANG_STYLE[lang]
        ax2.barh(ypos, mean, height=bar_h, color=COLORS[cat], edgecolor="white",
                 linewidth=1.0, hatch=style["hatch"], alpha=style["alpha"])
        ax2.errorbar(mean, ypos,
                     xerr=[[mean - q25], [q75 - mean]],
                     fmt="none", color="black", linewidth=1.8, capsize=5, capthick=1.8, zorder=6)
        ax2.text(q75 + 0.1, ypos, f"{mean:.2f}",
                 ha="left", va="center", fontsize=9, fontweight="bold")

ax2.set_yticks(centers)
ax2.set_yticklabels(LABELS, fontsize=11)
ax2.invert_yaxis()
ax2.set_xlabel("Mean naturalness rating (1–5)", fontsize=10)
ax2.set_xlim(0, 5.8)
ax2.set_xticks([1, 2, 3, 4, 5])
ax2.set_title("Naturalness Rating", fontsize=13, fontweight="bold", pad=10)
ax2.spines[["top", "right"]].set_visible(False)
ax2.tick_params(axis="x", labelsize=9)
ax2.annotate("|—|: IQR (Q25–Q75)", xy=(0.98, 0.03), xycoords="axes fraction",
             ha="right", va="bottom", fontsize=8, color="gray")

# Shared legend
legend_handles = [
    mpatches.Patch(facecolor="gray", alpha=1.0, label="BSL"),
    mpatches.Patch(facecolor="gray", alpha=0.55, hatch="//", label="DGS"),
]
fig.legend(handles=legend_handles, loc="lower center", ncol=2,
           fontsize=10, frameon=False, bbox_to_anchor=(0.5, -0.05))

plt.suptitle("Isolated vs Continuous vs Ground Truth", fontsize=13, y=1.01)
plt.tight_layout()
plt.savefig("experiment1_plots.png", dpi=150, bbox_inches="tight")
print("Saved experiment1_plots.png")
plt.show()
