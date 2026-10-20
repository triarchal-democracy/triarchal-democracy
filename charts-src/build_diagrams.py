# -*- coding: utf-8 -*-
import sys,os; _D=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,_D)
from _style import *; from _box import *
use_style(); OUT=os.path.join(_D,"..","site","assets","charts")+os.sep

# Chart 12 moved to build_floor.py on 21 Sep 2026, when the Poverty-Line Supplement
# panel was replaced by the GAC 7.2 'release, not transfer' panel. The version that
# lived here predates that and would silently revert the live chart if rebuilt, since
# both scripts wrote the same filename. Do not restore it here.


# ================================================== 08 fishbone: why it fails
# Re-laid out 10 Oct 2026 (see chart 09's note in build_rest.py): browsers render these
# SVGs in their own fallback serif, wider than matplotlib measures, so the title, headings
# and head box all keep generous clearance.
fig,ax=canvas((9.6,6.4))
title(fig,"Why current governance structurally fails",y=.965,x=.055,ha="left",size=13.5)
ax.plot([.055,.765],[.50,.50],color=INK,lw=2.0,zorder=1)
box(ax,.875,.50,.205,.15,"Civic disengagement\nand broken\naccountability",fill=ACCENT,tc="#ffffff",size=9.2,weight="bold")
tops=[(.245,"Periodic","Accountability arrives only every few years, never in between — needs to be continuous"),
      (.545,"Opaque","Reasoning disclosed after the fact, not during — needs to be transparent")]
for x,h,b in tops:
    ax.text(x,.855,h,size=10,weight="bold",color=ACCENT,ha="center",va="top")
    ax.text(x,.805,"\n".join(__import__("textwrap").wrap(b,32)),size=8.4,color=MID,ha="center",va="top",linespacing=1.45)
    ax.plot([x,x],[.50,.655],color=MUTED,lw=1.0,zorder=1)
x,h,b=.395,"Disconnected","No mechanism ties representative behaviour to real-time consequence — needs to be directly accountable"
ax.plot([x,x],[.50,.345],color=MUTED,lw=1.0,zorder=1)
ax.text(x,.320,"\n".join(__import__("textwrap").wrap(b,36)),size=8.4,color=MID,ha="center",va="top",linespacing=1.45)
ax.text(x,.195,h,size=10,weight="bold",color=ACCENT,ha="center",va="top")
caption(fig,"Three converging causes, not three separate problems — each is a design property of representative systems built for a\n"
"world where continuous participation was logistically impossible. (The social-support system's own, separate problem — support\n"
"tied to need, so getting ahead costs you support — is not something this model sets out to change. It starts alongside those programmes.)",y=.105,x=.055,size=7.3)
save(fig,OUT+"08_fishbone_governance_failure.svg")
