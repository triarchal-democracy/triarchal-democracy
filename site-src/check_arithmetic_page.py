# -*- coding: utf-8 -*-
"""Check the figures printed on the-arithmetic.html against their own derivation.

Rewritten 3 October 2026, when the founder removed redirected government transfers
from the financial plan entirely. The page no longer counts pensions, children's
benefits or income assistance, and no longer counts the administrative saving that
would only exist if a deployment took over eligibility determination. The reasoning
is on the page under "What this model does not count": whether to consolidate social
spending belongs to the people who would live with it, not to a costing model.

What is left is money a government has delegated AUTHORITY over — a municipal
discretionary budget and federal payroll released by ordinary attrition. That is
91% smaller and it is the whole model, so this script derives it from its two
components and fails if a third ever reappears.

History: this file replaced check_taper_page.py (the Part Two floor top-up, removed
21 September). On 28 September it was rewritten to derive the pool rather than
compare the page to a constant, which caught a double count the constant had hidden.
"""
import io, re, sys

H = io.open('site/the-arithmetic.html', encoding='utf-8').read()
fails = []


def want(cond, msg):
    if not cond:
        fails.append(msg)


POP_CA = 41.6e6
POP_KEL = 150000


def per_month(annual_dollars, population):
    return annual_dollars / population / 12.0


# --- the two components ------------------------------------------------------
# Municipal: Kelowna's modelled redirectable discretionary ceiling, available in
# full once a delegation is in place.
MUNICIPAL = per_month(15.0e6, POP_KEL)                       # 8.33

# Federal: payroll only, and only the substitutable band, and only as ordinary
# attrition empties posts (Government Adoption Compact 7.5 — vacant roles only).
# The substitutable-payroll band is the page's single largest assumption and it
# now has two ends, because on 4 Oct a critique pass found the anchor had been
# stated against the wrong denominator. The EC occupational group (26,649 at
# 31 Mar 2025) is 9.98% of core public administration but only 5.95% of the
# 448,000 FTE the PBO's $76.3B actually covers - and it is the 448,000 the band
# is applied to. So 10% sits ABOVE its own anchor. The page publishes a range:
# the anchor at the bottom, the 10% assumption as an upper bound.
SUBSTITUTABLE = 0.10                                          # upper bound
SUBSTITUTABLE_ANCHOR = 26649.0 / 448000.0                     # 0.0595, EC like-for-like
PAYROLL_FULL = per_month(76.3e9 * SUBSTITUTABLE, POP_CA)     # 15.28
PAYROLL_ANCHOR = per_month(76.3e9 * SUBSTITUTABLE_ANCHOR, POP_CA)   # 9.17
want(round(SUBSTITUTABLE_ANCHOR, 4) == 0.0595,
     "the EC anchor is %.4f, page says 5.95%%" % SUBSTITUTABLE_ANCHOR)
want(round(PAYROLL_ANCHOR, 2) == 9.09,
     "payroll at the anchor is $%.2f, page says $9.09" % PAYROLL_ANCHOR)
want(SUBSTITUTABLE > SUBSTITUTABLE_ANCHOR,
     "the band no longer exceeds its anchor; the page's 'upper bound' framing must change")

want(round(MUNICIPAL, 2) == 8.33, "municipal is $%.2f, page says $8.33" % MUNICIPAL)
want(round(PAYROLL_FULL, 2) == 15.28, "payroll at full attrition is $%.2f, page says $15.28" % PAYROLL_FULL)

# The page prints components to the cent, so the total it prints must be the sum
# of what it printed — not the sum of the unrounded values, which differs by a cent.
POOL_MONTH = round(MUNICIPAL, 2) + round(PAYROLL_FULL, 2)    # 23.61
POOL_YEAR = POOL_MONTH * 12.0                                # 283.32

want(round(POOL_MONTH, 2) == 23.61, "converged pool is $%.2f, page says $23.61" % POOL_MONTH)

# The low end of the published range, derived the same way.
POOL_LOW = round(MUNICIPAL, 2) + round(PAYROLL_ANCHOR, 2)    # 17.42
want(round(POOL_LOW, 2) == 17.42, "the anchor-end pool is $%.2f, page says $17.42" % POOL_LOW)
for _s in ('$17.42 and $23.61 per resident', '$21.24 to $28.79 for each entitled adult',
           '5.95%', '$9.09'):
    want(_s in H, "the page no longer prints %r - the range must appear where the headline is" % _s)
