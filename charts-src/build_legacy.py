# -*- coding: utf-8 -*-
"""Rebuild the eight remaining path-text charts with real <text>."""
import sys,os; _D=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,_D)
from _style import *; from _box import *
import matplotlib.pyplot as plt, numpy as np, matplotlib.patches as mp, textwrap
use_style(); OUT=os.path.join(_D,"..","site","assets","charts")+os.sep

# ---------------------------------------------------------------- 04 Finland
fig=plt.figure(figsize=(9.0,5.9))
a1=fig.add_axes([.085,.335,.365,.425]); a2=fig.add_axes([.575,.335,.365,.425])
a1.bar([0,1],[7.3,6.8],.5,color=[ACCENT,LIGHT])
for i,v in zip([0,1],[7.3,6.8]): a1.text(i,v+.15,f"{v}",ha="center",size=9.5,weight="bold",color=INK)
a1.set_xticks([0,1]); a1.set_xticklabels(["Basic income\ngroup","Control\ngroup"]); a1.set_ylim(0,10)
a1.set_ylabel("Life satisfaction (0–10)",labelpad=7,size=9)
a1.set_title("Life satisfaction",size=11,weight="bold",color=INK,pad=10); bare(a1)
a2.bar([0,1],[16,24],.5,color=[ACCENT,LIGHT])
for i,v in zip([0,1],[16,24]): a2.text(i,v+.5,f"{v}%",ha="center",size=9.5,weight="bold",color=INK)
a2.set_xticks([0,1]); a2.set_xticklabels(["Basic income\ngroup","Control\ngroup"]); a2.set_ylim(0,30)
a2.set_ylabel("% reporting poor mental health",labelpad=7,size=9)
a2.set_title("Poor mental health",size=11,weight="bold",color=INK,pad=10); bare(a2)
title(fig,"An unconditional payment changed how people felt,\nnot just what they had — Finland",size=13.5)
caption(fig,"Finland's national basic income experiment, 2017–2018: €560/month, unconditional, paid to 2,000 randomly selected unemployed people.\n"
"Employment effects were small; wellbeing effects were not — a 33% relative reduction in reported poor mental health among recipients.\n"
"Source: Kela / VATT Institute for Economic Research, official experiment results, 2020.",y=.215)
save(fig,OUT+"04_finland_wellbeing.svg")

# ------------------------------------------------------- 10 / 11 Venn diagrams
def venn(path,titletxt,labels,centre,cap,three_equal=True):
    FW,FH=8.8,7.0
    fig,ax=canvas((FW,FH))
    title(fig,titletxt,y=.975,size=13.5)
    rx=.165; ry=rx*FW/FH            # true circles on a 0-1 axes of unequal inches
    P=[(.395,.640,ACCENT),(.605,.640,GREEN),(.500,.455,GOLD)]
    for (cx,cy,c),(nm,sub,lx,ly,ha) in zip(P,labels):
        ax.add_patch(mp.Ellipse((cx,cy),2*rx,2*ry,facecolor=c,alpha=.26,edgecolor='none',zorder=1))
        ax.text(lx,ly,nm,size=11.5,weight="bold",color=c,ha=ha,zorder=3)
        if sub: ax.text(lx,ly-.018,sub,size=8.4,style="italic",color=MID,ha=ha,va="top",zorder=3,linespacing=1.4)
    ax.text(.500,.578,centre[0],size=10,weight="bold",color=INK,ha="center",zorder=3)
    ax.text(.500,.543,centre[1],size=8.4,style="italic",color=MID,ha="center",zorder=3,linespacing=1.45)
    caption(fig,cap,y=.100,x=.055,size=7.6)
    save(fig,path)

venn(OUT+"10_venn_three_pillars.svg","Three pillars, one structure",
 [("Governance","delegation earns\nvisible standing",.205,.760,"center"),
  ("Contribution","contribution\nearns dividend",.795,.760,"center"),
  ("Return","return makes\nparticipation rational",.500,.215,"center")],
 ("The closed loop","each pillar feeds the others"),
 "Remove any one pillar and the other two collapse — governance without return has no reason to sustain participation; contribution without\n"
 "governance has nothing to feed; and contribution with no return is a scoreboard.")

# ---- 11 bespoke: two circles, capture as the overlapping zone
FW,FH=8.8,7.0
fig,ax=canvas((FW,FH))
title(fig,"Three different things, one is dangerous",y=.975,size=13.5)
rx=.205; ry=rx*FW/FH
ax.add_patch(mp.Ellipse((.395,.600),2*rx,2*ry,facecolor=GREEN,alpha=.24,edgecolor='none',zorder=1))
ax.add_patch(mp.Ellipse((.605,.600),2*rx,2*ry,facecolor=ACCENT,alpha=.24,edgecolor='none',zorder=1))
crx=.115; cry=crx*FW/FH
ax.add_patch(mp.Ellipse((.500,.470),2*crx,2*cry,facecolor=GOLD,alpha=.40,edgecolor=MID,lw=1.1,zorder=2))
ax.text(.175,.735,"Concentration",size=11.5,weight="bold",color=GREEN,ha="left",zorder=3)
ax.text(.175,.695,"earned influence,\nfollows every rule",size=8.4,style="italic",color=MID,ha="left",va="top",zorder=3,linespacing=1.45)
ax.text(.825,.735,"Corruption",size=11.5,weight="bold",color=ACCENT,ha="right",zorder=3)
ax.text(.825,.695,"rules broken\nto obtain power",size=8.4,style="italic",color=MID,ha="right",va="top",zorder=3,linespacing=1.45)
ax.text(.500,.492,"Capture",size=10.5,weight="bold",color="#ffffff",ha="center",zorder=4)
ax.text(.500,.452,"removal becomes\nimpractical",size=8.2,style="italic",color="#ffffff",ha="center",va="top",zorder=4,linespacing=1.4)
ax.text(.500,.265,"Concentration alone is not a violation. The system does not punish it —\nit measures whether concentration is sliding into capture.",
        size=9.2,color=INK,ha="center",va="top",zorder=3,linespacing=1.5)
caption(fig,"A highly competent, trusted member becoming influential is concentration, not a problem by itself. Capture is the narrower, genuinely\n"
"dangerous zone — reachable from unchecked concentration or from corruption alike.",y=.115,x=.055,size=7.6)
save(fig,OUT+"11_venn_concentration_capture.svg")
