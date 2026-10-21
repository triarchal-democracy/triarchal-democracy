# -*- coding: utf-8 -*-
"""Whole-site consistency check. Run from the repo root: python3 site-src/verify.py"""
import io,re,html,glob,sys,os
sys.path.insert(0,'site-src')
from sync_site import parse, CHARTER, DOCS
def txt(x): return re.sub(r'\s+',' ',re.sub(r'<[^>]+>','',html.unescape(x))).strip()
fail=0
def bad(msg):
    global fail; fail+=1; print("  FAIL:",msg)

print("1. clause text, both directions")
ok=0
for f,mp in (('site/charter.html',CHARTER),('site/documents.html',DOCS)):
    s=io.open(f,encoding='utf-8').read()
    present={}
    for sec in re.finditer(r'(<section[^>]*id="([a-z0-9-]+)"[^>]*>)(.*?)</section>',s,re.S):
        sid,body=sec.group(2),sec.group(3)
        if sid not in mp: continue
        cl,_=parse('docs/founding/'+mp[sid])
        present.setdefault(mp[sid],set()).update(re.findall(r'clause-num">([0-9.a-zIVX]+)<',body))
        for m in re.finditer(r'<p><span class="clause-num">([0-9.a-zIVX]+)</span>(.*?)</p>',body,re.S):
            n,h=m.group(1),m.group(2)
            if n not in cl: bad("%s %s: clause %s on page has no source"%(f,sid,n)); continue
            if txt(h)!=txt(cl[n]): bad("%s %s clause %s text differs from source"%(f,sid,n))
            else: ok+=1
    for doc,have in present.items():
        cl,_=parse('docs/founding/'+doc)
        for c in cl:
            if c not in have: bad("%s: clause %s missing from the site"%(doc,c))
print("   %d clause paragraphs match their source"%ok)

print("2. markup integrity")
for f in sorted(glob.glob('site/*.html')):
    s=io.open(f,encoding='utf-8').read()
    if '**' in s: bad(f+": raw markdown ** left in page")
    for tag in ('p','section','div','figure','aside','ul','ol'):
        o=len(re.findall(r'<%s\b'%tag,s)); c=s.count('</%s>'%tag)
        if o!=c: bad("%s: <%s> %d open / %d close"%(f,tag,o,c))
    if re.search(r'`docs/|<code>docs/',s): bad(f+": repo path leaked into prose")
    if 'Watch deployment' in s: bad(f+": retired term")
    for m in re.finditer(r'src="(assets/charts/[^"]+)"',s):
        if not os.path.exists('site/'+m.group(1)): bad("%s: missing chart %s"%(f,m.group(1)))
print("   %d pages checked"%len(glob.glob('site/*.html')))

print("3. retired rules must not appear anywhere")
for f in glob.glob('docs/founding/*.md')+glob.glob('docs/*.md')+glob.glob('site/*.html'):
    if '_originals_' in f or 'Chart_Review' in f or 'CLAUDE' in f: continue
    s=io.open(f,encoding='utf-8').read()
    if re.search(r'10%\s*(accrual\s*)?cap|capped at 10%|10% per Member',s,re.I): bad(f+": retired 10% cap")
    if re.search(r'live from day one|no activation vote',s,re.I): bad(f+": contradicts Treasury 5.1")
    # Added 3 Oct 2026. A chart note said "gate-free ... not a proposed direction,
    # current law" for about 32 days. It survived the line above because that greps
    # the retired clause VERBATIM and this was a paraphrase, and survived sync_site.py
    # because that only rewrites clause paragraphs, never chart notes.
    if re.search(r'gate[- ]free|ungated',s,re.I): bad(f+": paraphrases the retired ungated dividend")
    # Removed 3 Oct 2026: "30% to 98% in the poorest neighbourhoods" was attributed to
    # the World Bank Empowerment Case Study, which gives only the citywide 75%->98% and
    # separately says a third of the population lived in slums without access. A third
    # of the city lacking access is not a 30% coverage rate in slums.
    if re.search(r'poorest neighbourhoods',s,re.I) and re.search(r'\b30%',s):
        bad(f+": the unsourced Porto Alegre poorest-neighbourhoods figure is back")
    if re.search(r'not a proposed direction|current law|as ratified here|already ratified',s,re.I):
        bad(f+": claims the founding documents are ratified law (they are proposals)")

# The same retired rules, in the app. This scan was added on 28 September 2026 after the
# `consistency` agent found both of the patterns above alive in app/src — treasury.tsx said the
# dividend was "live from day one", layout.tsx said dividends were "capped at 10%". Section 3
# had banned both strings for weeks and had simply never looked at app/. It is line-level rather
# than file-level because source files legitimately explain why a rule was retired; a comment
# block headed `retired-rule-ok` is exempt, and the exemption runs to the end of that block.
print("3b. retired rules must not appear in the app either")
RETIRED=[(re.compile(r"10%\s*(accrual\s*)?cap|capped at 10%|10% per Member",re.I),"retired 10% cap"),
         (re.compile(r"live from day one|no activation vote",re.I),"contradicts Treasury 5.1")]
scanned=0
for f in sorted(glob.glob('app/src/**/*.ts',recursive=True)+glob.glob('app/src/**/*.tsx',recursive=True)):
    scanned+=1; exempt=False
    for n,line in enumerate(io.open(f,encoding='utf-8'),1):
        st=line.strip()
        if 'retired-rule-ok' in line: exempt=True
        elif exempt and not (st.startswith('//') or st.startswith('*') or st.startswith('/*')): exempt=False
        if exempt: continue
        for rx,why in RETIRED:
            if rx.search(line): bad("%s:%d: %s — %s"%(f,n,why,st[:80]))
print("   %d app source files scanned"%scanned)

# The Poverty-Line Supplement was removed from the founding documents on 21 September 2026
# The founding documents are unpublished drafts and are written as first drafts, so no
# change record exists in docs/ for this; the history is in _archive/. It may still be
# discussed historically there,
# but the canonical founding documents, every live page and every served chart must not mention it.
# (Charts are included because chart 12 carried it for a day after the pages were clean.)
for f in [g for g in glob.glob('docs/founding/*.md') if 'REWRITE' not in g]+glob.glob('site/*.html')+glob.glob('site/assets/charts/*.svg'):
    if re.search(r'Poverty-Line Supplement|floor top-up', io.open(f,encoding='utf-8').read()):
        bad(f+": mentions the retired Poverty-Line Supplement")

# every chart an HTML page references must actually exist in site/assets/charts/
for f in glob.glob('site/*.html'):
    for src in re.findall(r'src="(assets/charts/[^"]+)"', io.open(f,encoding='utf-8').read()):
        if not os.path.exists('site/'+src): bad(f+": references missing chart "+src)

