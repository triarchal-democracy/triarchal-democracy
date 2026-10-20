# -*- coding: utf-8 -*-
"""Rebuild site/about-the-triarc.html's <main> from docs/About_The_Triarc.md.
Run from the repo root:  python3 site-src/gen_about.py"""
import io,re
def inline(t):
    t=t.replace('&','&amp;')
    t=re.sub(r'\*\*(.+?)\*\*',r'<strong>\1</strong>',t)
    t=re.sub(r'(?<![\*\w])\*([^*\n]+?)\*(?!\*)',r'<em>\1</em>',t)
    assert '**' not in t
    return t
SEC={'What it is':'what','1. A research tool':'research',
     '2. A place you can walk into, or write to':'access',
     '3. Shadow deployments of real places':'shadow',
     'What it builds':'builds','How it is funded':'funding',
     'How it is accountable':'accountability','Where this stands':'status'}
md=io.open('docs/About_The_Triarc.md',encoding='utf-8').read().split('\n')
blocks=[];cur=None;buf=[]
for L in md:
    L=L.rstrip()
    if L.startswith('## '):
        if cur: blocks.append((cur,buf))
        cur=L[3:].strip(); buf=[]
    elif cur is not None: buf.append(L)
if cur: blocks.append((cur,buf))
def paras(lines):
    out=[];cur=[]
    for L in lines:
        if L.startswith('![') or L.strip()=='---' or L.startswith('**Where does it fail?**'): continue
        if L.strip()=='':
            if cur: out.append(' '.join(cur)); cur=[]
        else: cur.append(L.strip())
    if cur: out.append(' '.join(cur))
    return out
parts=['''<figure class="chart-fig">
  <img src="assets/charts/07_triarchal_framework_triarc_structure.svg" alt="Organizational chart clarifying Triarchal Democracy, Triarchal Framework, and the Triarc.">
</figure>
''']
first=True
for t,lines in blocks:
    sid=SEC.get(t)
    if not sid: continue
    ps=paras(lines)
    if not ps: continue
    if not first: parts.append('<hr class="divider">\n')
    first=False
    body='\n'.join('  <p>%s</p>'%inline(p) for p in ps)
    parts.append('<section id="%s">\n  <span class="article-label">%s</span>\n%s\n</section>\n'%(sid,inline(t),body))
new='<main>\n\n'+'\n'.join(parts)+'\n</main>'
s=io.open('site/about-the-triarc.html',encoding='utf-8').read()
s=re.sub(r'<main>.*?</main>',lambda m:new,s,flags=re.S)
import seo   # share-card tags are built in one place; see site-src/seo.py
s=seo.apply(s,'about-the-triarc.html')
io.open('site/about-the-triarc.html','w',encoding='utf-8',newline='').write(s)
print("about-the-triarc.html rebuilt:",sum(1 for t,_ in blocks if t in SEC),"sections")
