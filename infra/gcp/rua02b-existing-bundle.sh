#!/usr/bin/env bash
# One-shot RUA-02B: append role-specific DSNs/public TLS anchor to existing
# omniagent-bundle; no new Secret resource or provider key rotation.
set -euo pipefail
set +x
umask 077
PROJECT=gen-lang-client-0593591102
ZONE=us-central1-a
HOST=janus-postgres-dev
SECRET=omniagent-bundle
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
# OS Login/IAP public-key propagation may lag. Retry the SAME command only.
retry_iap() {
  local attempt
  for attempt in 1 2 3; do
    if "$@"; then return 0; fi
    echo "rua02b_iap_retry=$attempt" >&2
    sleep $((attempt * 4))
  done
  echo "rua02b_iap_exhausted=BLOCKED" >&2
  return 1
}

before="$(gcloud secrets versions describe latest --secret="$SECRET" --project="$PROJECT" --format='value(name)')"
[[ "$before" == projects/*/secrets/omniagent-bundle/versions/* ]] || { echo "rua02b_original_version=BLOCKED"; exit 2; }
gcloud secrets versions access latest --secret="$SECRET" --project="$PROJECT" --out-file="$work/bundle.json" >/dev/null
gcloud compute instances describe "$HOST" --project="$PROJECT" --zone="$ZONE" --format=json >"$work/vm.json"
python3 - "$work" <<'PY'
import ipaddress,json,secrets,sys
from pathlib import Path
from urllib.parse import urlsplit,unquote
p=Path(sys.argv[1])
doc=json.loads((p/'bundle.json').read_text())
if not isinstance(doc,dict) or 'router_usage' in doc:
    raise SystemExit('rua02b_bundle_already_configured_or_invalid')
raw=doc.get('chat_database_url')
if not isinstance(raw,str):raise SystemExit('rua02b_chat_dsn_absent')
u=urlsplit(raw)
vm=json.loads((p/'vm.json').read_text())
address=vm['networkInterfaces'][0]['networkIP']
if (u.scheme not in ('postgres','postgresql') or unquote(u.username or '')!='omniagent_chat_app'
    or u.path!='/omniagent_chat' or (u.port or 5432)!=5432
    or u.hostname!=address or not ipaddress.ip_address(address).is_private):
    raise SystemExit('rua02b_database_endpoint_unverified')
(p/'host').write_text(address)
for mode in ('writer','reader'):
    password=secrets.token_hex(32)
    (p/(mode+'-password')).write_text(password)
    (p/(mode+'-dsn')).write_text(
        f'postgresql://omniagent_usage_{mode}:{password}@{address}:5432/omniagent_gateway?sslmode=require')
print('rua02b_endpoint_scoped=PASS')
PY
cat >"$work/public-cert-only.sh" <<'REMOTE'
#!/usr/bin/env bash
set -euo pipefail
umask 077
c=janus-postgres
pg(){ sudo docker exec -u postgres "$c" psql -X -A -t -v ON_ERROR_STOP=1 -d postgres -c "$1"; }
[[ "$(pg 'SHOW ssl')" == on ]]
f="$(pg 'SHOW ssl_cert_file')"
d="$(pg 'SHOW data_directory')"
[[ "$f" =~ ^[A-Za-z0-9_./-]+$ && "$d" =~ ^/[A-Za-z0-9_./-]+$ ]]
[[ "$f" == /* ]] || f="$d/$f"
[[ "$f" == "$d/"* ]]
sudo docker exec -u postgres "$c" cat "$f" > /tmp/rua02b-omniagent-public.pem
chmod 644 /tmp/rua02b-omniagent-public.pem
REMOTE
chmod 700 "$work/public-cert-only.sh"
retry_iap gcloud compute scp "$work/public-cert-only.sh" "$HOST:/tmp/rua02b-public-cert-only.sh" \
  --project="$PROJECT" --zone="$ZONE" --tunnel-through-iap --quiet >/dev/null
retry_iap gcloud compute ssh "$HOST" --project="$PROJECT" --zone="$ZONE" --tunnel-through-iap --quiet \
  --command="bash /tmp/rua02b-public-cert-only.sh" >/dev/null
retry_iap gcloud compute scp "$HOST:/tmp/rua02b-omniagent-public.pem" "$work/public-ca.pem" \
  --project="$PROJECT" --zone="$ZONE" --tunnel-through-iap --quiet >/dev/null
retry_iap gcloud compute ssh "$HOST" --project="$PROJECT" --zone="$ZONE" --tunnel-through-iap --quiet \
  --command="rm -f /tmp/rua02b-public-cert-only.sh /tmp/rua02b-omniagent-public.pem" >/dev/null
observed="$(openssl x509 -in "$work/public-ca.pem" -noout -fingerprint -sha256 | sed 's/^.*=//')"
[[ "$observed" == '5F:16:D1:58:31:AA:50:FA:4A:EF:09:08:7F:1A:70:5D:96:DA:90:CF:23:3C:FF:AE:16:7B:D7:CD:E9:47:25:56' ]] ||
  { echo "rua02b_public_ca_fingerprint=DRIFT"; exit 3; }
openssl x509 -in "$work/public-ca.pem" -noout -checkhost janus-postgres-dev | grep -q 'does match'
# The shared server cert file may contain a PEM chain or introductory text.
# Normalize to the one audited public X.509 cert, excluding all non-cert data.
openssl x509 -in "$work/public-ca.pem" -out "$work/normalized-public-ca.pem"
mv "$work/normalized-public-ca.pem" "$work/public-ca.pem"
python3 "$ROOT/infra/gcp/merge-router-usage-bundle.py" \
  "$work/bundle.json" "$work/writer-dsn" "$work/reader-dsn" \
  "$work/public-ca.pem" "$work/host" "$work/new-bundle.json"
now="$(gcloud secrets versions describe latest --secret="$SECRET" --project="$PROJECT" --format='value(name)')"
[[ "$before" == "$now" ]] || { echo "rua02b_bundle_concurrently_modified=BLOCKED"; exit 4; }
gcloud secrets versions add "$SECRET" --project="$PROJECT" \
  --data-file="$work/new-bundle.json" --quiet >/dev/null
gcloud secrets versions access latest --secret="$SECRET" --project="$PROJECT" \
  --out-file="$work/readback.json" >/dev/null
cmp -s "$work/new-bundle.json" "$work/readback.json" ||
  { echo "rua02b_bundle_readback=FAILED"; exit 5; }
echo "rua02b_existing_secret=omniagent-bundle"
echo "rua02b_new_secret_resources=ZERO"
echo "rua02b_bundle_version_readback=PASS"
echo "rua02b_db_role_logins=NOT_YET_ENABLED"
echo "rua02b_live_capture=NOT_CONFIGURED"
