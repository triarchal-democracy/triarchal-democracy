# -*- coding: utf-8 -*-
"""Parse a founding-document markdown file into an ordered list of typed blocks.

Why this exists
---------------
sync_site.py patched CLAUSE PARAGRAPHS in place and left every other element on
the page alone. That was most of the page: on 4 Oct 2026, 76 of the 102
non-clause blocks inside the synced sections of charter.html and documents.html
were copies of markdown text that nothing compared to anything. Several had
already drifted - two Charter criteria had acquired glosses the Charter does not
contain, a table cell said "Recognizing" where the source says "Recognising",
and a list intro said the platform had not "already arrived" where the source
says "arrived". A block naming three disability benefit programmes lived there
for weeks, outliving every rewrite of the clauses printed directly above it.

So: every block that HAS a markdown counterpart is now generated from it, marked
with data-md, and re-emitted on each run. Anything without that marker is
editorial, has no source, and is left untouched. A block can no longer be a
silent third copy of something.

Each block is anchored to the clause that precedes it in the markdown, which is
how `> **Why**` notes were already placed. Anchoring on the preceding clause
also scopes a block to the right section when one markdown file splits across
several sections, as Founding_Charter.md does across nine.
"""
import io,re
from sync_site import inline, CLAUSE, CLAUSE_T, RIGHT, _STOP, _continuation

H2   = re.compile(r'^##\s+(.+?)\s*$')
BULL = re.compile(r'^[-*]\s+(.+?)\s*$')
NUM  = re.compile(r'^\d+\.\s+(.+?)\s*$')
ROW  = re.compile(r'^\|(.+)\|\s*$')
RULE = re.compile(r'^\|[\s:|-]+\|\s*$')

def blocks(path):
    """-> [(kind, anchor_clause_or_None, payload)] in document order."""
    lines = io.open(path, encoding='utf-8').read().split('\n')
    out = []; i = 0; last = None
    while i < len(lines):
        L = lines[i].rstrip()
        if not L.strip(): i += 1; continue

        m, mt, mr = CLAUSE.match(L), CLAUSE_T.match(L), RIGHT.match(L)
        if m or mt or mr:                      # a clause: moves the anchor
            last = (m or mt or mr).group(1)
            _, i = _continuation(lines, i + 1)
            continue

        h = H2.match(L)
        if h:
            out.append(('h3', last, inline(h.group(1)))); i += 1; continue

        if L.startswith('#'):                  # the document title; page furniture
            i += 1; continue

        if L.startswith('>'):                  # handled by sync_site's note pass
            while i < len(lines) and lines[i].startswith('>'): i += 1
            continue

        if BULL.match(L):
            items = []
            while i < len(lines) and BULL.match(lines[i].rstrip()):
                items.append(inline(BULL.match(lines[i].rstrip()).group(1))); i += 1
            out.append(('ul', last, items)); continue

        if NUM.match(L):
            items = []
            while i < len(lines) and NUM.match(lines[i].rstrip()):
                items.append(inline(NUM.match(lines[i].rstrip()).group(1))); i += 1
            out.append(('ol', last, items)); continue

        if ROW.match(L):
            rows = []
            while i < len(lines) and ROW.match(lines[i].rstrip()):
                raw = lines[i].rstrip()
                if not RULE.match(raw):
                    rows.append([inline(c.strip()) for c in ROW.match(raw).group(1).split('|')])
                i += 1
            if rows: out.append(('table', last, rows))
            continue

        if L.startswith('*') and L.endswith('*') and not L.startswith('**'):
            i += 1; continue                   # the italic doc intro is page furniture

        if set(L.strip()) <= set('-'):
            i += 1; continue                   # horizontal rule

        # "**Where does it fail?**" closes most documents. It is the project's own
        # standing invitation, not document text, and no page renders it. Skipping
        # it here keeps it out of the generated body rather than introducing it as
        # a new paragraph on eleven pages.
        if L.startswith('**') and L.endswith('**') and '\n' not in L and len(L) < 90:
            i += 1; continue

        body = [L.strip()]                     # plain prose, possibly wrapped
        i += 1
        while i < len(lines):
            n = lines[i].rstrip()
            if not n.strip() or n.lstrip().startswith(_STOP): break
            body.append(n.strip()); i += 1
        out.append(('p', last, inline(' '.join(body))))
    return out

def render(kind, payload, ul_class):
    if kind == 'h3':
        return '\n  <h3 data-md>%s</h3>' % payload
    if kind == 'p':
        return '\n  <p data-md>%s</p>' % payload
    if kind == 'ol':
        return ('\n  <ol data-md class="%s">\n' % ul_class
                + '\n'.join('    <li>%s</li>' % x for x in payload) + '\n  </ol>')
    if kind == 'ul':
        return ('\n  <ul data-md class="%s">\n' % ul_class
                + '\n'.join('    <li>%s</li>' % x for x in payload) + '\n  </ul>')
    if kind == 'table':
        head, rest = payload[0], payload[1:]
        r = ['\n  <table data-md>', '    <tr>' + ''.join('<th>%s</th>' % c for c in head) + '</tr>']
        for row in rest:
            r.append('    <tr>' + ''.join('<td>%s</td>' % c for c in row) + '</tr>')
        r.append('  </table>')
        return '\n'.join(r)
    raise ValueError(kind)
