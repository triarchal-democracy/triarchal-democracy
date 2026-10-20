# -*- coding: utf-8 -*-
"""Rewrite the clause text of site/charter.html and site/documents.html from the
markdown in docs/founding/. Clause paragraphs are replaced in place and the
`> **Why**` notes are inserted as <aside class="rationale"> after their anchor
clause; everything else in the page (nav, figures, doc intros, pull quotes) is
left untouched. Run from the repo root:  python3 site-src/sync_site.py
"""
import io,re
D='docs/founding/'

def inline(t):
    t=t.replace('&','&amp;')
    t=re.sub(r'`([^`]+)`',lambda m:'<code>'+m.group(1)+'</code>',t)
    t=re.sub(r'\*\*(.+?)\*\*',r'<strong>\1</strong>',t)
    t=re.sub(r'(?<![\*\w])\*([^*\n]+?)\*(?!\*)',r'<em>\1</em>',t)
    assert '**' not in t, t[:120]
    return t

CLAUSE  =re.compile(r'^\*\*(\d+\.\d+[a-z]?)\*\*\s+(.*)$')            # **1.1** text
CLAUSE_T=re.compile(r'^\*\*(\d+\.\d+[a-z]?)\s+(.+?)\*\*\s*(.*)$')    # **9.2 Title.** text
RIGHT   =re.compile(r'^\*\*([IVX]+)\.\s+(.+?)\*\*\s*(.*)$')          # **I. Voice.** text

# A clause may be hard-wrapped across several markdown lines. Everything up to
# 4 Oct 2026 happened to be one long line each, so parse() read one line and
# stopped — and the six schedules of defaults, which ARE wrapped, were published
# cut off mid-sentence. verify.py imports this same parse(), so section 1
# compared truncated page text against truncated source text and passed. A
# shared bug is invisible to a check built on it.
_STOP=('**','>','#','|','-','*','<')
def _continuation(lines,i):
    """Lines i.. that belong to the clause body started just before i."""
    out=[]
    while i<len(lines):
        L=lines[i].rstrip()
        if not L.strip(): break
        if L.lstrip().startswith(_STOP): break
        out.append(L.strip()); i+=1
    return out,i

def parse(path):
    lines=io.open(path,encoding='utf-8').read().split('\n')
    clauses={}; notes=[]; i=0; last=None
    while i<len(lines):
        L=lines[i].rstrip()
        m,mt,mr=CLAUSE.match(L),CLAUSE_T.match(L),RIGHT.match(L)
        if m:
            _b=[m.group(2).strip()]; _c,i=_continuation(lines,i+1); _b+=_c
            clauses[m.group(1)]=inline(' '.join(_b)); last=m.group(1); continue
        if mt:
            n,t,r=mt.group(1),mt.group(2).strip(),mt.group(3).strip()
            _b=[r]; _c,i=_continuation(lines,i+1); _b+=_c
            clauses[n]='<strong>'+inline(t)+'</strong> '+inline(' '.join(_b)); last=n; continue
        if mr:
            n,t,r=mr.group(1),mr.group(2).strip(),mr.group(3).strip()
            _b=[r]; _c,i=_continuation(lines,i+1); _b+=_c
            clauses[n]='<strong>'+inline(t)+'</strong> '+inline(' '.join(_b)); last=n; continue
        if L.startswith('>'):
            buf=[]
            while i<len(lines) and lines[i].startswith('>'):
                buf.append(lines[i][1:].strip()); i+=1
            paras=[];cur=[]
            for seg in buf:
                if seg=='':
                    if cur: paras.append(' '.join(cur)); cur=[]
                else: cur.append(seg)
            if cur: paras.append(' '.join(cur))
            notes.append((last,[inline(p) for p in paras])); continue
        i+=1
    return clauses,notes

def render_note(paras):
    return ('\n  <aside class="rationale">\n'
            +'\n'.join('    <p>%s</p>'%p for p in paras)+'\n  </aside>')