print("1b. clause numbers must be unique within a document")
# parse() returns a dict, so a duplicate number is silently overwritten and the
# both-ways clause check cannot see it. Appending a schedule to Triarc Membership
# produced a second 3.2 on 4 Oct and every check passed.
_dups=0
for _f in sorted(glob.glob('docs/founding/*.md')):
    _seen={}
    for _n in re.findall(r'^\*\*([0-9]+\.[0-9]+[a-z]?)\*\*',io.open(_f,encoding='utf-8').read(),re.M):
        _seen[_n]=_seen.get(_n,0)+1
    for _n,_c in sorted(_seen.items()):
        if _c>1: bad("%s: clause %s appears %d times"%(_f,_n,_c)); _dups+=1
print("   %d documents checked, %d duplicate clause numbers"%(len(glob.glob('docs/founding/*.md')),_dups))

print("2b. no clause paragraph may be truncated")
# Section 1 compares page text against source text using sync_site's parse(), so
# a bug IN parse() is invisible to it: on 4 Oct six hard-wrapped clauses were
# published cut off mid-sentence and section 1 passed, because it compared
# truncated to truncated. This checks the served text on its own terms.
_trunc=0
for _f in ('site/charter.html','site/documents.html'):
    _s=io.open(_f,encoding='utf-8').read()
    for _m in re.finditer(r'<p><span class="clause-num">([0-9.a-zIVXL]+)</span>(.*?)</p>',_s,re.S):
        _t=txt(_m.group(2))
        if not _t:
            bad("%s: clause %s is empty"%(_f,_m.group(1))); continue
        if _t[-1] not in '.?!:;)"\u201d\u2019':
            bad("%s: clause %s ends mid-sentence (%r) \u2014 parse() may be dropping continuation lines"
                %(_f,_m.group(1),_t[-60:]))
        _trunc+=1
print("   %d clause paragraphs end cleanly"%_trunc)

print("3c. clause cross-references must resolve")
# Added 4 Oct 2026. The schedules of defaults (Charter 2.6, Treasury 9.7, and the
# rest) are dense with clause citations, and a citation that points at nothing is
# the "something moved and the thing pointing at it did not" defect in its purest
# form. This resolves every "<Document> N.M" reference and every bare "(N.M)".
# It proves the clause EXISTS; it cannot prove the citation is apt.
import os as _os
_DOCMAP={'charter':'Founding_Charter.md','founding charter':'Founding_Charter.md',
 'treasury code':'Treasury_Code.md','contribution code':'Contribution_Code.md',
 'rules of procedure':'Rules_of_Procedure.md','code of conduct':'Code_of_Conduct.md',
 'dispute procedure code':'Dispute_Procedure_Code.md','member bill of rights':'Member_Bill_of_Rights.md',
 'government adoption compact':'Government_Adoption_Compact.md','federation compact':'Federation_Compact.md',
 'triarc membership code':'Triarc_Membership_Code.md','triarc operations code':'Triarc_Operations_Code.md'}
_cl={}
for _f in glob.glob('docs/founding/*.md'):
    _cl[_os.path.basename(_f)]=set(re.findall(r'^\*\*([0-9]+\.[0-9]+[a-z]?)',io.open(_f,encoding='utf-8').read(),re.M))
_n=0
for _f in sorted(glob.glob('docs/founding/*.md')):
    _b=_os.path.basename(_f); _s=io.open(_f,encoding='utf-8').read()
    for _name,_t in _DOCMAP.items():
        for _m in re.finditer(_name+r'\s+([0-9]+\.[0-9]+[a-z]?)',_s,re.I):
            _n+=1
            if _m.group(1) not in _cl.get(_t,set()):
                bad("%s cites %s %s, which does not exist"%(_b,_t,_m.group(1)))
    for _m in re.finditer(r'\((\d+\.\d+[a-z]?)\)',_s):
        _n+=1
        if _m.group(1) not in _cl[_b]:
            bad("%s cites its own clause %s, which does not exist"%(_b,_m.group(1)))
print("   %d clause references resolved"%_n)

print("3d. the accounts that state arithmetic must match the parameters they describe")
# Added 4 Oct 2026, after a critique pass. Charter 5.3a told the public that full
# distribution of a cycle needs "one Member earning for every five - twenty per
# cent". That was true only while the Foundation Dividend paid nothing. On 3 Oct
# 5.4 became a SHARE of the pool (default one half), and because charter 5.3's cap
# counts both tiers together, every Member now holds that share against their own
# ceiling. The real figure is one in nine. The number moved and the sentence
# pointing at it did not - and nothing could catch it, because prose was the only
# place the claim lived. This section makes params.ts the authority and the clause
# the dependent.
_W={1:"one",2:"two",3:"three",4:"four",5:"five",6:"six",7:"seven",8:"eight",9:"nine",
    10:"ten",11:"eleven",12:"twelve",13:"thirteen",14:"fourteen",15:"fifteen",
    16:"sixteen",17:"seventeen",18:"eighteen",19:"nineteen",20:"twenty",25:"twenty-five",
    50:"fifty",100:"one hundred"}
def _clause(doc,num):
    cl,_=parse('docs/founding/'+doc)
    return re.sub(r'\s+',' ',cl.get(num,''))
_pt=io.open('app/src/lib/params.ts',encoding='utf-8').read()
def _param(name):
    m=re.search(r'\b'+name+r':\s*([0-9.]+)\s*,',_pt)
    if not m: bad("params.ts: cannot read %s"%name); return None
    return float(m.group(1))
_s=_param('foundationPoolShare'); _m=_param('dividendCapMultiple')
if _s is not None and _m is not None:
    _c=_clause('Founding_Charter.md','5.3a')
    if not _c:
        bad("Founding_Charter 5.3a not found")
    elif _s>=1 or _m<=_s:
        bad("foundationPoolShare=%s / dividendCapMultiple=%s leave the cap undefined"%(_s,_m))
    else:
        # Civic headroom per Member is (m - s) equal shares; the Civic pool is
        # (1 - s) of the cycle. Earners needed to absorb it: N(1-s)/(m-s).
        _ratio=(_m-_s)/(1.0-_s)
        _every=int(round(_ratio))
        _pct=int(round(100.0/_ratio))
        _binds_below=int(_ratio)+1   # headroom exceeds the whole Civic pool at N <= floor(ratio)
        for _label,_need in (("one in %s"%_W.get(_every,_every), "one in %s"%_W.get(_every,_every)),
                             ("%s per cent"%_W.get(_pct,_pct), "%s per cent"%_W.get(_pct,_pct)),
                             ("below %s Members"%_W.get(_binds_below,_binds_below),
                              "below %s members"%_W.get(_binds_below,_binds_below))):
            if _need.lower() not in _c.lower():
                bad("Charter 5.3a: params give %s (share %s, multiple %s) but the clause does not say it"
                    %(_label,_s,_m))
        print("   5.3a: share %.2f, multiple %.0f -> one in %d, %d%%, binds on nobody below %d"
              %(_s,_m,_every,_pct,_binds_below))

