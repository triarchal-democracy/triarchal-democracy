# -*- coding: utf-8 -*-
"""Shared style for Triarchal Democracy chart assets.
Palette and typography sampled from the original Matplotlib-generated set."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import rcParams

BG      = "#faf7f2"   # page ground
INK     = "#1c1a17"   # primary text
MID     = "#4a463f"   # axis / body text
MUTED   = "#8a857b"   # captions, gridlines
ACCENT  = "#7a2e2e"   # primary series (dark red)
LIGHT   = "#e2dcd2"   # secondary series (warm grey)
PALE    = "#f3e9e4"   # tertiary fill
GREEN   = "#3f5a52"   # reserved: universal / clears-threshold
GOLD    = "#a97b3f"   # reserved: partial / aggressive-only
ROSE    = "#c98f8f"   # mid step of the red ramp
RULE    = "#d9d2c7"

def use_style():
    rcParams.update({
        "font.family": "serif",
        "font.serif": ["Lora", "Newsreader", "Georgia", "DejaVu Serif"],
        "svg.fonttype": "none",          # real <text> — selectable, searchable, screen-readable
        "figure.facecolor": BG,
        "axes.facecolor": BG,
        "savefig.facecolor": BG,
        "text.color": INK,
        "axes.labelcolor": MID,
        "xtick.color": MID,
        "ytick.color": MID,
        "axes.edgecolor": MUTED,
        "grid.color": RULE,
        "axes.spines.top": False,
        "axes.spines.right": False,
    })

def title(fig, text, y=0.965, size=14.5, x=0.5, ha="center"):
    fig.text(x, y, text, size=size, weight="bold", color=INK, ha=ha, va="top")

def caption(fig, text, y=0.235, size=7.4, x=0.055):
    fig.text(x, y, text, size=size, color=MUTED, style="italic",
             ha="left", va="top", linespacing=1.55)

def bare(ax):
    ax.grid(axis="y", lw=0.7, alpha=0.85)
    ax.set_axisbelow(True)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.spines["left"].set_color(RULE)
    ax.spines["bottom"].set_color(MUTED)

def save(fig, path):
    fig.savefig(path, format="svg", bbox_inches=None)
    plt.close(fig)
    print("wrote", path)