def update(htmlpath,mapping):
    s=io.open(htmlpath,encoding='utf-8').read()
    tot_c=tot_n=0; rep=[]
    def do(mo):
        nonlocal tot_c,tot_n
        head,body=mo.group(1),mo.group(2)
        sid=re.search(r'id="([a-z0-9-]+)"',head).group(1)
        src=mapping.get(sid)
        if not src: return mo.group(0)
        clauses,notes=parse(D+src); n=[0]
        def rp(m):
            num=m.group(1)
            if num not in clauses: return m.group(0)
            new='<p><span class="clause-num">%s</span>%s</p>'%(num,clauses[num])
            if new!=m.group(0): n[0]+=1
            return new
        body=re.sub(r'<p><span class="clause-num">([0-9]+\.[0-9]+[a-z]?|[IVXL]+)</span>.*?</p>',rp,body,flags=re.S)

        # Insert clauses this section does not have yet.
        #
        # parse() returns EVERY clause in the markdown file, while `body` is ONE
        # section. charter.html splits one file across nine sections, so the
        # scoping guard is the clause's ARTICLE: only a clause whose major number
        # already appears in this body belongs to it. Anchoring on "the clause
        # before it in source order" is NOT enough — 2.1 follows 1.5, so Article
        # I would swallow the rest of the charter, one cascading insert at a
        # time. That happened twice before this comment existed.
        #
        # A brand-new Article is deliberately not inserted: there is no body that
        # claims it, and verify.py reporting it "missing from the site" is the
        # right failure.
        order=list(clauses.keys())
        present=set(re.findall(r'<p><span class="clause-num">([0-9]+\.[0-9]+[a-z]?|[IVXL]+)</span>',body))
        majors={c.split('.')[0] for c in present if '.' in c}
        for idx,num in enumerate(order):
            if num in present or '.' not in num: continue
            if num.split('.')[0] not in majors: continue   # not this section's Article
            prev=next((order[k] for k in range(idx-1,-1,-1) if order[k] in present),None)
            if prev is None or prev.split('.')[0] != num.split('.')[0]: continue
            apat=re.compile(r'(<p><span class="clause-num">'+re.escape(prev)+r'</span>.*?</p>)',re.S)
            m=apat.search(body)
            if not m: continue
            frag='\n  <p><span class="clause-num">%s</span>%s</p>'%(num,clauses[num])
            body=body[:m.end()]+frag+body[m.end():]
            present.add(num); n[0]+=1
        body=re.sub(r'\s*<aside class="rationale">.*?</aside>','',body,flags=re.S)  # idempotent
        ins=0
        for anchor,paras in notes:
            if anchor is None: continue
            pat=re.compile(r'(<p><span class="clause-num">'+re.escape(anchor)+r'</span>.*?</p>'
                           r'(?:\s*<(?:ul|ol|table|figure)\b.*?</(?:ul|ol|table|figure)>)*)',re.S)
            if not pat.search(body): continue
            body=pat.sub(lambda mm: mm.group(1)+render_note(paras),body,count=1); ins+=1
        tot_c+=n[0]; tot_n+=ins; rep.append((sid,n[0],ins,len(notes)))
        return head+body+'</section>'
    s=re.sub(r'(<section[^>]*>)(.*?)</section>',do,s,flags=re.S)
    io.open(htmlpath,'w',encoding='utf-8',newline='').write(s)
    return tot_c,tot_n,rep

CHARTER={k:'Founding_Charter.md' for k in
 ['membership','contribution','governance','standing','treasury','disputes','transparency','amendment','founding']}
DOCS={'rights':'Member_Bill_of_Rights.md','conduct':'Code_of_Conduct.md',
 'contribution':'Contribution_Code.md','treasury':'Treasury_Code.md',
 'disputes':'Dispute_Procedure_Code.md','procedure':'Rules_of_Procedure.md',
 'compact':'Federation_Compact.md','government':'Government_Adoption_Compact.md',
 'triarc-membership':'Triarc_Membership_Code.md','triarc-operations':'Triarc_Operations_Code.md'}

if __name__=='__main__':
    for path,mp in (('site/charter.html',CHARTER),('site/documents.html',DOCS)):
        c,n,rep=update(path,mp)
        print("%-22s clauses updated %3d | notes %2d"%(path,c,n))
    import seo   # share-card tags: stamp every page, see site-src/seo.py
    print("share tags:", ', '.join(seo.stamp_all()) or 'already in sync')
