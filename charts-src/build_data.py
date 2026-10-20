# -*- coding: utf-8 -*-
import sys,os; _D=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,_D)
from _style import *
import matplotlib.pyplot as plt, numpy as np
use_style()
OUT=os.path.join(_D,"..","site","assets","charts")+os.sep
import os; os.makedirs(OUT,exist_ok=True)

# ---------------------------------------------------------------- 05 cap model
fig=plt.figure(figsize=(8.5,6.15)); ax=fig.add_axes([.125,.375,.835,.475])
sizes=[50,200,1000,5000,20000]; x=np.arange(len(sizes))
uncapped=[22,19,17,15,14]
capped=[min(u,500.0/n) for u,n in zip(uncapped,sizes)]   # 5x an equal share = 500/N percent
w=.38
ax.bar(x-w/2,uncapped,w,color=LIGHT,label="Without the cap (modelled skew)")
ax.bar(x+w/2,capped,w,color=ACCENT,label="With the cap — five times an equal share")
ax.set_yscale("log"); ax.set_ylim(.015,40)
ax.set_yticks([.02,.1,.5,2.5,10,25])
ax.set_yticklabels(["0.02%","0.1%","0.5%","2.5%","10%","25%"])
ax.set_xticks(x); ax.set_xticklabels([f"{s:,}" for s in sizes])
ax.set_xlabel("Modelled community size (members)",labelpad=8)
ax.set_ylabel("Top contributor's share of one\ndividend distribution (log scale)",labelpad=8)
bare(ax)
for xi,v in zip(x-w/2,uncapped):
    ax.text(xi,v*1.13,f"{v}%",ha="center",size=8.2,color=MID)
for xi,v in zip(x+w/2,capped):
    lab=f"{v:g}%" if v>=.1 else f"{v:.3g}%"
    ax.text(xi,v*1.13,lab,ha="center",size=8.2,weight="bold",color=ACCENT)
ax.legend(frameon=False,loc="upper right",bbox_to_anchor=(1.0,1.135),fontsize=8.4,
          labelcolor=MID,handlelength=1.4)
title(fig,"ILLUSTRATIVE MODEL — the accrual cap tightens as a community grows")
caption(fig,"Not measured data. A simulation using an assumed volunteer-contribution skew, showing the cap's intended effect at different\n"
"community sizes. The cap is five times an equal share of the new money a cycle commits to distribution, both tiers counted together\n"
"(Founding Charter 5.3, Contribution Code 4.3) — so it is 10% at 50 members and 0.5% at 1,000, falling automatically as membership\n"
"rises. Triarchal Democracy has not been deployed at these scales; this illustrates mechanism design intent, not an observed outcome.")
save(fig,OUT+"05_dividend_cap_model.svg")

# ------------------------------------------------------- 03 Stockton + control
fig=plt.figure(figsize=(8.0,5.6)); ax=fig.add_axes([.115,.325,.855,.525])
x=np.arange(2); w=.36
treat=[28,40]; ctrl=[32,37]
ax.bar(x-w/2,treat,w,color=ACCENT,label="Recipients ($500/month)")
ax.bar(x+w/2,ctrl,w,color=LIGHT,label="Control group")
for xi,v in zip(x-w/2,treat): ax.text(xi,v+.9,f"{v}%",ha="center",size=9.5,weight="bold",color=ACCENT)
for xi,v in zip(x+w/2,ctrl):  ax.text(xi,v+.9,f"{v}%",ha="center",size=9.5,weight="bold",color=MID)
ax.set_xticks(x); ax.set_xticklabels(["Feb 2019\n(baseline)","Feb 2020\n(after 1 year)"])
ax.set_ylim(0,52); ax.set_ylabel("% employed full-time",labelpad=8)
bare(ax)
ax.legend(frameon=False,loc="upper left",bbox_to_anchor=(.005,1.12),fontsize=8.8,
          labelcolor=MID,handlelength=1.4,ncol=2)
ax.annotate("+12 points, against +5 in the control group",xy=(.18,45.5),xycoords="data",
            size=8.6,style="italic",color=MID)
title(fig,"Unconditional income didn't reduce work — Stockton SEED")
caption(fig,"Stockton, California, SEED programme: 125 residents received $500/month with no work requirement, 2019–2021.\n"
"Full-time employment among recipients rose 28% to 40% in the first year, against 32% to 37% in the randomised control\n"
"group — a gain more than twice the control's. Source: Stockton Economic Empowerment Demonstration, stocktondemonstration.org.")
save(fig,OUT+"03_stockton_seed_employment.svg")

# ------------------------------------------------------ 01 delegation (donut)
fig=plt.figure(figsize=(7.6,5.4)); ax=fig.add_axes([.31,.30,.40,.565])
vals=[25,75]
ax.pie(vals,startangle=90,counterclock=False,colors=[ACCENT,PALE],
       wedgeprops=dict(width=.40,edgecolor=BG,linewidth=2))
ax.text(0,0,"25%",ha="center",va="center",size=21,weight="bold",color=ACCENT)
ax.text(0,-.22,"of all delegated votes",ha="center",va="center",size=8.4,color=MID)
ax.set_aspect("equal")
import matplotlib.patches as mp
fig.legend(handles=[mp.Patch(color=ACCENT,label="38 individuals (top delegates)"),
                    mp.Patch(color=PALE,label="All other participants")],
           frameon=False,loc="lower center",bbox_to_anchor=(.5,.250),ncol=2,
           fontsize=8.8,labelcolor=MID,handlelength=1.3)
