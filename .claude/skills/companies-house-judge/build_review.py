#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited
"""Builds the reconciliation, reference/ layout, walkthrough headers and index.html for one
Companies House review folder (target/companies-house-review/<date>/), and renders judge.json
when the judge has written it.

Usage, from the repository root:
    python3 -I .claude/skills/companies-house-judge/build_review.py target/companies-house-review/<date>
"""
import html, json, os, re, shutil, sys
from datetime import date

ROOT = os.path.abspath(sys.argv[1])
REPO = os.path.abspath(os.path.join(ROOT, "..", "..", ".."))
REVIEW_DATE = os.path.basename(ROOT)
os.chdir(ROOT)

TITLES = {
    "micro": "Micro-entity accounts (FRS 105)",
    "dormant": "Dormant micro-entity accounts (FRS 105)",
    "small-full": "Small company full accounts (FRS 102 section 1A)",
    "small-filleted": "Small company filleted accounts (FRS 102 section 1A)",
}
CASES = {d: TITLES.get(d.split("-", 1)[1], d) for d in sorted(os.listdir("."))
         if os.path.isfile(os.path.join(d, "source", "case-input.json"))}
FIXTURE = "scripts/fixtures/companies-house-test-service-cases.json"

def fixture_line(name):
    for n, line in enumerate(open(os.path.join(REPO, FIXTURE)), 1):
        if f'"name": "{name}"' in line:
            return n
    return "?"

class _Lines(dict):
    def __missing__(self, name):
        return fixture_line(name)

FIXTURE_LINE = _Lines()
TEST_REGISTER = "../staging/xmlgw-where-to-test/1-test-service-test-presenter-response.xml"
TRIAGE = "../private.diyaccounting.co.uk/companies-house/correspondence/TRIAGE_XMLGW_ACCOUNTS_2026-10-24.md"
SKILL = ".claude/skills/companies-house-review/SKILL.md"

# Why each criterion is checked: the rule or request it comes from.
WHY = {
    "Nothing of the iXBRL header is visible": "XML team, 23 Oct 2026, on submission 000038: the accounts \"include information in the header and footer that should not appear\".",
    "A readable balance sheet with labels and both years": "XML team, 23 Oct 2026: \"missing significant data ... follow the examples\"; every published example shows a labelled line with both years.",
    "Nothing after the last note": "XML team, 23 Oct 2026: information in the footer \"that should not appear\".",
    "Every fact the example carries is in ours": "XML team, 23 Oct 2026: \"missing significant data ... follow the examples\".",
    "Production software name and version": "Accounts technical interface specification (TIS): software name and version are mandatory facts.",
    "AccountsTypeDimension": "TIS and the FRC taxonomy: the accounts type member must match the accounts filed.",
    "AccountingStandardsDimension": "TIS and the FRC taxonomy: the standards member must match the regime (FRS 105 micro, FRS 102 1A small).",
    "ApplicableLegislationDimension": "TIS and the FRC taxonomy: small companies regime accounts name the applicable legislation.",
    "EntityTradingStatusDimension": "TIS: a dormant company that has never traded carries this member.",
    "EntityDormantTruefalse": "TIS: the dormant flag is mandatory and must match the accounts type.",
    "Companies House test validator passes": "Companies House's own validator: what their system checks before a person reads the filing.",
    "iXBRL structure": "Inline XBRL 1.1 specification: one hidden header, every fact in a declared context and unit.",
    "Section 477": "Companies Act 2006 s477: a small company claiming audit exemption must say so on the balance sheet.",
    "Section 480": "Companies Act 2006 s480: a dormant company claiming audit exemption must say so on the balance sheet.",
    "Members have not required an audit": "Companies Act 2006 s475(3) and s476: the statement that members have not required an audit.",
    "Directors acknowledge": "Companies Act 2006 s475(3)(b): the directors' responsibility statement.",
    "Prepared in accordance with the micro-entity provisions": "Companies Act 2006 s414(3): micro-entity accounts state the regime.",
    "Prepared in accordance with the small companies regime": "Companies Act 2006 s414(3): small companies regime accounts state the regime.",
    "Section 444(5)": "Companies Act 2006 s444(5): accounts delivered under the small companies regime say so.",
    "Section 444(5A)": "Companies Act 2006 s444(5A): filleted accounts state that the profit and loss account is not delivered.",
    "Directors' approval line": "Companies Act 2006 s414(1)-(2): the balance sheet is approved by the board and signed by a director, named.",
    "Look": "XML team, 23 Oct 2026: \"follow the examples\"; the reviewer compares the rendered page with a published example of the same type.",
}

