# -*- coding: utf-8 -*-
"""17 — the Triarc against a real deployment.

Rebuilt from the original path-text SVG for the proposition page (then called the argument page). Three changes
beyond the text fix: the named city and its currency figures are gone, because
the argument is deliberately jurisdiction-neutral; the right-hand column no
longer uses GREEN, which _style.py reserves for "universal / clears the
threshold"; and the rows are sized to their content instead of a fixed height.
"""
import sys,os; _D=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,_D)
from _style import *; from _box import *
use_style(); OUT=os.path.join(_D,"..","site","assets","charts")+os.sep
import matplotlib.patches as mp

fig, ax = canvas((10.4, 8.2))
title(fig, "Two different things share one model — do not confuse their scale",
      y=.975, size=14)

LX, RX = .445, .775          # column centres
CW = .295                    # column width
LAB = .215                   # right edge of the row-label gutter

box(ax, LX, .885, CW, .062, "The Triarc — the online experiment",
    fill=ACCENT, tc="#ffffff", size=11.0)
box(ax, RX, .885, CW, .062, "A real deployment — the application",
    fill=MID, tc="#ffffff", size=11.0)

rows = [
    ("Purpose",
     "Prove the mechanism itself works — delegation, the ledger, disputes, "
     "the dividend arithmetic — in public, cheaply, safely",
     "Prove the mechanism helps govern an actual place, where people live, "
     "work and pay taxes. That is the real thesis"),
    ("Membership",
     "Verified members online, self-selected, and few of them to begin with",
     "Verified residents of an actual municipality — typically tens or "
     "hundreds of thousands of people"),
    ("Funding",
     "Voluntary donations and grants only, and modest sums at this stage",
     "A real tax-supported municipal budget — orders of magnitude larger than "
     "anything the Triarc will ever hold"),
    ("Dividend today",
     "None. Both tiers stay gated until thirty verified Members and every "
     "Delegate Position filled (Treasury Code 5.1)",
     "Meaningful only once delegated authority and treasury scale are real — "
     "and still modest even then"),
    ("Failure mode",
     "A mechanism breaks or gets gamed. Cheap, safe, expected, correctable",
     "A mechanism fails after real budget authority has been handed over. "
     "Expensive and consequential — which is why the handover is staged"),
    ("What success\nlooks like",
     "The mechanics hold under real, if modest, use",
     "A community's residents get real, measurable value. This is the actual "
     "claim being tested"),
]

y = .795
for label, left, right in rows:
    h = .105 if max(len(left), len(right)) > 95 else .084
    yc = y - h / 2
    ax.text(LAB, yc, label, size=9.8, color=ACCENT, ha="right", va="center",
            linespacing=1.45, zorder=3)
    box(ax, LX, yc, CW, h, left, fill=PALE, size=8.8)
    box(ax, RX, yc, CW, h, right, fill="#eceae5", size=8.8)
    y -= h + .012

caption(fig,
    "The Triarc exists to prove the model works, not to demonstrate it at real-world financial scale. A governance model that will one day ask a\n"
    "community for its trust should first be willing to run on itself, in public, where every failure is visible and the cost of one falls on its own\n"
    "credibility rather than on a public budget or a resident's income. A small dividend at Triarc scale, once the gate is met at all, is not the\n"
    "model failing — it is the experiment behaving exactly as designed.",
    y=.095, x=.045, size=7.6)
save(fig, OUT + "17_triarc_vs_real_deployment.svg")