print("3e. the participation floor arithmetic must match the class table")
# Same shape as 3d. Rules 1.3b said the ten-Member floor binds on "three of the
# five classes" at thirty Members and that the percentage "does not overtake it
# until one hundred". Both were read off the ten-per-cent classes and quietly
# applied to all five: charter amendments sit at twenty per cent, where six is
# also below ten, so the count is four, and twenty per cent overtakes ten at
# fifty Members rather than a hundred. The table is the authority here.
_rules=io.open('docs/founding/Rules_of_Procedure.md',encoding='utf-8').read()
_rows=re.findall(r'^\|\s*([A-Za-z][A-Za-z ]+?)\s*\|[^|]*\|[^|]*\|[^|]*\|\s*([0-9]+)%\s*\|',
                 _rules,re.M)
_floors=set(int(x) for x in re.findall(r'minParticipationMembers:\s*([0-9]+)',_pt))
if len(_rows)!=5:
    bad("Rules 1.3: expected 5 proposal classes in the table, parsed %d"%len(_rows))
elif len(_floors)!=1:
    bad("params.ts: minParticipationMembers disagrees across classes (%s)"%sorted(_floors))
else:
    _fl=_floors.pop()
    _b=_clause('Rules_of_Procedure.md','1.3b')
    _at30=sum(1 for _,pc in _rows if -(-30*int(pc)//100) < _fl)
    _need="%s of the five classes"%_W.get(_at30,_at30)
    if _need.lower() not in _b.lower():
        bad("Rules 1.3b: at 30 Members the %d-Member floor binds on %d of 5 classes, not as stated"
            %(_fl,_at30))
    # "Overtakes" is strict exceedance, the convention charter 3.5a uses: at
    # exactly 100 Members ten per cent IS ten, equal to the floor, not greater.
    # So the crossover is the first N at which the percentage strictly exceeds
    # the floor, and the clause states it as "passes" that figure.
    _cross=sorted(set(min(n for n in range(1,100001) if -(-n*int(pc)//100) > _fl) for _,pc in _rows
                      if int(pc) <= 20))
    for _x in _cross:
        _pass=_x-1   # stated as "passes N", meaning the crossover is at N+1
        if _W.get(_pass,str(_pass)).lower() not in _b.lower() and str(_pass) not in _b:
            bad("Rules 1.3b: the percentage overtakes the %d-Member floor above %d Members, unstated"
                %(_fl,_pass))
    print("   1.3b: floor %d binds on %d of 5 at thirty; overtaken above %s"
          %(_fl,_at30,", ".join(str(x-1) for x in _cross)))

print("3f. assistance programmes: out of scope by default, never counted, never claimed permanent")
# Added 4 Oct 2026, founder decision. Government Adoption Compact 7.1a bars every
# programme resting on a disability, need or means determination from redirection.
# Until that clause existed, 7.3 named AISH, ODSP and PWD, and 7.2 released their
# budgets to the pool as protected recipients aged out - a phase-out of named
# disability programmes, published, while the argument page promised the model
# "does not draw on anyone's income assistance". The documents contradicted the
# mission in public for weeks and no check could see it. These can.
_bar=[
  # no founding document or live page may name a specific assistance programme
  (r'\bAISH\b|\bODSP\b|\bPWD\b',
   "names a specific disability programme - 7.1a puts the whole category out of reach, "
   "so no document should be naming one at all"),
  # the pre-7.1a wording of what 7.1 could reach
  (r'social-assistance or subsidy programme',
   "uses the pre-7.1a wording of Compact 7.1, which could reach social assistance"),
  # 10 Oct 2026, founder decision: 7.1a became a DEFAULT, not a permanent bar.
  # Members may bring an assistance programme into scope by ordinary proposal.
  # So no page may still promise the old permanence.
  (r'cannot be brought back into scope|does not expire, taper|may never reach|unreachable by it|'
   r'cannot be changed by an ordinary vote|may not amend 7\.1a|money is out of reach',
   "claims the assistance bar is permanent; since 10 Oct 2026 Members may lift it by ordinary proposal"),
  # NOT a phase-out regex. The first version here matched
  # "(phase|wind)[ -](out|down).{0,60}(assistance|benefit|...)" and immediately
  # failed on the-arithmetic.html's "a reason to wind down anyone's benefits" -
  # which is a DENIAL of exactly the thing being banned. A keyword guard cannot
  # read negation, and a guard that fails on correct text gets switched off.
  # The named-programme ban above and the structural checks on 7.1a below cover
  # the regression that actually matters.
]
_scope=sorted(glob.glob('docs/founding/*.md'))+sorted(glob.glob('site/*.html'))+['docs/Legal_Review_Brief.md','docs/Triarchal_Democracy.md','charts-src/build_diagrams.py']
for _f in _scope:
    if not os.path.exists(_f): continue
    _s=io.open(_f,encoding='utf-8').read()
    for _re,_why in _bar:
        if re.search(_re,_s): bad("%s: %s"%(_f,_why))
# and the default must be present, with the route to change it stated, and continuity applying
_cmp=io.open('docs/founding/Government_Adoption_Compact.md',encoding='utf-8').read()
for _need,_why in (
    ('subject to 7.1a',                     "Compact 7.1 no longer points at 7.1a"),
    ('**7.1a**',                            "Compact 7.1a is missing"),
    ('outside the scope of 7.1 unless the Members bring it in', "Compact 7.1a no longer makes assistance out of scope by default"),
    ('no deployment plans, models or projects a figure', "Compact 7.1a no longer forbids counting assistance in projections"),
    ('by ordinary proposal',                "Compact 7.1a no longer states the ordinary-proposal route"),
    ('applies in full to a programme brought into scope under 7.1a', "Compact 7.3 continuity no longer covers assistance brought into scope"),
    ('or afterwards for a programme brought into scope under 7.1a', "Compact 7.1 no longer lets a programme voted in after adoption be redirected"),
    ('is entrenched under Founding Charter 8.2', "Compact 7.3 no longer entrenches what existing recipients receive"),
):
    if _need not in _cmp: bad("Government_Adoption_Compact.md: %s"%_why)
print("   %d documents and pages scanned; 7.1a default intact, no permanence claimed"%len(_scope))

print("3g. generated pages must match their generators")
# Added 4 Oct 2026. the-proposition.html (then the-argument.html) is built from docs/Triarchal_Democracy.md by
# gen_argument.py, and about-the-triarc.html from docs/About_The_Triarc.md by
# gen_about.py. Editing either HTML file does nothing durable: the next generator
# run silently reverts it. On 4 Oct the entire Compact 7.1a paragraph was written
# into the-argument.html instead of its source. It survived a commit, a deploy and
# a verification pass, and vanished the moment the generator ran. This re-runs each
# generator into a temp copy and fails if the served page differs.
import subprocess, shutil, tempfile
for _gen,_page in (('site-src/gen_argument.py','site/the-proposition.html'),
                   ('site-src/gen_about.py','site/about-the-triarc.html')):
    _before=io.open(_page,encoding='utf-8').read()
    _bak=tempfile.mktemp(suffix='.html')
    shutil.copy2(_page,_bak)
    try:
        _r=subprocess.run(['python3',_gen],capture_output=True,text=True)
        if _r.returncode!=0:
            bad("%s failed to run: %s"%(_gen,(_r.stderr or '').strip().split(chr(10))[-1]))
        else:
            _after=io.open(_page,encoding='utf-8').read()
            if _after!=_before:
                bad("%s is out of sync with %s \u2014 someone edited the generated page "
                    "instead of its markdown source, and the edit is about to be lost"%(_page,_gen))
    finally:
        shutil.copy2(_bak,_page); os.remove(_bak)
print("   2 generated pages match their sources")

print("3h. the pages must not claim more than the documents allow")
# Every one of these was live on 4 Oct and contradicted a clause.
_claims=[
  # a dividend described as existing, when Treasury 5.1 gates both tiers
  (r'(?i)(a real and currently very small dividend|dividend today[^<]{0,40}(small|symbolic))',
   "describes a dividend as existing; Treasury Code 5.1 gates both tiers and nothing has been paid"),
  # the Foundation Dividend as a fixed floor, the design Treasury 5.4a rejects
  (r'(?i)(hard (per-Member )?(minimum|floor)|per-Member floor|a hard minimum)',
   "calls the Foundation Dividend a fixed floor; 5.4 makes it a share of the pool and 5.4a "
   "rejects a fixed amount in terms"),
  # cryptography claimed as present fact, when Charter 1.5/7.1 put the platform at Stage 1
  (r'(?i)anchored cryptographically by construction(?![^.]{0,80}stage)',
   "claims the record is cryptographically anchored today; Charter 7.1 Stage 1 is "
   "\"not yet by cryptography\""),
  # the model offered as the instrument for a need-based floor
  (r'(?i)this model can deliver the mechanism',
   "offers the model as the delivery mechanism for a need-based floor; Compact 1.1 bars it "
   "from administering or determining eligibility for one"),
  # the barred functions back inside the substitutable band
  (r'(?i)replace is a narrow band[^<]{0,80}eligibility determination',
   "puts eligibility determination back in the substitutable payroll band; Compact 1.1 and 7.3 "
   "bar the model from that work"),
]
_pages=sorted(glob.glob('site/*.html'))+['docs/Triarchal_Democracy.md','docs/About_The_Triarc.md']
for _f in _pages:
    _s=io.open(_f,encoding='utf-8').read()
    for _re,_why in _claims:
        if re.search(_re,_s): bad("%s: %s"%(_f,_why))
# and the same three claims must not be baked into a served chart
for _c in sorted(glob.glob('site/assets/charts/*.svg')):
    _s=io.open(_c,encoding='utf-8').read()
    for _re,_why in _claims[:2]:
        if re.search(_re,_s): bad("%s: %s"%(_c,_why))
print("   %d pages and %d charts scanned"%(len(_pages),len(glob.glob('site/assets/charts/*.svg'))))

print("6. every markdown block must reach the page, or be registered")
# Added 4 Oct 2026. sync_site.py manages CLAUSE PARAGRAPHS. It has never managed
# anything else, and on this date 76 of the 102 non-clause blocks inside the
# synced sections were unchecked copies of markdown text. Several had drifted:
# a Charter list said the platform had not "already" arrived where the source
# says "arrived"; a table cell said "Recognizing" for "Recognising"; the Compact
# said "grant program" and "trust is not labor"; five Phase II criteria carried
# labels the Charter did not contain; and Charter 3.1 promised "four public
# stages" while the page showed none of them. A block naming three disability
# programmes lived in the same unmanaged space for weeks.
#
# This closes the gap without forcing the pages into the markdown's shape. Every
# non-clause block whose anchor clause IS published must appear on that page, or
# be listed in site-src/unpublished.txt with a reason. Drift fails; a deliberate
# omission is a line someone wrote down.
from mdblocks import blocks as _mdblocks
def _n(t):
    t=t.lower().replace(u'\u2014',' ').replace(u'\u2019',"'")
    return re.sub(r'\s+',' ',re.sub(r'[^a-z0-9 ]',' ',t)).strip()
_reg=set()
for _L in io.open('site-src/unpublished.txt',encoding='utf-8'):
    if _L.startswith('#') or not _L.strip(): continue
    _parts=_L.rstrip('\n').split('\t')
    if len(_parts)<3: bad("unpublished.txt: malformed line %r"%_L[:60]); continue
    _reg.add((_parts[0],_parts[1].strip()))
_seen=set(); _ok=0; _un=0
for _page,_mp in (('site/charter.html',CHARTER),('site/documents.html',DOCS)):
    _s=io.open(_page,encoding='utf-8').read(); _pn=_n(txt(_s))
    for _sec in re.finditer(r'<section[^>]*id="([a-z0-9-]+)"[^>]*>(.*?)</section>',_s,re.S):
        _sid,_body=_sec.group(1),_sec.group(2)
        _src=_mp.get(_sid)
        if not _src: continue
        _present=set(re.findall(r'clause-num">([0-9]+\.[0-9]+[a-z]?|[IVXL]+)<',_body))
        for _k,_a,_p in _mdblocks('docs/founding/'+_src):
            if _a not in _present: continue
            _items=[_p] if _k in ('h3','p') else (_p if _k in ('ul','ol') else [c for r in _p for c in r])
            for _it in _items:
                _t=_n(txt(_it))
                if len(_t)<12: continue
                if _t in _pn: _ok+=1; continue
                # Match the registry by PREFIX, not by a fixed slice: a key
                # written by hand will not be exactly 42 characters, and an
                # off-by-two there fails the block and the registry line at once.
                _hit=next(((r0,r1) for r0,r1 in _reg if r0==_src and _t.startswith(r1)),None)
                if _hit: _un+=1; _seen.add(_hit); continue
                bad("%s: <%s> after %s is in the markdown but not on %s, and not registered "
                    "in site-src/unpublished.txt \u2014 %r"%(_src,_k,_a,_page,_t[:70]))
for _key in sorted(_reg-_seen):
    bad("unpublished.txt lists %s %r, but that block now reaches the page (or no longer "
        "exists) \u2014 remove the line"%_key)
print("   %d markdown blocks reach the page, %d registered as deliberately unpublished"%(_ok,_un))

print("3i. no stale material outside the archive, tracked or not")
# Added 4 Oct 2026. Sections 3 and 3b scan the founding documents, the live pages,
# the charts and app/src. For three weeks a git-ignored folder at the repo root,
# "Claude outputs/", held nine files carrying the Poverty-Line Supplement,
# redirected transfers and a fixed Foundation Dividend - and one of them shared a
# filename with docs/Triarchal_Democracy.md, the live source of the argument page.
# The 21 September audit saw the folder and left it, reasoning it was ignored by
# git. Git ignoring a file does not stop a person or an agent grepping it, and it
# does stop every check here from seeing it. So this walks the working tree.
#
# _archive/ is exempt by design: it is labelled history, its README says the file
# outside wins, and the agents are told to skip it. Nothing else is exempt.
_SKIP={'_archive','node_modules','.git','.wrangler','.vercel','__pycache__','held'}
_RETIRED=[(r'[Pp]overty-[Ll]ine [Ss]upplement', 'the retired Poverty-Line Supplement'),
          (r'10%\s*(accrual\s*)?cap|capped at 10%', 'the retired 10% accrual cap'),
          (r'live from day one|gate[- ]free|ungated', 'the retired ungated dividend')]
_scanned=0
for _root,_dirs,_files in os.walk('.'):
    _dirs[:]=[d for d in _dirs if d not in _SKIP and not d.startswith('.')]
    for _fn in _files:
        if not _fn.endswith(('.md','.html','.txt')): continue
        _p=os.path.join(_root,_fn)
        if 'CLAUDE.md' in _p or 'verify.py' in _p: continue
        try: _s=io.open(_p,encoding='utf-8',errors='replace').read()
        except Exception: continue
        _scanned+=1
        # Line-level, with the same `retired-rule-ok` exemption section 3b uses in
        # app/src: a file may name a retired mechanism in order to say it is gone.
        # The marker goes on the line or the one above it. docs/Legal_Review_Brief.md
        # needs it to tell counsel that the previous brief's mechanism was removed.
        _lines=_s.split('\n')
        for _i,_line in enumerate(_lines):
            if 'retired-rule-ok' in _line: continue
            if _i and 'retired-rule-ok' in _lines[_i-1]: continue
            for _re,_why in _RETIRED:
                if re.search(_re,_line):
                    bad("%s:%d: %s \u2014 if this is history, it belongs in _archive/ with a "
                        "README saying so, or carry a `retired-rule-ok` marker saying why this "
                        "file names it"%(_p,_i+1,_why))
print("   %d files walked outside the archive"%_scanned)

print("4. licence wiring")
if not os.path.exists('LICENSE'): bad("LICENSE file missing at repo root")
else:
    lic=io.open('LICENSE',encoding='utf-8',errors='replace').read()
    if 'GNU AFFERO GENERAL PUBLIC LICENSE' not in lic: bad("LICENSE is not the AGPL text")
    elif len(lic)<30000: bad("LICENSE looks truncated (%d bytes)"%len(lic))
if '"license": "AGPL-3.0-only"' not in io.open('app/package.json',encoding='utf-8').read():
    bad("app/package.json missing the license field")
for f in ('docs/founding/Federation_Compact.md','docs/About_The_Triarc.md'):
    if 'Affero' not in io.open(f,encoding='utf-8').read(): bad(f+": does not name the licence")

print("5. fonts")
for f in glob.glob('site/*.html'):
    if 'family=Lora' not in io.open(f,encoding='utf-8').read(): bad(f+": does not load Lora")

print("7. share cards and link previews")
# Added 18 Oct 2026. Every page carries a canonical link and Open Graph / Twitter tags built by
# site-src/seo.py from one table. The tags are generated, so the failure to catch is drift:
# a page edited or regenerated without them, a new page missing from the table, or a share
# image that is not the size the tags promise.
import seo as _seo
_names={os.path.basename(f) for f in glob.glob('site/*.html')}
for _n in sorted(_names-set(_seo.PAGES)): bad("site/%s has no entry in site-src/seo.py PAGES"%_n)
for _n in sorted(set(_seo.PAGES)-_names): bad("site-src/seo.py PAGES lists %s, which is not in site/"%_n)
_need=('og:title','og:description','og:type','og:url','og:image','og:site_name',
       'twitter:card','twitter:title','twitter:description','twitter:image')
for _n in sorted(_names&set(_seo.PAGES)):
    _s=io.open('site/'+_n,encoding='utf-8').read()
    if _seo.apply(_s,_n)!=_s:
        bad("site/%s: share tags or description differ from site-src/seo.py — run python3 site-src/seo.py"%_n)
    for _t in _need:
        if not re.search(r'<meta (?:property|name)="%s" content="[^"]+">'%re.escape(_t),_s): bad("site/%s: missing %s"%(_n,_t))
    if 'content="summary_large_image"' not in _s: bad("site/%s: twitter:card is not summary_large_image"%_n)
    _can=re.findall(r'<link rel="canonical" href="([^"]+)">',_s)
    _ogu=re.findall(r'<meta property="og:url" content="([^"]+)">',_s)
    if len(_can)!=1 or _can!=_ogu or not _can[0].startswith('https://triarchal-democracy.vercel.app'):
        bad("site/%s: canonical and og:url must be one identical absolute https://triarchal-democracy.vercel.app URL"%_n)
    if len(re.findall(r'og:image"',_s))!=1 or 'https://triarchal-democracy.vercel.app/assets/share-card.png' not in _s:
        bad("site/%s: og:image must be the absolute share-card URL"%_n)
_img='site/assets/share-card.png'
if not os.path.exists(_img): bad(_img+" is missing")
else:
    _b=open(_img,'rb').read(32)
    import struct as _st
    if _b[:8]!=b'\x89PNG\r\n\x1a\n' or _st.unpack('>II',_b[16:24])!=(1200,630):
        bad(_img+" must be a 1200x630 PNG")
print("   %d pages carry canonical, Open Graph and Twitter tags; share image checked"%len(_names))

print("8. the launch pages: linked, truthful, modest")
# Added 18 Oct 2026. start-here, faq, known-limits, run-your-own-group and press are hand-written
# and state facts about the documents and the app, which is exactly the shape of prose that rots
# (see 3d and 3e). This does five things: they are reachable from every page; every internal link
# and anchor resolves; they carry no personal contact or identity; they keep the voice rules (no
# income promise, no urgency, Rules of Procedure 4.3); and the figures they quote still match the
# documents they quote, so that moving a default in a document fails here until the page is read.
# 19 Oct 2026: work-with-us joined the list (the Ideas page and its two essays were removed on 20 Oct 2026). Beyond the
# above, 8b ties the steps work-with-us tells a stranger to take to the routes and labels in app/src,
# because a how-to-reach-us page that names a button that was renamed is worse than none.
_LAUNCH=['joining-the-triarc.html','faq.html','known-limits.html','run-your-own-group.html','press.html',
        'work-with-us.html']
for _l in _LAUNCH:
    if not os.path.exists('site/'+_l): bad("site/%s is missing"%_l)
for _f in sorted(glob.glob('site/*.html')):
    _s=io.open(_f,encoding='utf-8').read()
    _nav=re.search(r'<nav>.*?</nav>',_s,re.S); _foot=re.search(r'<footer>.*?</footer>',_s,re.S)
    if not _nav or 'faq.html' not in _nav.group(0):
        bad("%s: nav does not link Hard questions"%_f)
    # 19 Oct 2026: the founder wants the landing page and the proposition forward. Joining the Triarc
    # (formerly Start here) is about the Triarc, so it lives under About: never in the main nav.
    if _nav and 'joining-the-triarc.html' in _nav.group(0):
        bad("%s: the main nav links Joining the Triarc; it belongs under About, not in the nav"%_f)
    if not _nav or 'work-with-us.html' not in _nav.group(0):
        bad("%s: nav does not link Work with us"%_f)
    if _nav and 'ideas.html' in _nav.group(0):
        bad("%s: nav links the removed Ideas page"%_f)
    for _l in [x for x in _LAUNCH if not x.startswith('idea-') and x!='joining-the-triarc.html']:
        if not _foot or _l not in _foot.group(0): bad("%s: footer does not link %s"%(_f,_l))
if 'joining-the-triarc.html' not in io.open('site/about-the-triarc.html',encoding='utf-8').read():
    bad("site/about-the-triarc.html does not link Joining the Triarc")
# links
_ids={}
for _f in glob.glob('site/*.html'):
    _ids[os.path.basename(_f)]=set(re.findall(r'\bid="([^"]+)"',io.open(_f,encoding='utf-8').read()))
_nlinks=0
for _f in sorted(glob.glob('site/*.html')):
    _s=io.open(_f,encoding='utf-8').read()
    for _h in re.findall(r'href="([^"]+)"',_s):
        if re.match(r'(https?:|mailto:|#|assets/)',_h) and not _h.startswith('#'): continue
        _pg,_,_fr=_h.partition('#'); _pg=_pg or os.path.basename(_f); _nlinks+=1
        if _pg not in _ids: bad("%s: link to %s, which is not a page in site/"%(_f,_h)); continue
        if _fr and _fr not in _ids[_pg]: bad("%s: link to %s, but %s has no id %s"%(_f,_h,_pg,_fr))
    for _a in re.findall(r'href="(assets/[^"#]+)"',_s):
        if not os.path.exists('site/'+_a): bad("%s: link to missing file %s"%(_f,_a))
# identity and contact
_OKURL=('https://triarchalframework.triarchal-democracy.workers.dev','triarchalframework.triarchal-democracy.workers.dev')
for _l in _LAUNCH:
    if not os.path.exists('site/'+_l): continue
    _s=io.open('site/'+_l,encoding='utf-8').read()
    _t=_s
    for _u in _OKURL: _t=_t.replace(_u,'')
    if re.search(r'mailto:|[A-Za-z0-9._-]+@[A-Za-z0-9-]+\.[a-z]{2,}',_t): bad("site/%s: carries an email address; contact details are not set up yet"%_l)
    if re.search(r'(?!x)x',_t,re.I): bad("site/%s: carries the founder's handle or account name outside the app URL"%_l)
    # voice: no income promise, no manufactured urgency
    for _rx,_why in ((r"(?i)\bget paid\b|\bearn (?:money|an income|\$)|passive income|\bguarantee[sd]? (?:you |an? |your |every |a )?(?:income|payment|dividend|pay\b|return)|\byou will (?:earn|receive|be paid)\b",
                      "promises or implies income"),
                     (r"(?i)countdown|limited[- ]time|act now|hurry|don't miss|do not miss|spots (?:are )?(?:limited|left)|before it's too late|last chance|\bonly \d+ (?:left|spots|places)\b",
                      "uses urgency or scarcity (Rules of Procedure 4.3)"),
                     (r"(?i)\bunder revision\b|\bwas amended\b|\bpreviously (?:said|read|stated)\b|\bused to say\b",
                      "narrates a revision of a founding document; they are first drafts")):
        if re.search(_rx,_s): bad("site/%s: %s"%(_l,_why))
# the three honesty anchors
def _pt(_n): return txt(io.open('site/'+_n,encoding='utf-8').read())
for _n,_ph in (('joining-the-triarc.html','https://triarchalframework.triarchal-democracy.workers.dev/register'),
               ('joining-the-triarc.html','https://triarchalframework.triarchal-democracy.workers.dev/tour')):
    if _ph not in io.open('site/'+_n,encoding='utf-8').read(): bad("site/%s: missing link %s"%(_n,_ph))
for _n,_ph in (('faq.html','nobody is being paid'),('faq.html','never fixed or promised in advance'),
               ('faq.html','the honest limit'),('known-limits.html','written 18 october 2026'),
               ('press.html','press contact details are being set up'),
               ('run-your-own-group.html','federation is a plan, not a feature'),
               ('joining-the-triarc.html','nothing has been paid to anyone'),
               ('work-with-us.html','no payment, salary, equity or income is offered or promised'),
               ('work-with-us.html','there is no email address, no contact form and no private messaging'),
               ('work-with-us.html','voting is not open yet'),
               ('work-with-us.html','notification email is not built'),
               ('work-with-us.html','written 19 october 2026'),
               ('work-with-us.html','nothing has been paid to anyone'),
               ('work-with-us.html','github.com/triarchal-democracy/triarchal-democracy'),
               ):
    if _ph not in _pt(_n).lower(): bad("site/%s: no longer says %r"%(_n,_ph))
# figures still match their documents
def _nz(t): return re.sub(r'\s+',' ',t.replace('*','').replace('’',"'").lower())
_src={}
def _doc(f):
    if f not in _src:
        _src[f]=_nz(io.open('docs/'+f,encoding='utf-8').read()) if os.path.exists('docs/'+f) else ''
    return _src[f]
CH,TR,RP,CC,DP,FC,MC,BR,AB='founding/Founding_Charter.md','founding/Treasury_Code.md','founding/Rules_of_Procedure.md','founding/Code_of_Conduct.md','founding/Dispute_Procedure_Code.md','founding/Federation_Compact.md','founding/Triarc_Membership_Code.md','founding/Member_Bill_of_Rights.md','About_The_Triarc.md'
TD,CO,OC='Triarchal_Democracy.md','founding/Contribution_Code.md','founding/Triarc_Operations_Code.md'
_GUARD=[
 ('joining-the-triarc.html','at least ten members, or 10% of members',CH,'the greater of 10% of members and ten members'),
 ('joining-the-triarc.html','(90 days for the biggest decisions)',CH,'critical decisions, classified under the rules of procedure, carry a shorter renewal requirement (default: 90 days)'),
 ('joining-the-triarc.html','resubmitted once after 14 days',RP,'may be resubmitted once after 14 days'),
 ('joining-the-triarc.html','a short list of core protections, one member one vote among them, needs three quarters and 40%',CH,'amendable only by three-quarters majority with minimum participation of 40%'),
 ('joining-the-triarc.html','30 verified members and every delegate position it has defined is filled',TR,'at least 30 verified members, and every delegate position it has defined'),
 ('joining-the-triarc.html','at least 18',CH,'aged eighteen or older'),
 ('joining-the-triarc.html','votes are public; there are no secret ballots',RP,'votes are public and permanent'),
 ('faq.html','a three-quarters majority with at least 40% of members',CH,'three-quarters majority with minimum participation of 40%'),
 ('faq.html','delays a measure by at most 30 days',CH,'delays the measure for at most 30 days'),
 ('faq.html','end founding authority by a two-thirds vote',CH,'terminate founding authority'),
 ('faq.html','at least ten supporters in a sector and a tenth or more of that sector',CH,'holds at least ten supporters in a sector, and 10% or more of that sector'),
 ('faq.html','at a fifth or more, a confirmation vote opens automatically',CH,'a concentrated holder at 20% or more'),
 ('faq.html','barred for 90 days',CH,'bars any new delegation to them for 90 days'),
 ('faq.html','no phone number can be attached to more than one account',MC,'no phone number may be attached to more than one'),
 ('faq.html','up to 72 hours',CC,'72 hours'),
 ('faq.html','at least 30 verified members',TR,'at least 30 verified members'),
 ('faq.html','by default 40% of net inflows go to the dividend pool',TR,'| dividend pool | 40% |'),
 ('faq.html','five times an equal share',CH,'five times an equal share'),
 ('faq.html','never fixed or promised in advance',TR,'never fixed or promised in advance'),
 ('faq.html','the minimum age to join is eighteen',CH,'aged eighteen or older'),
 ('faq.html','nothing already distributed is taken back',BR,'without forfeiting anything already distributed'),
 ('faq.html','eleven members drawn at random',CH,'eleven members drawn at random'),
 ('faq.html','7 days to respond',DP,'7 days to respond'),
 ('faq.html','within 14 days',DP,'within 14 days of seating'),
 ('faq.html','held for 14 days',DP,'does not take effect for 14 days'),
 ('faq.html','at least 30 volunteers',DP,'at least 30 members before any panel is drawn'),
 ('faq.html','48 hours to decline',DP,'decline within 48 hours'),
 ('faq.html','no taxing power at any stage',FC.replace('Federation_Compact','Government_Adoption_Compact'),'the triarc has no taxing power, at any stage'),
 ('faq.html','three named directors at filing',AB,'three named directors at filing'),
 ('known-limits.html','at least 30 verified members',TR,'at least 30 verified members'),
 ('known-limits.html','at least 30 volunteers',DP,'at least 30 members before any panel is drawn'),
 ('known-limits.html','48 hours to decline',DP,'decline within 48 hours'),
 ('known-limits.html','a three-quarters majority and 40% participation',CH,'three-quarters majority with minimum participation of 40%'),
 ('known-limits.html','at least ten supporters',CH,'holds at least ten supporters'),
 ('run-your-own-group.html','five classes of proposal',RP,'| entrenched amendment |'),
 ('run-your-own-group.html','panel of eleven drawn from parties not involved',FC,'eleven members drawn by verifiable public randomness'),
 ('run-your-own-group.html','while fewer than eleven uninvolved parties exist',FC,'while fewer than eleven uninvolved parties exist'),
 ('run-your-own-group.html','once the activation gate has opened it never closes',TR,'never re-gated'),
 ('press.html','at least 40% of members taking part',CH,'minimum participation of 40%'),
 ('press.html','30 verified members and every delegate position it has defined is filled',TR,'at least 30 verified members, and every delegate position it has defined'),
 ('press.html','uses no tokens, smart contracts or on-chain voting',AB,'no tokens, no smart contracts, no on-chain voting'),
 # work-with-us (19 Oct 2026)
 ('work-with-us.html','at least two active members who did not collaborate on it',CO,'attested by at least two active members who did not collaborate on it'),
 ('work-with-us.html','you then have 60 days to claim it',CO,'a member has 60 days from verification to claim'),
 ('work-with-us.html','a public, permanent, append-only ledger',CH,'a public, permanent, append-only ledger'),
 ('work-with-us.html','at least 30 volunteers',DP,'at least 30 members before any panel is drawn'),
 ('work-with-us.html','48 hours to decline',DP,'decline within 48 hours'),
 ('work-with-us.html','30 verified members and every delegate position it has defined is filled',TR,'at least 30 verified members, and every delegate position it has defined'),
 ('work-with-us.html','never fixed or promised in advance',TR,'never fixed or promised in advance'),
 ('work-with-us.html','at least 18',CH,'aged eighteen or older'),
 ('work-with-us.html','nothing that binds the community may happen off the record',CH,'nothing that binds the community on the record may happen off it'),
 ('work-with-us.html','under a lower-visibility identity',RP,'post under a lower-visibility identity'),
 ('work-with-us.html','data collection & research',OC,'data collection & research'),
 ('work-with-us.html','nonprofit operations',OC,'nonprofit operations'),
 ('work-with-us.html','software stewardship',OC,'software stewardship'),
 ('work-with-us.html','one member in nine',CH,'at the default half, one in nine'),
 ('work-with-us.html','ten supporters and 10% of a sector',CH,'holds at least ten supporters in a sector, and 10% or more of that sector'),
 ('work-with-us.html','the most consequential chosen number',CH,'the most consequential chosen number'),
 ('work-with-us.html','inexpensive phone over a slow connection',TD,'inexpensive phone over a slow connection'),
]
# the proposal-class table is the authority for the windows the Start page quotes
_W8={5:'five',7:'seven',30:'30'}
_rows={m.group(1):m.groups() for m in re.finditer(r'^\|\s*(Ordinary|Charter amendment)\s*\|\s*(\d+) days\s*\|\s*(\d+) days\s*\|\s*([^|]+?)\s*\|\s*(\d+)%\s*\|',
        io.open('docs/founding/Rules_of_Procedure.md',encoding='utf-8').read(),re.M)}
if set(_rows)!={'Ordinary','Charter amendment'}: bad("Rules of Procedure 1.3: could not read the Ordinary and Charter amendment rows")
else:
    _o,_c=_rows['Ordinary'],_rows['Charter amendment']
    _sp=_pt('joining-the-triarc.html').lower()
    for _need in ("%s days for an ordinary proposal"%_o[1], "%s days for an ordinary proposal"%_W8.get(int(_o[2]),_o[2]),
                  "amending the charter takes %s days of deliberation, a two-thirds majority and at least %s%% of members"%(_c[1],_c[4])):
        if _need not in _sp: bad("joining-the-triarc.html: Rules of Procedure 1.3 gives Ordinary %s/%s days and Charter amendment %s days, %s%%; the page no longer says %r"%(_o[1],_o[2],_c[1],_c[4],_need))
    if 'two-thirds' not in _c[3].lower(): bad("Rules of Procedure 1.3: Charter amendment threshold is no longer two-thirds; joining-the-triarc.html says it is")
_g=0
for _pg,_pp,_df,_dp in _GUARD:
    if _nz(_pp) not in _nz(txt(io.open('site/'+_pg,encoding='utf-8').read())):
        bad("site/%s: no longer says %r"%(_pg,_pp)); continue
    if _nz(_dp) not in _doc(_df): bad("site/%s quotes %r, but %s no longer says %r"%(_pg,_pp,_df,_dp)); continue
    _g+=1
# The work page carries rules of its own (19 Oct 2026, founder's brief).
for _n in ('work-with-us.html',):
    _raw=io.open('site/'+_n,encoding='utf-8').read()
    if re.search(r'github\.com|git@|\bgit clone\b',_raw.replace('https://github.com/triarchal-democracy/triarchal-democracy','').replace('github.com/triarchal-democracy/triarchal-democracy',''),re.I):
        bad("site/%s: names a source repository other than the project's own public one"%_n)
for _gone in ('ideas.html','idea-return.html','idea-delegation.html'):
    if os.path.exists('site/'+_gone): bad("site/%s exists; the Ideas page and its essays were removed on purpose (20 Oct 2026)"%_gone)

print("8b. work-with-us: the steps it tells a stranger to take exist in the app")
# Added 19 Oct 2026. The page says: register (18+, phone optional) -> follow a sector -> start a discussion
# in that sector, and/or post an opportunity -> or comment on a proposal as a visitor. It also says that
# nothing is pushed. Each of those is a claim about app/src, so each is pinned to the code here.
def _src(f): return io.open('app/src/'+f,encoding='utf-8').read()
_ix=_src('index.tsx')
for _need,_why in (
    ('method === "POST" && /^\\/proposals\\/\\d+\\/comments$/.test(path)) return true;', "guest comments on proposals are no longer public (isPublicRequest)"),
    ('method === "GET" && path === "/proposals") return true;',     "the Proposals list is no longer public"),
    ('method === "GET" && path === "/status") return true;',        "the status page is no longer public"),
    ('app.post("/sectors/:id/posts"',                              "no route starts a sector discussion"),
    ('app.post("/opportunities"',                                  "no route posts an opportunity"),
    ('app.get("/onboarding/sectors"',                              "registration no longer leads to following sectors"),
    ('"opportunity_matching_your_sectors"',                        "posting an opportunity no longer alerts sector followers"),
):
    if _need not in _ix: bad("work-with-us.html relies on app/src/index.tsx; %s (%s)"%(_why,_need))
# none of the three posting routes may ask for a verified phone: the page says only voting and delegating wait for it
for _route in ('app.post("/sectors/:id/posts"','app.post("/opportunities"','app.post("/proposals/:id/comments"','app.post("/register"'):
    _i=_ix.find(_route)
    if _i<0: continue
    _m=re.search(r'\napp\.(?:get|post|use)\(',_ix[_i+10:])
    _body=_ix[_i:_i+10+(_m.start() if _m else len(_ix))]
    if 'isPhoneVerified' in _body or 'phoneVerificationBlocked' in _body:
        bad("work-with-us.html says only voting and delegating need a verified phone, but %s checks one"%_route)
for _f,_need,_why in (
    ('views/sectorHub.tsx','Start a discussion',                     "the sector page has no 'Start a discussion' box"),
    ('views/auth.tsx','name="minimumAge"',                            "the registration form has no 18+ tick-box"),
    ('views/auth.tsx','Phone number (optional)',                      "the registration phone field is no longer optional"),
    ('views/proposalDetail.tsx','Post as a visitor',                  "a visitor can no longer comment on a proposal"),
    ('views/notifications.tsx','Email delivery is not built yet',     "the app no longer says email delivery is not built; update the notification lines on work-with-us"),
):
    if _need not in _src(_f): bad("work-with-us.html relies on app/src/%s; %s"%(_f,_why))
_ek=re.search(r'EVENT_KINDS = \[(.*?)\] as const',_src('views/notifications.tsx'),re.S)
_kinds=sorted(re.findall(r'"([a-z_]+)"',_ek.group(1))) if _ek else []
if _kinds!=sorted(['followed_sector_vote_closing_soon','opportunity_matching_your_sectors','sector_discussion_activity','nomination_challenge_filed','delegation_expiring_soon']):
    bad("work-with-us.html describes the alerts a stranger gets (opportunity, and sector discussion if they follow it); the notification event kinds are now %s"%_kinds)
_ts=re.search(r'TRIARC_SECTORS = \[(.*?)\] as const',_src('lib/params.ts'),re.S)
_sec=re.findall(r'"([^"]+)"',_ts.group(1)) if _ts else []
if _sec!=['Data Collection & Research','Nonprofit Operations','Software Stewardship']:
    bad("work-with-us.html names the Triarc's three sectors; app/src/lib/params.ts now has %s"%_sec)
print("   intake steps pinned to the app's routes, labels, sector names and notification kinds")

print("   %d launch pages linked from every page; %d internal links resolve; %d figures tie to their documents"%(len(_LAUNCH),_nlinks,_g))

print()
print("ALL CHECKS PASSED" if not fail else "%d PROBLEM(S)"%fail)
sys.exit(1 if fail else 0)