def why_for(criterion):
    for k, v in WHY.items():
        if criterion.startswith(k) or k in criterion:
            return v
    return "Companies House review skill criteria table (" + SKILL + ")."

# Input field -> (concept, context kind, suffix). Kind: e = balance sheet date, y = the period.
BS = {"fixedAssets": ("FixedAssets", ""), "currentAssets": ("CurrentAssets", ""),
      "creditorsWithinOneYear": ("Creditors", "-within-one-year"),
      "creditorsAfterOneYear": ("Creditors", "-after-one-year"),
      "calledUpShareCapital": ("Equity", "-share-capital"),
      "profitAndLossAccount": ("Equity", "-profit-and-loss-account"),
      "capitalAndReserves": ("Equity", ""), "stocks": ("TotalInventories", ""),
      "debtors": ("Debtors", ""), "cashAtBank": ("CashBankOnHand", ""),
      "tradeCreditors": ("TradeCreditorsTradePayables", "-within-one-year"),
      "corporationTax": ("CorporationTaxPayable", "-within-one-year"),
      "otherCreditors": ("OtherCreditors", "-within-one-year")}
PL = {"turnover": "TurnoverRevenue", "costOfSales": "CostSales", "grossProfit": "GrossProfitLoss",
      "administrativeExpenses": "AdministrativeExpenses", "operatingProfit": "OperatingProfitLoss",
      "interestReceivable": "OtherInterestReceivableSimilarIncomeFinanceIncome",
      "profitBeforeTax": "ProfitLossOnOrdinaryActivitiesBeforeTax",
      "tax": "TaxTaxCreditOnProfitOrLossOnOrdinaryActivities", "profit": "ProfitLoss"}
FA = {"costAtStart": ("PropertyPlantEquipmentGrossCost", "e", -1),
      "additions": ("AdditionsOtherThanThroughBusinessCombinationsPropertyPlantEquipment", "y", 0),
      "disposals": ("DisposalsPropertyPlantEquipment", "y", 0),
      "depreciationAtStart": ("AccumulatedDepreciationImpairmentPropertyPlantEquipment", "e", -1),
      "depreciationCharge": ("IncreaseFromDepreciationChargeForYearPropertyPlantEquipment", "y", 0),
      "depreciationOnDisposals": ("DisposalsDecreaseInDepreciationImpairmentPropertyPlantEquipment", "y", 0)}

def num(text):
    t = (text or "").strip().replace(",", "").replace("£", "")
    neg = t.startswith("(") and t.endswith(")")
    t = t.strip("()")
    if t in ("-", "–", ""):
        return 0 if t else None
    try:
        v = float(t)
    except ValueError:
        return None
    return -v if neg else v

def long_date(iso):
    d = date.fromisoformat(iso)
    return f"{d.day} {d.strftime('%B %Y')}"

def fmt(v):
    return f"{int(v):,}" if isinstance(v, (int, float)) and float(v).is_integer() else str(v)

