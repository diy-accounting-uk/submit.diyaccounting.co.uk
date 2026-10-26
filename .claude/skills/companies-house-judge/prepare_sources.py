#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited
"""Turns a folder that scripts/companies-house-review.mjs wrote into the layout the judge reads:
<case>/source/ holds our own data (the case input, the submit request and response, the last poll
response), and <case>/reference/ holds the Companies House example from another company.

Usage, from the repository root (needs gh for the run artifacts):
    python3 -I .claude/skills/companies-house-judge/prepare_sources.py target/companies-house-review/<date>
"""
import base64, glob, json, os, re, shutil, subprocess, sys, tempfile, zipfile

ROOT = os.path.abspath(sys.argv[1])
REPO = os.path.abspath(os.path.join(ROOT, "..", "..", ".."))
REPO_SLUG = "diy-accounting-uk/submit.diyaccounting.co.uk"
FIXTURE = os.path.join(REPO, "scripts", "fixtures", "companies-house-test-service-cases.json")
ADP_DIR = os.path.join(REPO, "target", "companies-house-review", "adp")


def exchanges_of(run_id):
    """The harness artifact of a companies-house-test-service run: its evidence log entry."""
    tmp = tempfile.mkdtemp(prefix=f"ch-run-{run_id}-")
    subprocess.run(["gh", "run", "download", run_id, "--repo", REPO_SLUG, "-D", tmp], check=True)
    logs = glob.glob(os.path.join(tmp, "*", "evidence-log.json"))
    entries = json.load(open(logs[0]))
    shutil.rmtree(tmp)
    return entries[0]


def main():
    cases = json.load(open(FIXTURE))
    for case_dir in sorted(d for d in os.listdir(ROOT) if os.path.isdir(os.path.join(ROOT, d)) and re.match(r"\d-", d)):
        path = os.path.join(ROOT, case_dir)
        source = os.path.join(path, "source")
        reference = os.path.join(path, "reference")
        os.makedirs(source, exist_ok=True)
        os.makedirs(reference, exist_ok=True)

        name = re.search(r"Fixture case `([^`]+)`", open(os.path.join(ROOT, "findings.md")).read().split(f"## {case_dir}:")[1]).group(1)
        case = next(c for c in cases if c["name"] == name)
        json.dump(case, open(os.path.join(source, "case-input.json"), "w"), indent=2)

        note = case.get("expectedOutcome", {}).get("note", "")
        runs = re.findall(r"run (\d{8,})", note)
        if len(runs) >= 1:
            filing = exchanges_of(runs[0])
            submit = next(x for x in filing["exchanges"] if x["label"] == "submit")
            open(os.path.join(source, "submit-request.xml"), "w").write(submit["requestXml"])
            open(os.path.join(source, "submit-response.xml"), "w").write(submit["responseXml"] or "")
            data = re.search(r"<Data>([^<]{200,})</Data>", submit["requestXml"], re.S)
            filed = open(os.path.join(path, "filed.xhtml"), "rb").read()
            if data and base64.b64decode(data.group(1)) != filed:
                print(f"{case_dir}: the document in the submit request differs from filed.xhtml; a builder changed after the filing")
        if len(runs) >= 2:
            poll = exchanges_of(runs[1])
            open(os.path.join(source, "last-poll-response.xml"), "w").write(poll["exchanges"][-1]["responseXml"] or "")

        src_txt = os.path.join(path, "example-source.txt")
        if os.path.exists(src_txt):
            m = re.search(r"(Accounts_Bulk_Data-[0-9-]+\.zip) entry (\S+\.html)", open(src_txt).read())
            if m:
                with zipfile.ZipFile(os.path.join(ADP_DIR, m.group(1))) as z:
                    open(os.path.join(reference, m.group(2)), "wb").write(z.read(m.group(2)))
                company = m.group(2).split("_")[2]
                open(os.path.join(reference, "example-source.txt"), "w").write(
                    "A different company's accepted filing, used for layout only. None of its figures are ours.\n"
                    f"Raw example: reference/{m.group(2)} (unmodified entry from the zip)\n"
                    f"Zip: {m.group(1)} at target/companies-house-review/adp/, from https://download.companieshouse.gov.uk/{m.group(1)}\n"
                    f"Company: {company}, https://find-and-update.company-information.service.gov.uk/company/{company}\n")
                os.remove(src_txt)
        for f in ("example.png",):
            if os.path.exists(os.path.join(path, f)):
                shutil.move(os.path.join(path, f), os.path.join(reference, f))
        if os.path.exists(os.path.join(path, "example.xhtml")):
            os.remove(os.path.join(path, "example.xhtml"))
        print(f"{case_dir}: source/ {sorted(os.listdir(source))}; reference/ {sorted(os.listdir(reference))}")


main()
