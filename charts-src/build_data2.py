# -*- coding: utf-8 -*-
import sys,os; _D=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,_D)
from _style import *
import matplotlib.pyplot as plt, numpy as np, matplotlib.patches as mp
use_style(); OUT=os.path.join(_D,"..","site","assets","charts")+os.sep

# Chart 19 retired 3 Oct 2026 with the redirected-transfer model and archived to
# _archive/retired-charts/. The generator is removed rather than left dormant because
# README's workflow is 'rebuild, then copy out/ over site/assets/charts/' — which would
# restore a retired chart to the served directory. Same rule as chart 24.


# ---------------------------------------------------------- 16 Kelowna projected
fig=plt.figure(figsize=(8.6,6.2)); ax=fig.add_axes([.135,.375,.835,.455])
lab=["Conservative\n(Planning & Other only)","Expanded\n(no social-services line\nexists to add)","Expanded+\n(+ vacant-position\nwage attrition)"]
val=[10.2,10.2,15.0]
ax.bar(range(3),val,.5,color=[PALE,ROSE,ACCENT])
ann=["$10.2M/yr\n($68/resident/yr\n≈ $5.68/month)","$10.2M/yr\n($68/resident/yr\n≈ $5.68/month)","$15.0M/yr\n($100/resident/yr\n≈ $8.33/month)"]
for i,(v,t) in enumerate(zip(val,ann)):
    ax.text(i,v+.7,t,ha="center",size=8.4,color=INK,linespacing=1.45)
ax.set_xticks(range(3)); ax.set_xticklabels(lab,size=8.6)
ax.set_ylim(0,25); ax.set_ylabel("Available for Delegated-Authority\nMechanism redirection ($M/year)",labelpad=8,size=9)
bare(ax)
ax.annotate("no municipal social-services line exists to redirect —\nprovincial jurisdiction in Canada",
            xy=(1.0,15.4),xytext=(1.0,20.8),size=8,style="italic",color=MID,ha="center",va="bottom",
            arrowprops=dict(arrowstyle="-",color=MUTED,lw=.9))
title(fig,"Applied to a real budget: Kelowna, BC")
caption(fig,"ILLUSTRATIVE MODEL applied to Kelowna's real \\$204.3M tax-supported operating budget. Wage-share-within-category and the 4%/yr\n"
"attrition rate are modelled assumptions, not published city figures. Even the most expansive stance modelled here comes to under \\$9/month per\n"
"resident from this single lever — and that is the whole of what a municipality-only deployment supports. The converged figure needs the federal\n"
"payroll tier as well; neither tier counts any redirected transfer payment.",y=.235)
save(fig,OUT+"16_kelowna_projected.svg")