def build_case(c, title):
    inp = json.load(open(f"{c}/source/case-input.json"))
    facts = json.load(open(f"{c}/facts.json"))
    visible = open(f"{c}/visible-text.txt").read()
    yr = int(inp["periodEnd"][:4])
    cur, pri = str(yr), str(yr - 1)

    def fact(concept, context):
        for x in facts:
            if x["concept"] == concept and x["context"] == context:
                return x
        return None

    rows = []  # (field, input, concept@context, tagged, visible, result)
    def check(field, value, concept, context, is_number=True):
        f = fact(concept, context)
        tagged = f["text"] if f else None
        if is_number:
            ok = f is not None and num(tagged) is not None and abs(num(tagged)) == abs(float(value))
            shown = fmt(value) in visible if value != 0 else True
        else:
            ok = f is not None and tagged.strip() == str(value).strip()
            shown = str(value) in visible
        rows.append((field, fmt(value) if is_number else value, f"{concept} @ {context}",
                     tagged if tagged is not None else "not tagged", "yes" if shown else "no",
                     "match" if ok and shown else ("match (tag); not found as text" if ok else "MISMATCH")))

    check("companyNumber", inp["companyNumber"], "UKCompaniesHouseRegisteredNumber", f"y{cur}", False)
    check("companyName", inp["companyName"], "EntityCurrentLegalOrRegisteredName", f"y{cur}", False)
    check("periodStart", long_date(inp["periodStart"]), "StartDateForPeriodCoveredByReport", f"p{cur}", False)
    check("periodEnd", long_date(inp["periodEnd"]), "EndDateForPeriodCoveredByReport", f"e{cur}", False)
    check("averageEmployees", inp["averageEmployees"], "AverageNumberEmployeesDuringPeriod", f"y{cur}")
    check("director.name", inp["director"]["name"], "NameEntityOfficer", f"y{cur}-director-1", False)
    check("director.dateApproved", long_date(inp["director"]["dateApproved"]), "DateAuthorisationFinancialStatementsForIssue", f"e{cur}", False)

    sc = inp.get("smallCompany")
    bs = sc["balanceSheet"] if sc else inp["balanceSheet"]
    for yk, y in (("currentYear", cur), ("priorYear", pri)):
        for k, v in bs[yk].items():
            if k in BS:
                concept, suf = BS[k]
                check(f"balanceSheet.{yk}.{k}", v, concept, f"e{y}{suf}")
    if sc:
        if sc.get("principalActivity"):
            check("smallCompany.principalActivity", sc["principalActivity"], "DescriptionPrincipalActivities", f"y{cur}", False)
        if not sc.get("filleted"):
            for yk, y in (("currentYear", cur), ("priorYear", pri)):
                for k, v in sc["profitAndLoss"][yk].items():
                    if k in PL:
                        check(f"profitAndLoss.{yk}.{k}", v, PL[k], f"y{y}")
        for cls, note in (sc.get("fixedAssetNote") or {}).items():
            for k, v in note.items():
                concept, kind, off = FA[k]
                check(f"fixedAssetNote.{cls}.{k}", v, concept, f"{kind}{yr + off}-ppe-{cls}")

    # Arithmetic on the output facts.
    def val(concept, context):
        f = fact(concept, context)
        return num(f["text"]) if f else None
    arith = []
    def add(label, expr_text, lhs, rhs):
        ok = lhs is not None and rhs is not None and abs(lhs - rhs) < 0.5
        arith.append((label, expr_text, fmt(lhs) if lhs is not None else "—", fmt(rhs) if rhs is not None else "—", "match" if ok else "MISMATCH"))
    for y in (cur, pri):
        ca = val("CurrentAssets", f"e{y}")
        if sc:
            add(f"Current assets {y}", "stocks + debtors + cash", ca,
                sum(filter(None, [val("TotalInventories", f"e{y}") or 0, val("Debtors", f"e{y}") or 0, val("CashBankOnHand", f"e{y}") or 0])))
            add(f"Creditors within one year {y}", "trade + corporation tax + other", val("Creditors", f"e{y}-within-one-year"),
                sum([val("TradeCreditorsTradePayables", f"e{y}-within-one-year") or 0, val("CorporationTaxPayable", f"e{y}-within-one-year") or 0, val("OtherCreditors", f"e{y}-within-one-year") or 0]))
        cw = val("Creditors", f"e{y}-within-one-year") or 0
        add(f"Net current assets {y}", "current assets − creditors within one year", val("NetCurrentAssetsLiabilities", f"e{y}"), (ca or 0) - cw)
        add(f"Total assets less current liabilities {y}", "fixed assets + net current assets", val("TotalAssetsLessCurrentLiabilities", f"e{y}"),
            (val("FixedAssets", f"e{y}") or 0) + (val("NetCurrentAssetsLiabilities", f"e{y}") or 0))
        add(f"Net assets {y}", "total assets less current liabilities − creditors after one year", val("NetAssetsLiabilities", f"e{y}"),
            (val("TotalAssetsLessCurrentLiabilities", f"e{y}") or 0) - (val("Creditors", f"e{y}-after-one-year") or 0))
        add(f"Capital and reserves {y}", "share capital + profit and loss account", val("Equity", f"e{y}"),
            (val("Equity", f"e{y}-share-capital") or 0) + (val("Equity", f"e{y}-profit-and-loss-account") or 0))
        add(f"Balance sheet balances {y}", "net assets = capital and reserves", val("NetAssetsLiabilities", f"e{y}"), val("Equity", f"e{y}"))
        if sc and not sc.get("filleted"):
            t, cs = val("TurnoverRevenue", f"y{y}"), val("CostSales", f"y{y}")
            add(f"Gross profit {y}", "turnover − cost of sales", val("GrossProfitLoss", f"y{y}"), (t or 0) - abs(cs or 0))
            add(f"Operating profit {y}", "gross profit − administrative expenses", val("OperatingProfitLoss", f"y{y}"),
                (val("GrossProfitLoss", f"y{y}") or 0) - abs(val("AdministrativeExpenses", f"y{y}") or 0))
            add(f"Profit before tax {y}", "operating profit + interest receivable", val("ProfitLossOnOrdinaryActivitiesBeforeTax", f"y{y}"),
                (val("OperatingProfitLoss", f"y{y}") or 0) + (val("OtherInterestReceivableSimilarIncomeFinanceIncome", f"y{y}") or 0))
            add(f"Profit for the year {y}", "profit before tax − tax", val("ProfitLoss", f"y{y}"),
                (val("ProfitLossOnOrdinaryActivitiesBeforeTax", f"y{y}") or 0) - abs(val("TaxTaxCreditOnProfitOrLossOnOrdinaryActivities", f"y{y}") or 0))
    if sc and sc.get("fixedAssetNote"):
        for cls in sc["fixedAssetNote"]:
            ctx = lambda k, y: f"{k}{y}-ppe-{cls}"
            add(f"{cls}: cost at {cur} end", "cost at start + additions − disposals", val("PropertyPlantEquipmentGrossCost", ctx("e", cur)),
                (val("PropertyPlantEquipmentGrossCost", ctx("e", pri)) or 0) + (val(FA["additions"][0], ctx("y", cur)) or 0) - (val(FA["disposals"][0], ctx("y", cur)) or 0))
            add(f"{cls}: depreciation at {cur} end", "at start + charge − on disposals", val(FA["depreciationAtStart"][0], ctx("e", cur)),
                (val(FA["depreciationAtStart"][0], ctx("e", pri)) or 0) + (val(FA["depreciationCharge"][0], ctx("y", cur)) or 0) - (val(FA["depreciationOnDisposals"][0], ctx("y", cur)) or 0))
            add(f"{cls}: net book value {cur}", "cost − depreciation", val("PropertyPlantEquipment", ctx("e", cur)),
                (val("PropertyPlantEquipmentGrossCost", ctx("e", cur)) or 0) - (val(FA["depreciationAtStart"][0], ctx("e", cur)) or 0))
        add(f"Fixed assets {cur}", "total net book value of the classes = balance sheet fixed assets", val("FixedAssets", f"e{cur}"), val("PropertyPlantEquipment", f"e{cur}"))

    # reconciliation.md
    lines = [f"# {c}: our input against our output", "",
             f"Input: `source/case-input.json` (case `{inp['name']}`, `{FIXTURE}` line {FIXTURE_LINE[inp['name']]}). "
             "Output: the facts tagged in `filed.xhtml` (`facts.json`) and the text a reader sees in `rendered.png` (`visible-text.txt`).", "",
             "| Input field | Input | Tagged as | Tagged value | Shown as text | Result |", "|---|---|---|---|---|---|"]
    lines += [f"| {r[0]} | {r[1]} | {r[2]} | {r[3]} | {r[4]} | {r[5]} |" for r in rows]
    lines += ["", "## The totals, recomputed from the tagged figures", "",
              "| Total | Rule | Tagged | Recomputed | Result |", "|---|---|---|---|---|"]
    lines += [f"| {a[0]} | {a[1]} | {a[2]} | {a[3]} | {a[4]} |" for a in arith]
    bad = [r for r in rows if r[5] == "MISMATCH"] + [a for a in arith if a[4] == "MISMATCH"]
    lines += ["", f"{len(rows)} input fields and {len(arith)} totals checked; {len(bad)} mismatches."]
    open(f"{c}/reconciliation.md", "w").write("\n".join(lines) + "\n")
    return rows, arith, bad, inp

