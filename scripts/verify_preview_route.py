"""Read back a preview-only Cloud Run tag update without exposing runtime config."""
import json
import sys
from pathlib import Path


def validate(before, after, candidate):
    def active(d):
        return sorted((r["revisionName"], r["percent"]) for r in d["status"]["traffic"] if (r.get("percent") or 0))
    def other_tags(d):
        return {r["tag"]: (r["revisionName"], (r.get("percent") or 0)) for r in d["status"]["traffic"] if r.get("tag") and r["tag"] != "preview"}
    live = active(before)
    preview = [r for r in after["status"]["traffic"] if r.get("tag") == "preview"]
    if (len(live) != 1 or live[0][1] != 100 or active(after) != live
            or other_tags(before) != other_tags(after)
            or before["spec"]["template"] != after["spec"]["template"]
            or len(preview) != 1 or preview[0]["revisionName"] != candidate
            or preview[0].get("percent") not in (None, 0)
            or not preview[0].get("url", "").startswith("https://")):
        raise ValueError("preview update changed protected routing or template")
    return preview[0]["url"]


if __name__ == "__main__":
    print(validate(json.loads(Path(sys.argv[1]).read_text()), json.loads(Path(sys.argv[2]).read_text()), sys.argv[3]))
