# -*- coding: utf-8 -*-
import sys,os; _D=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,_D)
from _style import *; from _box import *
import matplotlib.pyplot as plt, numpy as np, textwrap
use_style(); OUT=os.path.join(_D,"..","site","assets","charts")+os.sep

# ===================================================== 09 capture pathways
# Re-laid out 10 Oct 2026: the title sat on the top headings, the caption ran into the
# bottom headings, and the head box text overflowed. The SVG is shown through <img>, so a
# browser renders it in its own fallback serif (Georgia on Windows), which runs wider than
# matplotlib's metrics; every column therefore keeps generous clearance.
fig,ax=canvas((9.8,7.4))
title(fig,"Pathways to capture, and where each is answered",y=.968,x=.055,ha="left",size=13.5)
ax.plot([.055,.765],[.50,.50],color=INK,lw=2.0,zorder=1)
box(ax,.875,.50,.205,.17,"Illegitimate\nconcentration\nof power (capture)",fill=ACCENT,tc="#ffffff",size=9.2,weight="bold")
top=[(.165,"Delegation concentration","Social proof reinforces super-delegates","Mitigation: public directory + the delegation renewal cycle"),
     (.385,"Contribution cartels","Coordinated, real-looking work inflates standing","Mitigation: reciprocity damping; detection remains open research"),
     (.605,"Agenda-setting capture","Controls what's discussed, not how votes are cast","Mitigation: the minority-report right")]
for x,h,b,m in top:
    ax.text(x,.875,h,size=9.4,weight="bold",color=ACCENT,ha="center",va="top")
    ax.text(x,.835,"\n".join(textwrap.wrap(b,26)),size=8.1,color=MID,ha="center",va="top",linespacing=1.45)
    ax.text(x,.745,"\n".join(textwrap.wrap(m,28)),size=7.5,color=MUTED,ha="center",va="top",style="italic",linespacing=1.45)
    ax.plot([x,x],[.50,.655],color=MUTED,lw=1.0,zorder=1)
bot=[(.275,"Nominee networks","Appointment pipeline reproduces itself","Mitigation: relationship disclosure, no quota"),
     (.495,"Dispute panel capture","Volunteer pool itself skews political","Mitigation: public randomness + appeals"),
     (.715,"Founder path-dependency","Early culture outlasts formal authority","Mitigation: pluralism in handover criteria")]
for x,h,b,m in bot:
    ax.plot([x,x],[.50,.355],color=MUTED,lw=1.0,zorder=1)
    ax.text(x,.335,"\n".join(textwrap.wrap(m,28)),size=7.5,color=MUTED,ha="center",va="top",style="italic",linespacing=1.45)
    ax.text(x,.255,"\n".join(textwrap.wrap(b,26)),size=8.1,color=MID,ha="center",va="top",linespacing=1.45)
    ax.text(x,.170,h,size=9.4,weight="bold",color=ACCENT,ha="center",va="top")
caption(fig,"The central risk is not corruption but legitimate, competence-driven concentration becoming irreversible. Each pathway lists\n"
"the mitigation the documents actually adopt; contribution-cartel detection remains open, not solved. No mitigation here relies on\n"
"prompting or urgency mechanics: the platform is forbidden from manufacturing attention.",y=.092,x=.055,size=7.3)
save(fig,OUT+"09_fishbone_capture_pathways.svg")

# ===================================================== 07 three names
# Lines broken by hand (10 Oct 2026): a browser renders this through <img> in its own
# fallback serif, wider than matplotlib measures, and auto-wrapped lines reached the box edges.
fig,ax=canvas((9.4,7.0))
title(fig,"Three names, three distinct things",y=.968,x=.055,ha="left",size=14)
box(ax,.50,.845,.62,.090,"Triarchal Democracy — the governance model itself:\nan idea, not an organisation",fill=BG,edge=INK,size=9.6)
arrow(ax,.50,.797,.50,.735,"made concrete by",lp=(.155,0))
box(ax,.50,.665,.62,.105,"Triarchal Framework — the open-source software\nthat provides a platform to network governance publicly",fill=ACCENT,tc="#ffffff",size=10)
arrow(ax,.50,.465,.50,.612,"develops, stewards\n& runs on",lp=(.140,0))
box(ax,.50,.395,.56,.115,"The Triarc — the nonprofit that develops and stewards\nTriarchal Framework, and governs itself through\nits own deployment of it",fill=PALE,edge=ACCENT,size=9.4)
box(ax,.50,.235,.80,.080,"Federation Compact — governs relationships between independent deployments\nof Triarchal Framework; dormant until ratified by more than one",fill=BG,edge=RULE,tc=MUTED,size=8.8)
box(ax,.50,.140,.80,.075,"The Triarc stewards Triarchal Framework and governs itself;\nit does not govern any other deployment that may someday run the software.",fill=BG,edge=RULE,size=8.8)
caption(fig,"The model is the idea. Triarchal Framework is the software. The Triarc is the nonprofit that develops and stewards it — and,\n"
"like any deployment, governs itself by running its own instance of it.",y=.078,x=.055,size=7.4)
save(fig,OUT+"07_triarchal_framework_triarc_structure.svg")

# Chart 18 retired 3 Oct 2026 with the redirected-transfer model and archived to
# _archive/retired-charts/. The generator is removed rather than left dormant because
# README's workflow is 'rebuild, then copy out/ over site/assets/charts/' — which would
# restore a retired chart to the served directory. Same rule as chart 24.


# Chart 24 (minors' Growth Trust) retired 21 Sep 2026 with the Trust itself and
# archived to _archive/retired-charts/. The generator is removed rather than left
# dormant because README's workflow is 'rebuild, then copy out/ over site/assets/
# charts/' — which would have restored a retired-concept chart to the served dir.


# Chart 20 retired 3 Oct 2026 with the redirected-transfer model and archived to
# _archive/retired-charts/. The generator is removed rather than left dormant because
# README's workflow is 'rebuild, then copy out/ over site/assets/charts/' — which would
# restore a retired chart to the served directory. Same rule as chart 24.