def move_reference(c):
    os.makedirs(f"{c}/reference", exist_ok=True)
    for f in os.listdir(f"{c}/source"):
        if f.startswith("Prod"):
            shutil.move(f"{c}/source/{f}", f"{c}/reference/{f}")
    for f in ("example.png", "example-source.txt"):
        if os.path.exists(f"{c}/{f}"):
            shutil.move(f"{c}/{f}", f"{c}/reference/{f}")
    raw = [f for f in os.listdir(f"{c}/reference") if f.startswith("Prod")][0]
    p = f"{c}/reference/example-source.txt"
    s = open(p).read().replace(f"source/{raw}", f"reference/{raw}")
    if not s.startswith("A different company"):
        s = "A different company's accepted filing, used for layout only. None of its figures are ours.\n" + s
    open(p, "w").write(s)
    return raw

def parse_findings():
    out, cur = {}, None
    for line in open("findings.md"):
        m = re.match(r"^## (\S+):", line)
        if m:
            cur = m.group(1); out[cur] = []; continue
        if cur and line.startswith("| ") and not line.startswith("| Criterion") and not line.startswith("|---"):
            cells = [x.strip() for x in line.strip().strip("|").split("|")]
            if len(cells) >= 4:
                out[cur].append(dict(criterion=cells[0], result=cells[1], evidence=cells[2], file=cells[3]))
    return out

