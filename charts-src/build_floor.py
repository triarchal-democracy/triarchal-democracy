# -*- coding: utf-8 -*-
import sys,os; _D=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,_D)
from _style import *; from _box import *
import matplotlib.pyplot as plt, numpy as np, matplotlib.patches as mp
use_style(); OUT=os.path.join(_D,"..","site","assets","charts")+os.sep

# 27 was retired on 21 Sep 2026 with the arithmetic page's Part Two. Its later source,
# build_taper.py, is in _archive/retired-scripts/.
# The version that lived here drew a flat 50% taper and used FD=3359.0 — the pool
# measured per resident — where the page now says $4,060 per entitled adult. Both
# were wrong on the live site. Rebuilding it from here would reintroduce them, so
# the chart was generated from taper_model.py in build_taper.py instead, until it was retired.

# ============================== 12: treasury flow (Supplement removed 21 Sep 2026; GAC 7.2 release shown instead)
fig,ax=canvas((9.8,7.2))
# Re-laid out 10 Oct 2026: the pool now splits straight into its two tiers (the old
# version drew the Foundation Dividend twice), lines are broken by hand so boxes hold
# in a browser's fallback serif, and arrow labels sit clear of the arrows.
title(fig,"Where the money goes, and what it can never fund",y=.977,x=.055,ha="left",size=14)
box(ax,.40,.895,.40,.070,"Donations, grants, and community-voted revenue",fill=BG,edge=INK,size=9.2)
box(ax,.795,.895,.32,.095,"Delegated-Authority Mechanism public funds —\nonly if the government explicitly\ndesignates them for this",fill=BG,edge=ACCENT,size=8.0)
box(ax,.40,.770,.235,.072,"Treasury",fill=ACCENT,tc="#ffffff",size=13)
box(ax,.115,.790,.185,.095,"Institutional money,\nincl. the Triarc's own",fill=BG,edge=MUTED,size=8.6)
arrow(ax,.40,.859,.40,.808)
arrow(ax,.115,.741,.115,.632,"restricted to\noperations",lp=(-.058,0))
arrow(ax,.795,.846,.735,.638,rad=-.22)
arrow(ax,.335,.733,.235,.638,rad=.18)
arrow(ax,.400,.733,.435,.638,rad=-.10)
arrow(ax,.520,.758,.700,.645,rad=-.20)
ax.text(.640,.745,"only if designated",size=7.4,style="italic",color=MUTED,ha="left",va="center",zorder=4)
for cx,txt in ((.235,"Operations\n40%"),(.435,"Dividend pool\n(pooled, sources stay\ntagged on the ledger)"),(.720,"Reserve — 20%\n(12-month target)")):
    box(ax,cx,.590,.185,.088,txt,fill=PALE,size=8.8)
arrow(ax,.395,.545,.270,.468,rad=.12)
arrow(ax,.475,.545,.640,.468,rad=-.12)
ax.text(.255,.515,"taken first: half\nby default",size=7.4,style="italic",color=MUTED,ha="center",va="center",zorder=4,linespacing=1.35)
ax.text(.660,.515,"the rest",size=7.4,style="italic",color=MUTED,ha="center",va="center",zorder=4)
box(ax,.255,.405,.36,.115,"Foundation Dividend — split equally among\nevery Member, plus anything the ceiling held\nback last month; recalculated every cycle",fill=ACCENT,tc="#ffffff",size=8.6)
box(ax,.685,.405,.36,.115,"Civic Dividend — divided by claimed\ncontribution; no Member's total from both\ntiers passes five times an equal share",fill=PALE,size=8.6)
# redirected programmes: not treasury money until released (GAC 7.2)
ax.add_patch(mp.FancyBboxPatch((.045,.175),.905,.135,boxstyle="round,pad=0,rounding_size=.014",
        facecolor=BG,edgecolor=ROSE,linewidth=1.3,linestyle=(0,(4,3)),zorder=2))
ax.text(.4975,.285,"Not treasury money until it is released",ha="center",size=8.2,style="italic",color=ROSE,zorder=3)
box(ax,.4975,.225,.845,.075,"A redirected government programme keeps paying everyone already on it, through the government itself.\nMoney enters the dividend pool only as those obligations end (Government Adoption Compact 7.2, 7.3).",fill=BG,size=8.4)
caption(fig,"The Foundation Dividend activates once a deployment has at least 30 verified Members and every Delegate Position it has defined is\n"
"filled by ratified Position decision (Treasury Code 5.1); before that the formula computes zero and neither tier distributes. Institutional\n"
"money, including the Triarc's own, funds operations only and never touches the dividend pool (Treasury Code 1.4). Nothing income-tested\n"
"is ever paid out of the treasury: payments owed to people on a redirected programme stay with the government that owes them.",
y=.145,x=.055,size=7.2)
save(fig,OUT+"12_treasury_flow.svg")
