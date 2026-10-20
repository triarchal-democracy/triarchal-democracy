# -*- coding: utf-8 -*-
"""Rebuilds of the last two path-text charts still used on a live page.

06 — governance hierarchy (documents.html)
15 — municipal budget structure (documents.html), rebuilt as an unnamed
     composite. The original named a real city and its real budget, which
     contradicts the standing campaign rule against naming a municipality,
     and tied a structural point to one country's currency.
"""
import sys,os; _D=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,_D)
from _style import *; from _box import *
use_style(); OUT=os.path.join(_D,"..","site","assets","charts")+os.sep

# ===================================================== 06 governance hierarchy
fig, ax = canvas((9.8, 7.0))
title(fig, "The governance hierarchy — earned, visible, never a second vote",
      y=.975, x=.045, ha="left", size=14)

box(ax, .505, .855, .47, .115, "Member — one vote, always, never changes",
    fill=ACCENT, tc="#ffffff", size=12.5)
arrow(ax, .505, .7975, .505, .722, "delegation, earned trust", lp=(.125, 0))

box(ax, .505, .665, .45, .10,
    "Civic Steward — sustained Contribution Record\nplus sector delegation", size=9.6)
arrow(ax, .505, .615, .505, .518, "above community threshold", lp=(.130, 0))

box(ax, .140, .455, .19, .14,
    "Recognition lapses\nautomatically if support\ndrops below the\nsustaining floor",
    fill=BG, edge=MUTED, size=8.4)
arrow(ax, .340, .640, .200, .530, rad=.28)

box(ax, .505, .455, .45, .14,
    "Delegate (Position) — compensated; installed by\n"
    "Position-decision vote at three-fifths majority\nwith one-fifth participation", size=9.6)
box(ax, .865, .455, .2, .14,
    "Challenge: conduct or\neligibility — goes to a\nrandom Dispute Panel of\n11, excluding parties", fill=BG, edge=MUTED, size=8.4)
arrow(ax, .733, .455, .763, .455)

arrow(ax, .505, .3925, .505, .300, "nominate, sector record required", lp=(.150, 0))

box(ax, .505, .235, .45, .11,
    "Supporting Nominees — operational role only,\n"
    "no vote share, no delegated authority", size=9.6)
box(ax, .865, .235, .2, .14,
    "Challenge: fit or\nlegitimacy — goes to a\ncommunity vote at the\nPosition-decision threshold", fill=BG, edge=MUTED, size=8.4)
arrow(ax, .733, .235, .763, .235)

caption(fig,
    "Standing accumulates upward through earned trust and delegation; authority — one Member, one vote — never moves.\n"
    "Every level below the Member is contestable, revocable, and lapses automatically if the support beneath it lapses.",
    y=.125, x=.045, size=7.6)
save(fig, OUT + "06_governance_hierarchy.svg")


# ===================================================== 15 Kelowna real budget
import matplotlib.patches as mp

fig, ax = canvas((9.8, 7.0))
box(ax, .50, .945, .93, .075,
    "City of Kelowna, 2025 Budget — \\$908M total, about 150,000 residents",
    fill=ACCENT, tc="#ffffff", size=13.5)

L, R = .055, .945
W = R - L

# ---- bar one: the whole budget, split by what is actually discretionary
ax.text(L, .855, "THE WHOLE BUDGET", size=8.2, weight="bold", color=MUTED,
        ha="left", va="bottom", zorder=3)
yb, hb = .760, .072
ax.add_patch(mp.Rectangle((L, yb), W * .225, hb, facecolor=ACCENT, edgecolor="none", zorder=2))
ax.add_patch(mp.Rectangle((L + W * .225, yb), W * .775, hb, facecolor=LIGHT, edgecolor="none", zorder=2))
ax.text(L + W * .1125, yb + hb / 2, "22.5%", size=9.2, color="#ffffff",
        ha="center", va="center", zorder=3)
ax.text(L + W * .6125, yb + hb / 2, "77.5%", size=9.2, color=MID,
        ha="center", va="center", zorder=3)
ax.text(L + W * .1125, yb - .022, "Tax-supported operating\n\\$204.3M", size=9.0,
        color=INK, ha="center", va="top", linespacing=1.5, zorder=3)
ax.text(L + W * .6125, yb - .022,
        "User fees, utilities, developer contributions, grants, reserves — \\$703.7M\n"
        "Rate-funded services and committed capital, spoken for before any council debate begins",
        size=9.0, color=MID, ha="center", va="top", linespacing=1.55, zorder=3)

# ---- bar two: inside the tax-supported portion
ax.text(L, .625, "INSIDE THE TAX-SUPPORTED PORTION", size=8.2, weight="bold",
        color=MUTED, ha="left", va="bottom", zorder=3)
yb2, hb2 = .530, .072
segs = [("Public safety\npolice, bylaw, fire", 52, "\\$106.2M", ACCENT, "#ffffff"),
        ("Transportation", 22, "\\$44.9M", ROSE, INK),
        ("Healthy communities\nparks, rec, arts and culture", 21, "\\$42.9M", LIGHT, MID),
        ("Planning and other", 5, "\\$10.2M", PALE, MID)]
x = L
for label, share, amt, fill, tc in segs:
    w = W * share / 100.0
    ax.add_patch(mp.Rectangle((x, yb2), w, hb2, facecolor=fill,
                              edgecolor=BG, linewidth=1.2, zorder=2))
    if w > .09:
        ax.text(x + w / 2, yb2 + hb2 / 2, "%d%%  ·  %s" % (share, amt), size=9.4,
                color=tc, ha="center", va="center", zorder=3)
        ax.text(x + w / 2, yb2 - .022, label, size=9.0, color=MID,
                ha="center", va="top", linespacing=1.5, zorder=3)
    else:
        ax.text(x + w / 2, yb2 + hb2 + .014, "%d%%" % share, size=9.0, color=MID,
                ha="center", va="bottom", zorder=3)
        ax.plot([x + w / 2, x + w / 2], [yb2 - .006, yb2 - .078], color=RULE,
                lw=0.9, zorder=1)
        ax.text(x + w / 2, yb2 - .086, "%s — %s" % (label.replace("\n", " "), amt),
                size=9.0, color=MID, ha="right", va="top", zorder=3)
    x += w
ax.text(L, .400, "Shares are of the tax-supported \\$204.3M, not of the \\$908M total.",
        size=8.4, style="italic", color=MUTED, ha="left", va="top", zorder=3)

# ---- the finding the section actually turns on
box(ax, .50, .290, .93, .105,
    "No social or income assistance line appears anywhere in this budget.\n"
    "Not underfunded — absent, because in Canada the function is provincial, not municipal.",
    fill=PALE, edge=ACCENT, size=10.8)
ax.text(.50, .208,
        "Which is what makes it a worked example rather than an assertion: the gap is visible in the city's own published figures,\n"
        "and it is the gap a Delegated-Authority Mechanism projection has to be measured against.",
        size=9.0, color=MID, ha="center", va="top", linespacing=1.6, zorder=3)

caption(fig,
    "Real, published figures: the total budget, the tax-supported operating total, and the four-way split of tax-supported spending. Source: City of Kelowna,\n"
    "“Council approved 2025 Final Budget,” 28 April 2025 news release, kelowna.ca. One illustrative city's real numbers, offered as a worked example of what\n"
    "a Delegated-Authority Mechanism projection could ground itself in — not a claim about what every municipal deployment will find, and not a statement\n"
    "that this city is a deployment target.",
    y=.118, x=.045, size=7.4)
save(fig, OUT + "15_kelowna_real_budget.svg")