JUDGE = json.load(open("judge.json")) if os.path.exists("judge.json") else {}

def main():
    findings = parse_findings()
    judge = JUDGE
    results = {}
    for c, title in CASES.items():
        if os.path.isdir(f"{c}/source") and any(f.startswith("Prod") for f in os.listdir(f"{c}/source")):
            move_reference(c)
        raw = [f for f in os.listdir(f"{c}/reference") if f.startswith("Prod")][0]
        rows, arith, bad, inp = build_case(c, title)
        results[c] = dict(rows=rows, arith=arith, bad=bad, inp=inp, raw=raw)
    # Paths in the review files.
    for f in ["findings.md", "walkthrough.md"] + [f"{c}/fact-comparison.md" for c in CASES]:
        s = open(f).read()
        s = re.sub(r"source/(Prod[0-9_]+\.html)", r"reference/\1", s)
        s = re.sub(r"`(\d-[a-z-]+)/example\.png`", r"`\1/reference/example.png`", s)
        s = re.sub(r"`(\d-[a-z-]+)/example-source\.txt`", r"`\1/reference/example-source.txt`", s)
        s = s.replace("(see example-source.txt)", "(see reference/example-source.txt)")
        s = re.sub(r"(\d-[a-z-]+)/example\.png", r"\1/reference/example.png", s).replace("reference/reference/", "reference/")
        open(f, "w").write(s)
    write_walkthrough(results)
    write_html(findings, results, judge)

def header(c, r, j=None):
    n = len(r["rows"]); a = len(r["arith"]); b = len(r["bad"])
    return [f"- **Proven:** the {n} input fields appear in the filed accounts as tagged and as visible text, and the {a} totals recompute from the tagged figures ({b} mismatches, `{c}/reconciliation.md`); Companies House's validator answers valid; the gateway acknowledged the submission.",
            "- **Not proven:** acceptance. Companies House answered PENDING to every poll, so the outcome is POLL_TIMEOUT, neither ACCEPT nor REJECT. The figures are synthetic test data, so nothing proves them true of a real company.",
            f"- **Source:** figures from our fixture, `source/case-input.json`. Company number, name and director from Companies House's test register (`{TEST_REGISTER}`, lines 27, 28, 52 and 53). The example in `reference/` is a different company, for layout only."]