# and the contradiction the critique found must not return
want('conservative placeholder' not in H,
     "the band is called a conservative placeholder again; it sits above its own anchor")
want(round(POOL_YEAR) == 283, "annual pool is $%.0f, page says $283" % POOL_YEAR)
want('$8.33 municipal + $15.28 federal payroll = <strong>$23.61</strong>' in H,
     "the derivation sentence is missing or no longer sums")
want('$23.61 per resident per month, or $283 per year' in H,
     "the converged-ceiling sentence is missing")

# Year 25 is not convergence: attrition has not finished.
YEAR25 = round(MUNICIPAL, 2) + 7.57
want(round(YEAR25, 2) == 15.90, "year 25 totals $%.2f, page says $15.90" % YEAR25)
want('<strong>$15.90</strong>' in H, "the year-25 total is missing from the page")
want(POOL_MONTH > YEAR25, "convergence should exceed year 25")

# --- shared among adults only -------------------------------------------------
UNDER18 = 0.18
ADULT_MONTH = POOL_MONTH / (1 - UNDER18)
# Derive the annual from the monthly the page PRINTS, not from the annual pool.
# The two routes straddle a rounding boundary ($345.48 vs $345.51) and a reader
# checking this page will multiply the monthly figure in front of them.
ADULT_YEAR = round(ADULT_MONTH, 2) * 12.0
want(round(ADULT_MONTH, 2) == 28.79, "per-adult monthly is $%.2f, page says $28.79" % ADULT_MONTH)
want(round(ADULT_YEAR) == 345, "per-adult annual is $%.0f, page says $345" % ADULT_YEAR)
want('$28.79 per adult per month, or $345 per year' in H, "the per-adult derivation sentence is missing")

# $28.79 is the whole dividend pool per adult, BOTH tiers. Treasury Code 5.4 makes the
# Foundation tier a community-set target drawn first and Treasury 4.1 distributes the
# rest by Contribution Marks, so calling the combined figure the Foundation Dividend
# quantifies the universality claim with a mostly contribution-weighted number.
want('Foundation Dividend of $28.79' not in H and 'Foundation Dividend of <strong>$28.79' not in H,
     "the pool-per-adult figure is labelled as the Foundation Dividend again")
want('dividend pool of $28.79' in H, "the per-adult figure is no longer labelled as the pool")

# $76.3B / 448,000 = $170,312. $143,271 is PBO's $64.19B departmental base: a second
# base smuggled into one cell of the sources table.
want('143,271' not in H, "the sources table pairs $76.3B with a per-FTE figure from a different base")
want('$170,312 each' in H, "the per-FTE figure is missing from the sources table")

# Overhead is stated as a ratio; it must also be deducted somewhere.
want('$7.34 a month' in H, "the net-of-overhead municipal figure is missing")
want('The federal component is not costed' in H, "the page no longer says the federal tier is gross")

# Compact 7.5 makes a vacated line eligible, not released.
want('Entering scope is not the same as being released' in H,
     "the page presents payroll release as automatic again")

want(round(1 / (1 - UNDER18), 2) == 1.22, "the 1.22 multiplier no longer holds")
want('18 &divide; 82 = <strong>22%</strong>' in H, "the 18-over-82 working is missing")
for share, shown in ((0.17, '28.45'), (0.19, '29.15'), (0.20, '29.51')):
    got = '%.2f' % (POOL_MONTH / (1 - share))
    want(got == shown, "%.0f%% under-18 share gives $%s, page says $%s" % (share * 100, got, shown))
    want(('$' + shown) in H, "sensitivity figure $%s missing from the page" % shown)

# --- redirected transfers must not come back ---------------------------------
# Removed 3 October 2026 by founder decision. The page may SAY it does not count
# them; it may not count them. Anything that reads as a plan to take someone's
# pension, child benefit or income assistance is a regression, not an edit.
PLAN_LANGUAGE = (
    'Released transfer pool', 'released transfer pool', 'protected cohort',
    'ages out of its determination', 'Elderly benefits</td>', "Children's benefits</td>",
    '$160.86', '$57.29', '$218.15', '$251.72', '$33.57', '$36.06',
    'Children are the exception', 'The constraint that governs everything',
)
for gone in PLAN_LANGUAGE:
    want(gone not in H, "redirected-transfer content is back on the page: %r" % gone)
want('$2,474.9M' not in H and '$2,304.2M' not in H,
     "B.C. Income Assistance is back in the model")
