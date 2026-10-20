# -*- coding: utf-8 -*-
"""Build site/the-proposition.html from docs/Triarchal_Democracy.md, reusing the About shell."""
import io,re,html
SHELL='site/about-the-triarc.html'; OUT='site/the-proposition.html'
def inline(t):
    t=t.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
    t=re.sub(r'\*\*(.+?)\*\*',r'<strong>\1</strong>',t)
    t=re.sub(r'(?<![\*\w])\*([^*\n]+?)\*(?!\*)',r'<em>\1</em>',t)
    return t
lines=io.open('docs/Triarchal_Democracy.md',encoding='utf-8').read().split('\n')
secs=[];cur=None;buf=[]
for L in lines:
    L=L.rstrip()
    if L.startswith('## '):
        if cur: secs.append((cur,buf))
        cur=L[3:].strip(); buf=[]
    elif cur is not None: buf.append(L)
if cur: secs.append((cur,buf))
LIST=re.compile(r'^(\d+)\.\s+(.+)$')
def paras(ls):
    # Paragraphs join their lines; a run of "1. ..." lines becomes one ordered list,
    # one item per line (it used to be joined into a single paragraph).
    out=[];c=[];items=[]
    def flush():
        nonlocal c,items
        if c: out.append(' '.join(c)); c=[]
        if items: out.append(('ol',items)); items=[]
    for L in ls:
        if L.strip() in ('','---') or L.startswith('**Where does it fail?**'):
            flush(); continue
        m=LIST.match(L.strip())
        if m:
            if c: out.append(' '.join(c)); c=[]
            items.append(m.group(2)); continue
        if items: flush()
        c.append(L.strip())
    flush()
    return out
IMG=re.compile(r'^!\[(.*?)\]\((.*?)\)$')
def render(p):
    if isinstance(p,tuple):
        lis='\n'.join('    <li style="margin-bottom:0.6rem;padding-left:0.3rem">%s</li>'%inline(i) for i in p[1])
        return '  <ol style="margin:0 0 1.15rem 1.4rem;padding:0">\n%s\n  </ol>'%lis
    m=IMG.match(p.strip())
    if not m: return '  <p>%s</p>'%inline(p)
    alt,src=m.group(1),m.group(2)
    src=re.sub(r'^\.\./site/','',src)            # markdown path is repo-relative; pages are not
    return ('  <figure class="chart-fig">\n    <img src="%s" alt="%s">\n  </figure>'
            %(html.escape(src,quote=True),html.escape(alt,quote=True)))

parts=['<main>','']
first=True
for i,(t,ls) in enumerate(secs):
    ps=paras(ls)
    if not ps: continue
    if not first: parts.append('<hr class="divider">\n')
    first=False
    sid=re.sub(r'[^a-z0-9]+','-',t.lower()).strip('-')[:28]
    body='\n'.join(render(p) for p in ps)
    parts.append('<section id="%s">\n  <span class="article-label">%s</span>\n%s\n</section>\n'%(sid,inline(t),body))
parts.append('\n</main>')
s=io.open(SHELL,encoding='utf-8').read()
s=re.sub(r'<main>.*?</main>',lambda m:'\n'.join(parts),s,flags=re.S)
s=re.sub(r'<title>.*?</title>','<title>The proposition — Triarchal Democracy</title>',s,flags=re.S)
s=re.sub(r'<div class="kicker">.*?</div>','<div class="kicker">Why we are building this</div>',s,count=1,flags=re.S)
s=re.sub(r'<h1>.*?</h1>','<h1>The proposition</h1>',s,count=1,flags=re.S)
s=re.sub(r'<p class="hero-sub">.*?</p>',
  '<p class="hero-sub">Governance, contribution, and civic return, built as one structure rather than three.</p>',s,count=1,flags=re.S)
s=re.sub(r'<meta name="description" content=".*?">',
  '<meta name="description" content="Governance, contribution and civic return are built as three separate systems. Each fails for reasons the other two would address. The case for building them as one.">',s,count=1,flags=re.S)
s=re.sub(r'<div class="closing">.*?</div>\s*(?=<footer)',
  '<div class="closing">\n  <span class="article-label">Where does it fail?</span>\n  <h2>Tell us what we have wrong.</h2>\n'
  '  <p>This is early, and the most useful thing anyone can do right now is find the hole in it.</p>\n'
  '  <a class="cta" href="work-with-us.html#reach">Challenge it in public</a>\n</div>\n\n',s,flags=re.S)
import seo   # share-card tags are built in one place; see site-src/seo.py
s=seo.apply(s,'the-proposition.html')
io.open(OUT,'w',encoding='utf-8',newline='').write(s)
print("wrote",OUT,"|",len(secs),"sections")