def write_walkthrough(results):
    s = open("walkthrough.md").read()
    # Folder description: source vs reference.
    s = re.sub(r"- `source/Prod223_….html`.*\n", "", s)
    if "`reference/`" not in s.split("## ")[0]:
        s = s.replace("Start with `findings.md`: the verdict per case. No row fails and none is pending.", "Each case folder also has `reference/`: a Companies House example of the same type of accounts. It is a different company's accepted filing, used for layout only; none of its figures are ours.\n\nOpen `index.html` first: every check per case, why it is checked, the data behind it, and the judge's verdict and reasoning. `findings.md` holds the script's rows; the judge fails all four cases on the test data (see each case's Judge line).", 1)
    for c, r in results.items():
        sec = re.search(rf"(## {re.escape(c)}:[^\n]*\n\n)((?:- \*\*(?:Proven|Not proven|Source|Judge):\*\*[^\n]*\n)+\n)*", s)
        start = sec.group(1)
        j = JUDGE.get(c, {})
        body = "\n".join(header(c, r) + ([f"- **Judge:** {j['verdict']}. {j['summary']} Reasoning in `index.html`."] if j else [])) + "\n\n"
        s = s[:sec.start()] + start + body + s[sec.end():]
        step0 = f"0. `{c}/reconciliation.md`: our input against our output. Every input figure, its tagged value and whether it shows as text, then every total recomputed. Source: `source/case-input.json`, `{c}/facts.json`, `{c}/visible-text.txt`."
        if f"0. `{c}/reconciliation.md`" not in s:
            s = re.sub(rf"(\n1\. `{re.escape(c)}/submission.txt`)", "\n" + step0 + r"\1", s, count=1)
        s = re.sub(rf"`{re.escape(c)}/example.png`: the Companies House example of the same type\.",
                   f"`{c}/reference/example.png`: the Companies House example of the same type: a different company, for layout only.", s)
        s = s.replace(f"Source data: `{c}/source/`. The figures are case", f"Source data: `{c}/source/`; reference: `{c}/reference/`. The figures are case")
        s = s.replace(f"The example is company", f"The layout example is company")
    open("walkthrough.md", "w").write(s)

def esc(x):
    return html.escape(str(x))