want('<h3>Provincial</h3>' not in H, "the provincial entitlement section is back")

# The statement of the principle is load-bearing; without it the smaller figure
# looks like an error rather than a decision.
for needle in ('What this model does not count',
               '<strong>This model does not count redirected government transfers.</strong>',
               # Reworded 4 Oct: the old line said the page "does not count it, does
               # not plan against it", which framed the exclusion as a choice. Under
               # Compact 7.1a (10 Oct: a default Members may lift) the page counts none of it.
               'This model therefore counts none of it'):
    want(needle in H, "the page no longer states why transfers are excluded: %r" % needle[:40])

# 10 Oct 2026, founder decision: the arithmetic page cites no founding-document clauses.
# It says what each rule does in plain words; the documents page carries the clause numbers.
# ("Treasury Board" is the federal body, a source, and is not matched.)
_cites=re.findall(r'(?:Government Adoption Compact|Compact|Treasury Code|Treasury(?! Board)|Founding Charter|Charter|'
                  r'Contribution Code|Rules of Procedure|Membership Code|Dispute Procedure Code)\s+(?:Sections?\s+)?\d', H)
want(not _cites, "the page cites founding-document clauses again: %s" % sorted(set(_cites)))

# 10 Oct 2026: "How the pool divides" (first titled "What a Member can earn"). Each cell derives from the published per-adult
# pool e: Foundation = e/2; equal contribution = e; a contributor when 1 in n contribute
# = e/2 + (e/2)*n; the ceiling = 5e, reached at n = (5-s)/(1-s) = 9 with s = 1/2.
def _m(x): return '$%.2f' % (round(x * 100 + 1e-6) / 100)
want(abs((5 - 0.5) / (1 - 0.5) - 9) < 1e-9, "the one-in-nine ceiling no longer follows from s = 1/2 and a 5x cap")
for _e in (21.24, 28.79):
    for _cell in (_e / 2, _e, _e / 2 + _e / 2 * 2, _e / 2 + _e / 2 * 5, 5 * _e):
        want(_m(_cell) in H, "earnings table: %s missing for pool %.2f" % (_m(_cell), _e))
want(round(5 * 21.24 * 12) == 1274 and round(5 * 28.79 * 12) == 1727 and '$1,274 to $1,727 a year' in H,
     "the annual ceiling sentence no longer matches 5 x pool x 12")
want(round(ADULT_MONTH, 2) == 28.79 and round(POOL_LOW / (1 - UNDER18), 2) == 21.24,
     "the earnings table's two pools no longer match the page's per-adult ends")
_mun = round(MUNICIPAL / (1 - UNDER18), 2)
for _cell in (_mun, _mun / 2, 5 * _mun):
    want(_m(_cell) in H, "earnings: municipal %s missing" % _m(_cell))
# 10 Oct 2026, Treasury 4.3 as amended: held-back money joins the next month's
# Foundation Dividend. With participation f below one in nine, the carried amount
# settles at c = (1/2 - 4.5f)/(1 - f) of new money, so a non-contributor receives
# (1/2 + c) of an equal share. The "one in twenty" row and the city line use it.
_f = 1 / 20
_settle = 0.5 + (0.5 - 4.5 * _f) / (1 - _f)
for _e in (21.24, 28.79, _mun):
    want(_m(_settle * _e) in H, "the settled one-in-twenty share %s is missing" % _m(_settle * _e))
want('How the pool divides' in H and 'What a Member can earn' not in H, "the earnings section heading has reverted")
want('Before tax, and before other programmes react' in H, "the tax and benefit-interaction caveat is gone")

# The page states its position; it does not narrate its own revision history. Nobody
# has read an earlier version, so a changelog aimed at readers only plants the idea
# that taking social assistance was ever the plan.
for narration in ('Earlier versions of this page', 'an earlier version of this page',
                  'previously counted', 'used to count', 'no longer counts'):
    want(narration not in H, "the page narrates its own revision history: %r" % narration)

# The Compact still permits redirection by a government that chooses it (Section 7
# was deliberately kept). The page must not imply the mechanism was abolished.
# 10 Oct: checked by substance, not by the clause number, which the page no longer cites.
want('the redirection of an ordinary subsidy a government controls' in H, "the page no longer notes that the Compact still permits redirection")

