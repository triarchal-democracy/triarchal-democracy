# -*- coding: utf-8 -*-
import sys,os; _D=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,_D)
from _style import *
import matplotlib.patches as mp, textwrap

_FIG=[9.8, 7.4]           # inches; set via set_fig()
def set_fig(w,h): _FIG[0],_FIG[1]=w,h

def _fit(text,w_ax,h_ax,size):
    """Wrap to the box width and shrink until the block fits the box height."""
    # 10 Oct 2026: wrap conservatively. These SVGs are shown through <img>, so the
    # browser draws them in its own fallback serif (Georgia, DejaVu), which runs
    # ~10% wider than the metrics this estimate assumed; lines reached box edges.
    w_in=w_ax*_FIG[0]*0.84          # 16% inner padding
    h_in=h_ax*_FIG[1]*0.86
    for s in [size,size-.4,size-.8,size-1.2,size-1.6,size-2.0]:
        cpl=max(8,int(w_in*128.0/s))          # ~0.56em average glyph advance
        lines=textwrap.wrap(text,cpl) if "\n" not in text else text.split("\n")
        if len(lines)*s*1.45/72.0 <= h_in:
            return "\n".join(lines),s
    return "\n".join(lines),s

def box(ax,x,y,w,h,text,fill=PALE,edge=None,tc=INK,size=9.0,weight="normal",
        radius=.012,lw=1.0,style="normal"):
    ax.add_patch(mp.FancyBboxPatch((x-w/2,y-h/2),w,h,
        boxstyle=f"round,pad=0,rounding_size={radius}",
        facecolor=fill,edgecolor=edge or "none",linewidth=lw,zorder=2))
    t,s=_fit(text,w,h,size)
    ax.text(x,y,t,ha="center",va="center",size=s,color=tc,weight=weight,
            style=style,zorder=3,linespacing=1.42)

def arrow(ax,x1,y1,x2,y2,label=None,rad=0.0,lp=(0,0),size=7.4):
    ax.annotate("",xy=(x2,y2),xytext=(x1,y1),
        arrowprops=dict(arrowstyle="-|>",color=MID,lw=1.0,
                        connectionstyle=f"arc3,rad={rad}",shrinkA=2,shrinkB=3),zorder=1)
    if label:
        ax.text((x1+x2)/2+lp[0],(y1+y2)/2+lp[1],label,size=size,style="italic",
                color=MUTED,ha="center",va="center",zorder=4)

def canvas(figsize):
    import matplotlib.pyplot as plt
    set_fig(*figsize)
    fig=plt.figure(figsize=figsize)
    ax=fig.add_axes([0,0,1,1]); ax.set_xlim(0,1); ax.set_ylim(0,1); ax.axis("off")
    return fig,ax