title(fig,"Unmanaged delegation concentrates fast")
caption(fig,"Germany's Pirate Party, LiquidFeedback platform, 2010–2013: of 14,964 delegations recorded, 38 individuals received over 100\n"
"each — at least a quarter of all delegated votes, concentrated among a tiny fraction of participants, with no renewal requirement\n"
"to reset it. Source: Kling et al., “Voting Behaviour and Power in Online Democracy” (arXiv:1503.07723), 2015.",y=.185)
save(fig,OUT+"01_delegation_concentration.svg")

# ------------------------------------------------- 02 Porto Alegre (citywide only)
# The "poorest neighbourhoods: 30% -> 98%" series was removed on 3 Oct 2026. It was
# attributed to the World Bank Empowerment Case Study, which does not contain it: the
# study gives only "75 percent of total households in 1988 to 98 percent in 1997"
# citywide, and separately that "a third of the city's population lived in isolated
# slums ... and lacked access". A third of the population lacking access is not a 30%
# coverage rate in slums, and if a third of the city lacked access then coverage there
# was near zero. The figure was a misreading of the source carrying the source's name.
fig=plt.figure(figsize=(8.0,5.7)); ax=fig.add_axes([.125,.31,.845,.525])
x=np.arange(1); w=.34
before=[75]; after=[98]
ax.bar(x-w/2-.012,before,w,color=LIGHT,label="1988")
ax.bar(x+w/2+.012,after,w,color=ACCENT,label="1997")
for xi,v in zip(x-w/2-.012,before): ax.text(xi,v+1.6,f"{v}%",ha="center",size=9.5,weight="bold",color=MID)
for xi,v in zip(x+w/2+.012,after):  ax.text(xi,v+1.6,f"{v}%",ha="center",size=9.5,weight="bold",color=ACCENT)
ax.set_xticks(x); ax.set_xticklabels(["Citywide"]); ax.set_xlim(-.6,.6)
ax.set_ylim(0,112); ax.set_yticks([0,20,40,60,80,100])
ax.set_ylabel("% households with sewer/water connection",labelpad=8)
bare(ax)
ax.legend(frameon=False,loc="upper left",bbox_to_anchor=(.005,1.115),ncol=2,
          fontsize=8.8,labelcolor=MID,handlelength=1.4)
title(fig,"Participatory budgeting, put to work: Porto Alegre")
caption(fig,"Porto Alegre, Brazil adopted participatory budgeting in 1989. Sewer and water connections rose from 75% to 98% of total\n"
"households within a decade. The same source records that before the reforms a third of the city's population lived in isolated\n"
"slums without access to clean water or sanitation, but publishes no separate coverage rate for those neighbourhoods, so none is\n"
"shown here. Source: World Bank, Empowerment Case Studies: Participatory Budgeting.")
save(fig,OUT+"02_porto_alegre_sanitation.svg")

# -------------------------------------------------- 22 tax levers (one hue)
fig=plt.figure(figsize=(8.4,6.4)); ax=fig.add_axes([.125,.40,.845,.44])
labels=["OECD global\nminimum tax\n(15% floor)","2% minimum tax\non billionaires\n(>$1B wealth)","Extend to\ncentimillionaires\n(>$100M wealth)"]
mid=[141,225,120]; lo=[108.5,200,100]; hi=[174,250,140]
x=np.arange(3)
ax.bar(x,mid,.46,color=ACCENT)
ax.errorbar(x,mid,yerr=[np.array(mid)-np.array(lo),np.array(hi)-np.array(mid)],
            fmt="none",ecolor=INK,elinewidth=1.2,capsize=5,capthick=1.2)
for xi,h,l,u in zip(x,mid,lo,hi):
    # \$ escaped: two bare $ in one string would put matplotlib into mathtext mode.
    ax.text(xi,u+9,f"\\${l:g}B–\\${u:g}B/yr",ha="center",size=8.6,weight="bold",color=INK)
ax.set_xticks(x); ax.set_xticklabels(labels)
ax.set_ylim(0,300); ax.set_ylabel("Estimated annual global revenue (\\$B USD, worldwide)",labelpad=8)
bare(ax)
title(fig,"Three real, already-costed global tax levers")
fig.text(.968,.845,"Combined: \\$408B–\\$564B/yr worldwide",size=9.6,weight="bold",color=ACCENT,ha="right")
caption(fig,"All figures are WORLDWIDE annual revenue in US dollars, accruing to the jurisdictions where the profit or the taxpayer sits.\n"
"A coalition collects its own share, not the total. OECD global minimum tax (Pillar Two, 15% corporate floor): \\$108.5B is the actual\n"
"2024 realised revenue (OECD, reported €79–109bn / \\$91–126bn) — well below the original \\$155–192B/yr projection, shown here as the\n"
"aggressive case; a real example of projected vs. realised tax revenue diverging. Billionaire and centimillionaire minimum-wealth\n"
"taxes: Gabriel Zucman / EU Tax Observatory report to the G20 (June 2024) — 2% of wealth from ~3,000 billionaires (\\$200–250B/yr),\n"
"plus an estimated \\$100–140B/yr extending the same standard to ~centimillionaires. None of these three measures is currently in\n"
"force globally; each requires multilateral coordination this document does not assume will happen.")
save(fig,OUT+"22_global_tax_levers.svg")
