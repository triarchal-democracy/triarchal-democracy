# -*- coding: utf-8 -*-
"""Share-card and link-preview tags for every page in site/. One place, so they cannot drift.

Every site/*.html carries, between `<!-- share:begin -->` and `<!-- share:end -->`, a canonical
link, Open Graph tags and Twitter-card tags built from the PAGES table below. The same table
sets each page's <meta name="description">, so the description a search engine shows and the
one a link preview shows are one string.

Who calls this
  * gen_argument.py and gen_about.py call apply() on the page they build, so a regenerated page
    keeps correct tags (gen_argument builds from the About page's markup, and would otherwise
    inherit the About page's tags).
  * sync_site.py calls stamp_all() after it rewrites charter.html and documents.html.
  * run directly, `python3 site-src/seo.py` stamps every page; `--check` only reports.
  * verify.py section 7 fails if any page's tags differ from what apply() would produce, if a
    page is missing from PAGES, or if the share image is not a 1200x630 PNG.

A new page in site/ must be added to PAGES. Absolute URLs use the Vercel clean-URL form
(site/vercel.json sets cleanUrls), so joining-the-triarc.html is https://.../joining-the-triarc.

Wording rule for descriptions: modest, accurate, consistent with the founding documents. No
claim about income or outcomes, no urgency.
"""
import glob, html, io, os, re, sys

BASE = 'https://triarchal-democracy.vercel.app'
IMAGE_PATH = 'assets/share-card.png'
IMAGE_URL = BASE + '/' + IMAGE_PATH
IMAGE_ALT = 'Triarchal Democracy: one member, one vote, and a public record of every decision.'
SITE_NAME = 'Triarchal Democracy'

# file -> (short title for previews, description)
PAGES = {
    'index.html': ('Triarchal Democracy',
        'A proposed way for a community to decide things together: one Member, one vote, optional '
        'delegation and a public record. Under development and open for challenge.'),
    'joining-the-triarc.html': ('Joining the Triarc',
        'For people thinking of joining the Triarc: how a decision gets made, what you can do on '
        'day one, and what is and is not live yet.'),
    'faq.html': ('Hard questions',
        'Plain answers to the sceptical questions: takeover, fake accounts, the dividend, '
        'the age rule, leaving, money and accountability, with the limits stated.'),
    'known-limits.html': ('Known limits',
        'A dated, candid list of what does not work or is not built yet, why it matters and what '
        'is planned.'),
    'run-your-own-group.html': ('Run your own group on this',
        'A one-page guide for a club, co-op, union local, association or nonprofit that might '
        'adopt the Charter and Codes, with the limits stated.'),
    'press.html': ('For press',
        'A factual description of Triarchal Democracy and the Triarc, key facts that can be '
        'checked against the published documents and software, and links to the public record.'),
    'work-with-us.html': ('Work with us',
        'An early, unfinished proposal that needs people who can find what is wrong with it and '
        'build what is missing: software, legal and policy, research, design, writing and organising.'),
    'the-proposition.html': ('The proposition',
        'Governance, contribution and civic return are built as three separate systems. The case '
        'for building them as one, and where it could fail.'),
    'the-arithmetic.html': ('The arithmetic',
        'A costing model built from published budgets, with every calculation shown. A model, not '
        'a forecast.'),
    'charter.html': ('The Founding Charter',
        'A draft constitution for the Triarc, offered as a starting position and built to be '
        'amended by the people it governs.'),
    'documents.html': ('The founding documents',
        'Ten codes and compacts, offered as proposals and not as law, that implement the Founding '
        'Charter.'),
    'about-the-triarc.html': ('About The Triarc',
        'The Triarc is a governance research organisation, not yet incorporated, that tests '
        'Triarchal Democracy by running its own governance on it.'),
}

BEGIN, END = '<!-- share:begin (built by site-src/seo.py; do not edit by hand) -->', '<!-- share:end -->'

def page_url(name):
    return BASE + '/' if name == 'index.html' else BASE + '/' + name[:-len('.html')]

def full_title(name):
    short = PAGES[name][0]
    return short if name == 'index.html' else short + ' — ' + SITE_NAME

def _e(t):
    return html.escape(t, quote=True)

def description_tag(name):
    return '<meta name="description" content="%s">' % _e(PAGES[name][1])

def block(name):
    t, d, u = full_title(name), PAGES[name][1], page_url(name)
    lines = [
        BEGIN,
        '<link rel="canonical" href="%s">' % _e(u),
        '<meta property="og:site_name" content="%s">' % _e(SITE_NAME),
        '<meta property="og:type" content="website">',
        '<meta property="og:url" content="%s">' % _e(u),
        '<meta property="og:title" content="%s">' % _e(t),
        '<meta property="og:description" content="%s">' % _e(d),
        '<meta property="og:image" content="%s">' % _e(IMAGE_URL),
        '<meta property="og:image:type" content="image/png">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        '<meta property="og:image:alt" content="%s">' % _e(IMAGE_ALT),
        '<meta property="og:locale" content="en_CA">',
        '<meta name="twitter:card" content="summary_large_image">',
        '<meta name="twitter:title" content="%s">' % _e(t),
        '<meta name="twitter:description" content="%s">' % _e(d),
        '<meta name="twitter:image" content="%s">' % _e(IMAGE_URL),
        '<meta name="twitter:image:alt" content="%s">' % _e(IMAGE_ALT),
        END,
    ]
    return '\n'.join(lines)

def apply(s, name):
    """Return page source `s` for site/<name> with its description and share tags rebuilt."""
    if name not in PAGES:
        raise KeyError('%s is not in site-src/seo.py PAGES; add it with a title and description' % name)
    s = re.sub(r'<!-- share:begin.*?<!-- share:end -->\n?', '', s, flags=re.S)
    # tags that existed before this helper (index.html carried a partial set)
    s = re.sub(r'<meta property="og:[^>]*>\n?', '', s)
    s = re.sub(r'<meta name="twitter:[^>]*>\n?', '', s)
    s = re.sub(r'<link rel="canonical"[^>]*>\n?', '', s)
    dtag = description_tag(name)
    s, n = re.subn(r'<meta name="description" content="[^"]*">', lambda m: dtag, s, count=1)
    if n != 1:
        raise ValueError('%s has no <meta name="description"> to anchor the share tags' % name)
    return s.replace(dtag, dtag + '\n' + block(name), 1)

def stamp_all(check_only=False, root='site'):
    changed = []
    files = sorted(glob.glob(os.path.join(root, '*.html')))
    for f in files:
        name = os.path.basename(f)
        before = io.open(f, encoding='utf-8').read()
        after = apply(before, name)
        if after != before:
            changed.append(name)
            if not check_only:
                io.open(f, 'w', encoding='utf-8', newline='').write(after)
    return changed

if __name__ == '__main__':
    chk = '--check' in sys.argv
    ch = stamp_all(check_only=chk)
    print(('would change: ' if chk else 'stamped: ') + (', '.join(ch) if ch else 'nothing (already in sync)'))
    sys.exit(1 if (chk and ch) else 0)
