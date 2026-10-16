#!/usr/bin/env python3
"""One-shot, owner-scoped Codex candidate staging. No provider calls or formal traffic changes.

The operator ID is supplied only at runtime after OAuth database hash verification.
Trial values are applied solely to no-traffic revisions; service templates are
restored immediately so later GHCR candidates never inherit enabled dispatch.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

PROJECT = "gen-lang-client-0593591102"
REGION = "us-central1"
OWNER_DIGEST = "bd46f8f29ba78faaa606f03d6a760c1726ce27a7cd75381d5c04b9525861f70f"
SOURCE_SECRET = "projects/gen-lang-client-0593591102/secrets/omniagent-shared-codex-auth"
GATEWAY_SA = "omniagent-gateway@gen-lang-client-0593591102.iam.gserviceaccount.com"
MODEL = "gpt-5.6-luna"
SERVICES = ("omniagent-chat", "omniagent-agent-gateway")

def cmd(*args, quiet=False):
    result = subprocess.run(args, capture_output=True, text=True, check=False, timeout=220)
    if result.returncode:
        # Cloud SDK errors may contain env or identity metadata. Never publish.
        raise RuntimeError("cloud command failed: " + args[0] + " " + args[1] + " (redacted)")
    return result.stdout if not quiet else ""

def describe(service):
    return json.loads(cmd("gcloud", "run", "services", "describe", service,
                         "--project=" + PROJECT, "--region=" + REGION, "--format=json"))

def template(doc):
    return ((doc.get("spec") or {}).get("template") or {})

def env(doc):
    rows = (((template(doc).get("spec") or {}).get("containers") or [{}])[0].get("env") or [])
    return {r.get("name"):r for r in rows}

def tagged(doc, tag):
    candidates = [r for r in ((doc.get("status") or {}).get("traffic") or [])
                  if r.get("tag")==tag and r.get("revisionName") and r.get("percent",0)==0
                  and str(r.get("url","")).startswith("https://")]
    if len(candidates)!=1:
        raise RuntimeError("candidate tag missing or not zero-traffic")
    return candidates[0]

def serving(doc):
    return {str(r.get("revisionName")):int(r.get("percent",0))
            for r in ((doc.get("status") or {}).get("traffic") or [])
            if r.get("percent",0)>0}

def image_for(service, service_doc, revision):
    """Return the approved GHCR source URI after verifying the deployed digest.

    Cloud Run may render the imported Revision image as a *.pkg.dev mirror,
    although the SERVICE template retains the original immutable GHCR URI.
    Never deploy the mirror path or trust a matching digest without verifying
    its exact approved service-specific GHCR source first.
    """
    if service not in SERVICES or not revision.startswith(service + "-"):
        raise RuntimeError("candidate service or revision identity mismatch")
    configured = ((template(service_doc).get("spec") or {}).get("containers") or [])
    prefix = "ghcr.io/tommylin15/" + service + "@sha256:"
    if len(configured) != 1:
        raise RuntimeError("unexpected service template containers")
    source_image = str(configured[0].get("image") or "")
    if not source_image.startswith(prefix) or not re.fullmatch(
            r"[a-f0-9]{64}", source_image[len(prefix):]):
        raise RuntimeError("service template is not pinned public GHCR")
    spec = json.loads(cmd("gcloud", "run", "revisions", "describe", revision,
                          "--project="+PROJECT, "--region="+REGION, "--format=json"))
    containers = ((spec.get("spec") or {}).get("containers") or [])
    actual = str(containers[0].get("image") or "") if len(containers) == 1 else ""
    if not actual.endswith("@sha256:" + source_image[len(prefix):]):
        raise RuntimeError("revision digest differs from approved GHCR template")
    ready = (spec.get("status") or {}).get("conditions") or []
    if not any(c.get("type") == "Ready" and c.get("status") == "True" for c in ready):
        raise RuntimeError("approved GHCR revision is not ready")
    return source_image

def annotation_max(doc):
    annotations=(template(doc).get("metadata") or {}).get("annotations") or {}
    value=str(annotations.get("autoscaling.knative.dev/maxScale",""))
    if not value.isdigit() or not (1<=int(value)<=15):
        raise RuntimeError("unknown existing instance limit")
    return value

def launch(service,image,tag,vars_,max_instances):
    if any("!" in str(v) or "\n" in str(v) for v in vars_.values()):
        raise RuntimeError("untrusted env delimiter")
    pairs="!".join(k+"="+v for k,v in vars_.items())
    cmd("gcloud","run","deploy",service,
        "--project="+PROJECT,"--region="+REGION,"--image="+image,
        "--no-traffic","--tag="+tag,"--max-instances="+str(max_instances),
        "--update-env-vars=^!^"+pairs,"--quiet",quiet=True)
    after=describe(service)
    row=tagged(after,tag)
    revision=json.loads(cmd("gcloud","run","revisions","describe",row["revisionName"],
                        "--project="+PROJECT,"--region="+REGION,"--format=json"))
    conditions=((revision.get("status") or {}).get("conditions") or [])
    if not any(c.get("type")=="Ready" and c.get("status")=="True" for c in conditions):
        raise RuntimeError("new trial revision not ready")
    return row["url"]

def restore(service,image,removal,vars_,instances):
    args=["gcloud","run","deploy",service,"--project="+PROJECT,"--region="+REGION,
          "--image="+image,"--no-traffic","--max-instances="+str(instances)]
    if removal: args+=["--remove-env-vars="+",".join(removal)]
    if vars_: args+=["--update-env-vars=^!^"+"!".join(k+"="+v for k,v in vars_.items())]
    args+=["--quiet"]
    cmd(*args,quiet=True)

def main():
    if len(sys.argv)!=4:
        raise SystemExit("usage: stage.py SHA VERIFIED_OWNER_ID REPORT_JSON")
    sha,owner,report=sys.argv[1:]
    if not re.fullmatch("[a-f0-9]{40}",sha):
        raise RuntimeError("source SHA invalid")
    if not re.fullmatch("[a-f0-9-]{36}",owner) or hashlib.sha256(owner.encode()).hexdigest()!=OWNER_DIGEST:
        raise RuntimeError("owner not verified by approved OAuth DB mapping")
    tag="ghcr-"+sha[:12]
    trial="p0-trial-"+sha[:12]
    before={svc:describe(svc) for svc in SERVICES}
    for svc in SERVICES:
        tagged(before[svc],tag)
        if serving(before[svc])=={} or sum(serving(before[svc]).values())!=100:
            raise RuntimeError("formal serving traffic not fully understood")
    gate=env(before["omniagent-agent-gateway"])
    chat=env(before["omniagent-chat"])
    if template(before["omniagent-agent-gateway"])["spec"].get("serviceAccountName") != GATEWAY_SA:
        raise RuntimeError("native Gateway identity differs from IAM grant")
    if any(x in gate for x in ("CODEX_CHAT_TRIAL_OWNER_SECRETS","CODEX_OWNER_SECRETS")):
        raise RuntimeError("pre-existing Gateway trial/owner setting must be reconciled")
    if "OMNIAGENT_PROVIDER_BUNDLE" not in gate:
        raise RuntimeError("signed Gateway bundle missing")
    for name in ("CHAT_DISPATCH_APPROVED_OWNER_IDS","CHAT_DISPATCH_ENTITLEMENTS_JSON",
                 "CHAT_GATEWAY_URL","CHAT_GATEWAY_AUDIENCE"):
        if name in chat:
            raise RuntimeError("unexpected inherited Chat trial field")
    if (chat.get("CHAT_DISPATCH_ENABLED") or {}).get("value") not in ("false",None):
        raise RuntimeError("Chat dispatcher is already enabled")
    if "OMNIAGENT_BUNDLE" not in chat:
        raise RuntimeError("Chat signed bundle missing")
    if (chat.get("CHAT_BYOK_MANAGEMENT_ENABLED") or {}).get("value")=="true":
        raise RuntimeError("BYOK must be disabled")
    images={svc:image_for(svc,before[svc],tagged(before[svc],tag)["revisionName"]) for svc in SERVICES}
    maxes={svc:annotation_max(before[svc]) for svc in SERVICES}
    gateway_audience=(before["omniagent-agent-gateway"].get("status") or {}).get("url","")
    if not gateway_audience.startswith("https://"):
        raise RuntimeError("private Gateway token audience missing")
    mutated=[]
    restored=[]
    success=False
    gateway_trial=""
    chat_trial=""
    try:
        # Candidate revision is not publicly available without Cloud Run invoker IAM.
        native_map=json.dumps({owner:SOURCE_SECRET},separators=(",",":"))
        mutated.append("omniagent-agent-gateway")
        gateway_trial=launch("omniagent-agent-gateway",images["omniagent-agent-gateway"],
                             trial,{"CODEX_CHAT_TRIAL_OWNER_SECRETS":native_map},1)
        entitlements=json.dumps([{"ownerId":owner,"runtime":"codex","model":MODEL,
                                  "credentialMode":"platform"}],separators=(",",":"))
        mutated.append("omniagent-chat")
        chat_trial=launch("omniagent-chat",images["omniagent-chat"],trial,
            {"CHAT_DISPATCH_ENABLED":"true",
             "CHAT_DISPATCH_APPROVED_OWNER_IDS":owner,
             "CHAT_DISPATCH_ENTITLEMENTS_JSON":entitlements,
             "CHAT_GATEWAY_URL":gateway_trial,
             "CHAT_GATEWAY_AUDIENCE":gateway_audience},1)
        success=True
    finally:
        # Restore the service's latest *template* promptly: GHCR's future
        # normal candidate deploys must never inherit trial feature flags.
        for svc in reversed(mutated):
            try:
                if svc=="omniagent-chat":
                    restore(svc,images[svc],
                            ["CHAT_DISPATCH_APPROVED_OWNER_IDS","CHAT_DISPATCH_ENTITLEMENTS_JSON",
                             "CHAT_GATEWAY_URL","CHAT_GATEWAY_AUDIENCE"],
                            {"CHAT_DISPATCH_ENABLED":"false"},maxes[svc])
                else:
                    restore(svc,images[svc],["CODEX_CHAT_TRIAL_OWNER_SECRETS"],{},maxes[svc])
                restored.append(svc)
            except Exception:
                success=False
                print("staging_template_restore="+svc+"_FAILED")
        after={svc:describe(svc) for svc in SERVICES}
        if any(serving(before[svc])!=serving(after[svc]) for svc in SERVICES):
            success=False
            print("formal_traffic_unchanged=FAIL")
        else:
            print("formal_traffic_unchanged=PASS")
        if (env(after["omniagent-chat"]).get("CHAT_DISPATCH_ENABLED") or {}).get("value")!="false":
            success=False
        if any(k in env(after["omniagent-chat"]) for k in
               ("CHAT_DISPATCH_APPROVED_OWNER_IDS","CHAT_DISPATCH_ENTITLEMENTS_JSON",
                "CHAT_GATEWAY_URL","CHAT_GATEWAY_AUDIENCE")):
            success=False
        if "CODEX_CHAT_TRIAL_OWNER_SECRETS" in env(after["omniagent-agent-gateway"]):
            success=False
        print("staging_template_restore="+("PASS" if len(restored)==len(mutated) and success else "FAIL"))
    if not success or not gateway_trial or not chat_trial:
        raise RuntimeError("trial canary failed or unsafe restore; do not start inference")
    response={"sha":sha,"trial_tag":trial,"chat_url":chat_trial,
              "gateway_tagged_endpoint_ready":"PASS","formal_traffic_unchanged":"PASS",
              "baseline_template_restored":"PASS","owner_authorization":"ONE_VERIFIED_OWNER",
              "model":MODEL,"provider_calls_started":"NO",
              "db_budget_remaining":"READ_SEPARATE_RECEIPT",
              "shared_secret_versions_modified":"NO"}
    Path(report).write_text(json.dumps(response,indent=2)+"\n")
    print("p0_owner_trial_canary=PASS_ZERO_TRAFFIC")
    print("trial_chat_url="+chat_trial)
    print("trial_model="+MODEL)
    print("paid_inference_calls=ZERO_PRE_STAGE")

if __name__=="__main__":
    try: main()
    except Exception as exc:
        # No secrets, Owner IDs or cloud errors in CI logs.
        print("p0_owner_trial_canary=BLOCKED")
        print("reason_type="+type(exc).__name__)
        if type(exc) is RuntimeError:
            # RuntimeError messages in this module are constant, redacted
            # preflight codes only. Never emit subprocess stderr or env.
            print("preflight_reason="+str(exc))
        sys.exit(1)
