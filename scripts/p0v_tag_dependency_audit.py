#!/usr/bin/env python3
"""Read-only inventory of Cloud Run tagged endpoint dependencies in omniAgent.

Repository references are useful clues, not a declaration that a tag URL is
unused. Do not access any other project's code or data.
"""
from __future__ import annotations
import argparse
import json
import subprocess
from pathlib import Path

from p0v_safe_revision_cleanup import SERVICES, snapshot, current, records, tags

def classify(tag: str) -> str:
    if tag == "preview":
        return "FIXED_PREVIEW__PROTECT"
    if tag.startswith("p0-trial-"):
        return "OWNER_TRIAL__PROTECT"
    if tag.startswith(("p0v-", "gemini-p0v", "p0v-market")):
        return "P0V_CONSUMER_OR_RELEASE__PROTECT"
    if tag.startswith("ghcr-"):
        return "GHCR_CANDIDATE__REVIEW_REQUIRED"
    return "OTHER_TAG__REVIEW_REQUIRED"

def reference_files(tag: str) -> list[str]:
    result = subprocess.run(["git","grep","-l","-F","--",tag,"--",".github","docs","scripts","services","tests"],
                            capture_output=True,text=True,check=False)
    # Git grep exit status 1 means no matches, not proof of no external usage.
    if result.returncode not in (0,1):
        return ["REPOSITORY_REFERENCE_SCAN_UNAVAILABLE"]
    return sorted(set(result.stdout.splitlines()))[:12]

def audit():
    rows=[]
    for svc in SERVICES:
        doc,rev=snapshot(svc)
        active=current(doc,svc)
        revisions=records(rev,svc)
        for name,percent,tag,url in sorted(tags(doc,svc)):
            if not tag:
                continue
            rows.append({
                "service":svc,"tag":tag,"revision":name,
                "is_formal_revision":name==active,
                "traffic_percent":percent,
                "classification":classify(tag),
                "reference_files_in_omniagent_only":reference_files(tag),
                "tagged_url_present":bool(url),
                "revision_listed":name in revisions,
                "retirement_authorized":False,
                "last_request_seen":"NOT_CHECKED",
                "notes":"No automatic deletion; absence of repository refs is not evidence of unused URL.",
            })
    return rows

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--receipt",required=True)
    args=parser.parse_args()
    rows=audit()
    path=Path(args.receipt)
    path.write_text(json.dumps({"status":"READ_ONLY_TAG_DEPENDENCY_AUDIT",
                 "tag_retirements_authorized":0,"tags":rows},sort_keys=True,indent=2)+"\n")
    for svc in SERVICES:
        subset=[r for r in rows if r["service"]==svc]
        by_kind={}
        for r in subset:
            by_kind[r["classification"]]=by_kind.get(r["classification"],0)+1
        print("service="+svc+" tagged_urls="+str(len(subset))+
              " classification="+json.dumps(by_kind,sort_keys=True))
    print("tag_retirements=ZERO automatic_tags_eligible_for_deletion=ZERO")