# Sentences elsewhere on the page that described the OLD funding model and were
# missed when the transfers came out. All three were live on the public site for
# one deploy. This is the recurring defect in this repo: something moved and the
# thing pointing at it did not.
CONTRADICTIONS = {
    'claims the dividend is funded by consolidating transfers':
        'funded almost entirely by consolidating transfer payments',
    'calls payroll a minor contributor (it is $15.28 of $23.61, the larger component)':
        'payroll is a minor contributor',
    'still lists the removed administrative-savings lever':
        'administrative savings as means-testing ends',
}
for what, needle in CONTRADICTIONS.items():
    want(needle not in H, "the page %s: %r" % (what, needle))

# Stage 1's prose cost must track the table it summarises.
want('$0.49M' not in H, "Stage 1 prose still says $0.49M; the table says $0.50M")
want('approximately $0.50M per year' in H, "Stage 1 prose no longer states its cost")
want('<strong>$0.50M</strong>' in H, "the Stage 1 row no longer totals $0.50M")

# Payroll is the LARGER component. If that stops being true the prose above it lies.
want(PAYROLL_FULL > MUNICIPAL,
     "payroll is no longer the larger component; the text saying so must change")

# --- disclosures kept from the 28 September critique pass --------------------
for what, needle in (
    ('the modelled part of the municipal ceiling', '$4.8M step is <strong>modelled, not published</strong>'),
    ('the attrition population mismatch', 'measure different populations'),
    ('the global levers are worldwide and in USD', '<em>worldwide</em>'),
    ('that the whole figure rests on two numbers', 'Almost all of this rests on two numbers'),
):
    want(needle in H, "the page no longer discloses %s" % what)
# 20 Oct 2026: the minimum age to become a Member is a flat eighteen (Charter 1.1) and the dividend has no
# separate age condition (Treasury Code 9.1), so the per-adult denominator is exactly the 18+ population.
# The old "age of majority is 19 in British Columbia" sensitivity existed only to explain the abolished tier.
want('age of majority' not in H and '19 in British Columbia' not in H,
     "the page describes entitlement by the age of majority again; Treasury Code 9.1 has no age condition beyond Charter 1.1's eighteen")
want('clear a meaningful floor when applied to a population' not in H,
     "the retired per-person claim about global tax levers is back")

# --- Part Two must not come back ----------------------------------------------
for gone in ('id="floor"', 'Reaching the poverty line', 'Poverty-Line Supplement',
             'floor top-up', '$21,903', '$35,614', '$17,807', 'Part Two'):
    want(gone not in H, "removed Part Two content has reappeared: %r" % gone)
for chart in ('27_poverty_line_stack', '28_taper_to_average_income', '29_cost_by_income_band',
              '05_dividend_cap_model', '18_bc_income_assistance', '20_waste_recovery'):
    want(chart not in H, "retired or removed chart %s is referenced again" % chart)

# --- and not on the documents page either ------------------------------------
D = io.open('site/documents.html', encoding='utf-8').read()
for chart in ('18_bc_income_assistance', '20_waste_recovery'):
    want(chart not in D, "documents.html still carries %s" % chart)
for gone in ('$38.69', '$41.17', '$36.06', 'Improper-payment recovery', 'base redirection'):
    want(gone not in D, "documents.html still models redirecting Income Assistance: %r" % gone)

# --- nothing points at the removed section ----------------------------------
for page in ('site/index.html', 'site/the-proposition.html', 'site/about-the-triarc.html'):
    other = io.open(page, encoding='utf-8').read()
    want('#floor' not in other and 'Reaching the poverty line' not in other,
         "%s still links into the removed section" % page)

print("municipal      $%.2f/month   (Kelowna $15.0M delegated, 150,000 residents)" % MUNICIPAL)
print("federal        $%.2f/month   (10%% of $76.3B at full attrition, 41.6M residents)" % PAYROLL_FULL)
print("  anchor end   $%.2f/month   (EC 26,649/448,000 = %.2f%%, the like-for-like comparison)"
      % (PAYROLL_ANCHOR, SUBSTITUTABLE_ANCHOR*100))
print("year 25        $%.2f/month" % YEAR25)
print("converged      $%.2f/month   $%.0f/year" % (POOL_MONTH, POOL_YEAR))
print("per adult      $%.2f/month   $%.0f/year   (x%.4f)" % (ADULT_MONTH, ADULT_YEAR, 1 / (1 - UNDER18)))
print("\nredirected government transfers: counted nowhere")
if fails:
    print("\nFAILED")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("\nARITHMETIC PAGE CONSISTENT")