def write_html(findings, results, judge):
    css = """
:root{--bg:#fbfaf7;--ink:#1d1f21;--muted:#5d6166;--rule:#d9d6cf;--card:#ffffff;--ok:#1f7a3a;--bad:#b3261e;--warn:#8a5a00;--accent:#2c5aa0}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#16181b;--ink:#e8e6e1;--muted:#a3a7ad;--rule:#33373c;--card:#1e2125;--ok:#6fcf8a;--bad:#ff8a80;--warn:#e0b45c;--accent:#8fb4ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:1200px;margin:0 auto;padding:24px 16px 80px}h1{font-size:26px;margin:0 0 4px}h2{font-size:21px;margin:40px 0 8px;padding-top:16px;border-top:2px solid var(--rule)}
h3{font-size:16px;margin:24px 0 8px}.muted{color:var(--muted)}a{color:var(--accent)}
nav{position:sticky;top:0;background:var(--bg);padding:8px 0;border-bottom:1px solid var(--rule);z-index:2;display:flex;gap:12px;flex-wrap:wrap}
.card{background:var(--card);border:1px solid var(--rule);border-radius:8px;padding:12px 16px;margin:12px 0}
table{border-collapse:collapse;width:100%;font-size:13.5px}th,td{text-align:left;vertical-align:top;padding:6px 8px;border-bottom:1px solid var(--rule)}th{font-weight:600}
.scroll{overflow-x:auto}.ok{color:var(--ok);font-weight:600}.bad{color:var(--bad);font-weight:600}.warn{color:var(--warn);font-weight:600}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}.pair img{width:100%;border:1px solid var(--rule);border-radius:4px;background:#fff}
@media (max-width:760px){.pair{grid-template-columns:1fr}}
pre{white-space:pre-wrap;background:var(--card);border:1px solid var(--rule);border-radius:6px;padding:8px;font-size:12.5px;max-height:240px;overflow:auto}
details summary{cursor:pointer;font-weight:600}code,.kv span{overflow-wrap:anywhere}table{table-layout:auto}td{overflow-wrap:anywhere}.kv{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px}
"""
    def cls(res):
        r = res.lower()
        return "ok" if r.startswith("pass") or r.startswith("match") or r == "yes" else ("bad" if "fail" in r or "mismatch" in r else "warn")
    out = ["<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>",
           "<title>Companies House review</title><style>" + css + "</style></head><body><main>",
           f"<h1>Companies House review, {REVIEW_DATE}</h1>",
           "<p class='muted'>Four test filings to the Companies House XML Gateway test service. Per case: what we checked, why, what we found, and the data behind it. Links open the files in this folder.</p>",
           "<nav>" + "".join(f"<a href='#{c}'>{c}</a>" for c in CASES) + "</nav>"]
    for c, title in CASES.items():
        r = results[c]; inp = r["inp"]; j = judge.get(c, {})
        sub = re.search(r"Submission number: (\S+)", open(f"{c}/submission.txt").read()).group(1)
        out.append(f"<h2 id='{c}'>{c}: {esc(title)}, submission {sub}</h2>")
        out.append("<div class='card'><div class='kv'>" + "".join(f"<b>{k}</b><span>{v}</span>" for k, v in [
            ("Proven", f"{len(r['rows'])} input fields in the filed accounts and {len(r['arith'])} totals recomputed: <span class='{'ok' if not r['bad'] else 'bad'}'>{len(r['bad'])} mismatches</span>. Companies House's validator: valid. Gateway: acknowledged."),
            ("Not proven", "Acceptance: PENDING at every poll (POLL_TIMEOUT). The figures are synthetic test data."),
            ("Figures from", f"<a href='{c}/source/case-input.json'>source/case-input.json</a> (our fixture, <code>{FIXTURE}</code> line {FIXTURE_LINE[inp['name']]})"),
            ("Company from", f"Companies House test register: {esc(inp['companyNumber'])} {esc(inp['companyName'])}, director {esc(inp['director']['name'])} (<code>{TEST_REGISTER}</code>)"),
            ("Judge", f"<span class='{cls(j.get('verdict','pending'))}'>{esc(j.get('verdict','pending'))}</span> {esc(j.get('summary',''))}"),
        ]) + "</div></div>")
        # 1. Reconciliation
        out.append("<h3>1. Our input against our output</h3><p class='muted'>Why: the figures filed must be the figures we meant to file, and the totals must add up. Data: <a href='" + c + "/source/case-input.json'>case-input.json</a>, <a href='" + c + "/facts.json'>facts.json</a>, <a href='" + c + "/visible-text.txt'>visible-text.txt</a>, <a href='" + c + "/reconciliation.md'>reconciliation.md</a>.</p>")
        out.append("<div class='scroll'><table><tr><th>Input field</th><th>Input</th><th>Tagged as</th><th>Tagged</th><th>Shown</th><th>Result</th></tr>" +
                   "".join(f"<tr><td>{esc(x[0])}</td><td>{esc(x[1])}</td><td class='muted'>{esc(x[2])}</td><td>{esc(x[3])}</td><td>{esc(x[4])}</td><td class='{cls(x[5])}'>{esc(x[5])}</td></tr>" for x in r["rows"]) + "</table></div>")
        out.append("<div class='scroll'><table><tr><th>Total</th><th>Rule</th><th>Tagged</th><th>Recomputed</th><th>Result</th></tr>" +
                   "".join(f"<tr><td>{esc(a[0])}</td><td class='muted'>{esc(a[1])}</td><td>{esc(a[2])}</td><td>{esc(a[3])}</td><td class='{cls(a[4])}'>{esc(a[4])}</td></tr>" for a in r["arith"]) + "</table></div>")
        # 2. Companies House rules
        out.append("<h3>2. Companies House's rules and requests</h3><p class='muted'>Why each row is checked comes from the XML team's emails (record: <code>" + TRIAGE + "</code>), the accounts technical interface specification, and the Companies Act 2006. Criteria and how the script judges them: <code>" + SKILL + "</code>.</p>")
        out.append("<div class='scroll'><table><tr><th>Check</th><th>Why we check it</th><th>Result</th><th>What we found</th><th>Data</th><th>Judge</th></tr>")
        for row in findings.get(c, []):
            paths = [p.strip().strip("`") for p in row["file"].split(",") if p.strip()]
            paths = [re.sub(r"^(\d-[a-z-]+)/example\.png$", r"\1/reference/example.png", p) for p in paths]
            link = ", ".join(f"<a href='{p}'>{esc(os.path.basename(p))}</a>" for p in paths)
            jr = next((v for k, v in j.get("rows", {}).items() if row["criterion"].startswith(k[:30])), "")
            out.append(f"<tr><td>{esc(row['criterion'])}</td><td class='muted'>{esc(why_for(row['criterion']))}</td><td class='{cls(row['result'])}'>{esc(row['result'])}</td><td>{esc(row['evidence'])}</td><td>{link}</td><td>{esc(jr)}</td></tr>")
        out.append("</table></div>")
        if j.get("added"):
            out.append("<h3>2b. Checks the judge added</h3><p class='muted'>Rules the script does not check yet; a reviewer at Companies House would.</p><div class='scroll'><table><tr><th>Check</th><th>Why we check it</th><th>Result</th><th>What we found</th><th>Data</th></tr>")
            for a in j["added"]:
                d = a["data"]; href = d if d.startswith("..") else f"{c}/{d}"
                out.append(f"<tr><td>{esc(a['check'])}</td><td class='muted'>{esc(a['why'])}</td><td class='{cls(a['result'])}'>{esc(a['result'])}</td><td>{esc(a['found'])}</td><td><a href='{href}'>{esc(os.path.basename(d))}</a></td></tr>")
            out.append("</table></div>")
        vt = open(f"{c}/visible-text.txt").read()
        out.append(f"<details><summary>The visible text of our accounts (visible-text.txt)</summary><pre>{esc(vt)}</pre></details>")
        out.append(f"<details><summary>The validator's answer (validator.txt)</summary><pre>{esc(open(f'{c}/validator.txt').read())}</pre></details>")
        # 3. Gateway
        sresp = open(f"{c}/source/submit-response.xml").read()
        last = open(f"{c}/source/last-poll-response.xml").read()
        status = re.findall(r"<StatusCode>([^<]+)", last)
        out.append("<h3>3. What the gateway answered</h3><p class='muted'>Why: a filing is accepted only when Companies House answers ACCEPT. Data: <a href='" + c + "/source/submit-request.xml'>submit-request.xml</a> (carries filed.xhtml), <a href='" + c + "/source/submit-response.xml'>submit-response.xml</a>, <a href='" + c + "/source/last-poll-response.xml'>last-poll-response.xml</a>, <a href='" + c + "/submission.txt'>submission.txt</a>.</p>")
        q = re.search(r"<Qualifier>([^<]+)", sresp); ts = re.search(r"<GatewayTimestamp>([^<]+)", sresp)
        errs = re.findall(r"<Text>([^<]+)</Text>", sresp) if "<GovTalkErrors" in sresp else []
        acc = (q and q.group(1) == "response" and not errs)
        acc_text = f"yes: Qualifier response, no GovTalk errors, gateway time {ts.group(1) if ts else '?'}" if acc else "no: " + esc("; ".join(errs) or (q.group(1) if q else "no qualifier"))
        out.append(f"<div class='card'><div class='kv'><b>Taken for processing</b><span class='{'ok' if acc else 'bad'}'>{acc_text}</span><b>Last status</b><span class='warn'>{esc(', '.join(status) or 'none')}</span></div></div>")
        # 4. Layout against the example
        out.append(f"<h3>4. Our layout beside a published example</h3><p class='muted'>Why: the XML team asked us to \"follow the examples\". The example is a different company's accepted filing of the same type (<a href='{c}/reference/{r['raw']}'>{r['raw']}</a>, origin in <a href='{c}/reference/example-source.txt'>example-source.txt</a>), for layout only; its figures are not ours.</p>")
        out.append(f"<div class='pair'><figure><figcaption><b>Ours</b> (filed.xhtml)</figcaption><a href='{c}/rendered.png'><img loading='lazy' src='{c}/rendered.png' alt='Our accounts, {c}'></a></figure><figure><figcaption><b>Example</b> (company {r['raw'].split('_')[2]})</figcaption><a href='{c}/reference/example.png'><img loading='lazy' src='{c}/reference/example.png' alt='Companies House example'></a></figure></div>")
        out.append(f"<p>Facts the example tags that ours lacks, and why: <a href='{c}/fact-comparison.md'>fact-comparison.md</a>.</p>")
        if j.get("reasoning"):
            out.append("<h3>5. Judge's reasoning</h3><div class='card'>" + "".join(f"<p>{esc(p)}</p>" for p in j["reasoning"]) + "</div>")
    out.append("</main></body></html>")
    open("index.html", "w").write("\n".join(out))

main()
