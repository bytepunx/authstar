#!/usr/bin/env bash
# The golden-path scenario: tenant provisioning -> portcullis auth -> tower
# -> keep billing -> herald email -> chronicle analytics, scripted and
# repeatable against a live cluster (scripts/up.sh + scripts/provision.sh +
# scripts/deploy.sh or deploy-local.sh must have already run).
#
# Every step here was driven by hand against a real cluster before being
# captured in this script -- see README.md's "Golden-path scenario" section
# for the full list of real bugs that manual pass found and fixed (stale
# RabbitMQ credentials, a missing JWKS host, tower's east-west TLS scheme,
# missing signetAdminToken/operatorToken secrets, a wrong chronicle
# eventType). This script exercises the real API contracts those fixes
# unblocked -- no mocking, no fake services.
#
# Auth mechanics per step (see README.md's own writeup for the "why"):
#   - tenant provisioning: tower's operator bearer token
#   - portcullis login: the real Dex authorization-code + PKCE flow, driven
#     with plain curl (no headless browser -- Dex's staticPasswords
#     connector serves a plain HTML form)
#   - tower verification: tower's operator routes (bypass JWT/JWKS --
#     see the "Known gap" note below for why the JWT-verified path isn't
#     used here)
#   - keep: a real Stripe-signature-verified webhook call (keep's own HMAC
#     scheme, computable in bash via openssl -- no Stripe account needed)
#   - chronicle: lookout's genuinely unauthenticated /events ingestion route,
#     then a self-minted HS256 JWT using chronicle's own configured dev
#     secret (real auth check, not bypassed)
#   - herald: verified only as far as POST /operator/rotate-keys succeeding
#     (proves herald's own operator API + admin-token wiring) -- see the
#     "Known gap" note for why a full send-and-verify isn't attempted here
#
# Known gap: herald's rotate-keys route successfully pushes its real
# payload-encryption public key to tower's signet secret path
# (authstar/tower/heraldPayloadPublicKey, confirmed via herald's own {
# "rotated": [...] } response), but tower's *own* subsequent bundle fetch
# never picks it up -- even after a fresh pod restart and repeated
# `signet repo sync` calls, tower keeps logging "no signet-sourced herald
# payload-encryption public key configured yet" and falls back to a
# fresh ephemeral key every boot. That mismatch means any comms.* event
# tower publishes is encrypted with a key herald can never decrypt --
# a PERMANENT failure that herald's own comms-consumer.ts (blanket
# `nack(msg, false, true)` on any ingestCommunication error, no backoff,
# no dead-lettering, the error itself silently swallowed) turns into an
# infinite tight redelivery loop -- confirmed live via the RabbitMQ
# management API showing herald.comms at 700k+ redeliveries in minutes.
# This script deliberately does NOT create a fresh invite (which would
# retrigger that loop) until both bugs are fixed:
#   1. why tower's bundle fetch doesn't see a secret pushed via
#      signetAdmin.pushSecret soon after a fresh signet repo sync
#      (signetd-internals question, not something this repo owns)
#   2. herald/src/lib/comms-consumer.ts should distinguish permanent
#      failures (decryption, malformed payload) from transient ones
#      (a momentary store outage) and dead-letter the former instead of
#      requeuing forever
# Fix both, then this script's herald step can be extended to create a
# real invite and verify the resulting communication_snapshot row.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_cmd curl
require_cmd openssl
require_cmd python3
require_cmd kubectl

TENANT_SLUG="${TENANT_SLUG:-acme}"
DEX_LOGIN="${DEX_LOGIN:-admin@example.com}"
DEX_PASSWORD="${DEX_PASSWORD:-password}"

TOWER_LOCAL_PORT="${TOWER_LOCAL_PORT:-19443}"
PORTCULLIS_LOCAL_PORT="${PORTCULLIS_LOCAL_PORT:-19080}"
DEX_LOCAL_PORT="${DEX_LOCAL_PORT:-19081}"
KEEP_LOCAL_PORT="${KEEP_LOCAL_PORT:-19091}"
LOOKOUT_LOCAL_PORT="${LOOKOUT_LOCAL_PORT:-19092}"
CHRONICLE_LOCAL_PORT="${CHRONICLE_LOCAL_PORT:-19093}"
HERALD_LOCAL_PORT="${HERALD_LOCAL_PORT:-19090}"

WORKDIR="$(mktemp -d)"
trap 'kill $(jobs -p) 2>/dev/null || true; rm -rf "$WORKDIR"' EXIT

PASS=0
FAIL=0
pass() { log "PASS: $1"; PASS=$((PASS + 1)); }
fail() { log "FAIL: $1"; FAIL=$((FAIL + 1)); }

port_forward() {
  local svc="$1" local_port="$2" remote_port="$3" namespace="${4:-$AUTHSTAR_NAMESPACE}"
  kubectl port-forward -n "$namespace" "svc/$svc" "${local_port}:${remote_port}" \
    >"$WORKDIR/pf-${svc}.log" 2>&1 &
  disown
  for _ in $(seq 1 20); do
    nc -z localhost "$local_port" 2>/dev/null && return 0
    sleep 0.5
  done
  die "port-forward to $svc:$remote_port never became ready"
}

log "starting port-forwards"
port_forward tower "$TOWER_LOCAL_PORT" 8080
port_forward portcullis "$PORTCULLIS_LOCAL_PORT" 3710
port_forward dex "$DEX_LOCAL_PORT" 5556 dex
port_forward keep "$KEEP_LOCAL_PORT" 8080
port_forward lookout "$LOOKOUT_LOCAL_PORT" 3000
port_forward chronicle "$CHRONICLE_LOCAL_PORT" 3000

TOWER_URL="https://localhost:${TOWER_LOCAL_PORT}"
PORTCULLIS_URL="http://localhost:${PORTCULLIS_LOCAL_PORT}"
DEX_URL="http://localhost:${DEX_LOCAL_PORT}"
KEEP_URL="http://localhost:${KEEP_LOCAL_PORT}"
LOOKOUT_URL="http://localhost:${LOOKOUT_LOCAL_PORT}"
CHRONICLE_URL="http://localhost:${CHRONICLE_LOCAL_PORT}"

TOWER_OPERATOR_TOKEN="${TOWER_OPERATOR_TOKEN:-dev-placeholder-nWvzdBisvYWVX4ZqZ4iE3k7jC-dmh5nbrU_9DcI536A}"
CHRONICLE_JWT_SECRET="${CHRONICLE_JWT_SECRET:-dev-only-insecure-secret}"

##############################################################################
log "step 1/6: tenant provisioning (tower, real, idempotent)"
##############################################################################
provision_response="$(curl -sk -X POST "${TOWER_URL}/tenants" \
  -H "Authorization: Bearer ${TOWER_OPERATOR_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"slug\":\"${TENANT_SLUG}\",\"name\":\"Acme Corp\",\"adminEmail\":\"${DEX_LOGIN}\"}" \
  -w '\n%{http_code}')"
provision_status="$(echo "$provision_response" | tail -1)"
if [[ "$provision_status" == "201" || "$provision_status" == "200" ]]; then
  pass "tenant provisioning ($provision_status)"
else
  fail "tenant provisioning (HTTP $provision_status): $(echo "$provision_response" | head -1)"
fi

##############################################################################
log "step 2/6: portcullis + Dex login (real OAuth2/PKCE, no browser)"
##############################################################################
login_headers="$WORKDIR/login-headers.txt"
curl -s -D "$login_headers" -o /dev/null \
  "${PORTCULLIS_URL}/oauth2/dex/login" -H "Host: ${TENANT_SLUG}.authstar.app"

location="$(grep -i '^location:' "$login_headers" | sed 's/^[Ll]ocation: //' | tr -d '\r')"
query="$(echo "$location" | sed 's|.*/auth?||')"
oauth_state="$(grep -i 'oauth2-state=' "$login_headers" | sed -E 's/.*oauth2-state=([^;]+);.*/\1/')"
pkce_verifier="$(grep -i 'oauth2-pkce-verifier=' "$login_headers" | sed -E 's/.*oauth2-pkce-verifier=([^;]+);.*/\1/')"

if [[ -z "$oauth_state" || -z "$pkce_verifier" ]]; then
  fail "login step 1 (portcullis /oauth2/dex/login) -- no state/PKCE cookies returned"
else
  step2_headers="$WORKDIR/step2-headers.txt"
  curl -s -D "$step2_headers" -o /dev/null "${DEX_URL}/auth?${query}"
  loc2="$(grep -i '^location:' "$step2_headers" | sed 's/^[Ll]ocation: //' | tr -d '\r')"

  step3_headers="$WORKDIR/step3-headers.txt"
  curl -s -D "$step3_headers" -o /dev/null "${DEX_URL}${loc2}"
  loc3="$(grep -i '^location:' "$step3_headers" | sed 's/^[Ll]ocation: //' | tr -d '\r')"
  dex_state="$(echo "$loc3" | sed -E 's/.*state=([^&]+).*/\1/')"

  step5_headers="$WORKDIR/step5-headers.txt"
  curl -s -D "$step5_headers" -o /dev/null -X POST \
    "${DEX_URL}/auth/local/login?back=&state=${dex_state}" \
    --data-urlencode "login=${DEX_LOGIN}" \
    --data-urlencode "password=${DEX_PASSWORD}"
  loc5="$(grep -i '^location:' "$step5_headers" | sed 's/^[Ll]ocation: //' | tr -d '\r')"
  code="$(echo "$loc5" | sed -E 's/.*code=([^&]+).*/\1/')"
  callback_state="$(echo "$loc5" | sed -E 's/.*state=([^&]+).*/\1/')"

  if [[ -z "$code" ]]; then
    fail "login step 5 (Dex local login) -- no authorization code returned"
  else
    callback_headers="$WORKDIR/callback-headers.txt"
    curl -s -D "$callback_headers" -o /dev/null \
      "${PORTCULLIS_URL}/oauth2/dex/callback?code=${code}&state=${callback_state}" \
      -H "Host: ${TENANT_SLUG}.authstar.app" \
      -H "Cookie: oauth2-state=${oauth_state}; oauth2-pkce-verifier=${pkce_verifier}"

    if grep -qi '^set-cookie: jwt=' "$callback_headers"; then
      pass "portcullis + Dex login -- real jwt session cookie issued"
    else
      callback_status="$(grep -i '^HTTP/' "$callback_headers" | tail -1)"
      fail "login step 6 (portcullis callback, $callback_status) -- no jwt cookie in response"
    fi
  fi
fi

##############################################################################
log "step 3/6: verify tower actually resolved/created the account"
##############################################################################
accounts_response="$(curl -sk "${TOWER_URL}/operator/tenants/${TENANT_SLUG}/accounts" \
  -H "Authorization: Bearer ${TOWER_OPERATOR_TOKEN}" \
  -H "X-Operator-Actor: scenario-script" \
  -w '\n%{http_code}')"
accounts_status="$(echo "$accounts_response" | tail -1)"
accounts_body="$(echo "$accounts_response" | sed '$d')"
if [[ "$accounts_status" == "200" ]] && echo "$accounts_body" | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if len(d) > 0 else 1)' 2>/dev/null; then
  pass "tower resolved a real account via the login flow"
else
  fail "tower account verification (HTTP $accounts_status): $accounts_body"
fi

##############################################################################
log "step 4/6: keep billing -- real Stripe-signature-verified webhook"
##############################################################################
KEEP_WEBHOOK_SECRET="${KEEP_WEBHOOK_SECRET:-whsec_PlaceholderAcmeDevWebhookSigningSecret0000}"
payload='{"id":"evt_scenario","type":"customer.subscription.created","data":{"object":{"id":"sub_scenario","customer":"cus_scenario","status":"active","current_period_end":1999999999,"items":{"data":[{"price":{"id":"price_scenario"}}]}}}}'
ts="$(date +%s)"
sig="$(printf '%s.%s' "$ts" "$payload" | openssl dgst -sha256 -hmac "$KEEP_WEBHOOK_SECRET" | sed 's/^.* //')"
webhook_response="$(curl -s -X POST "${KEEP_URL}/_authstar/webhooks/stripe" \
  -H "x-authstar-tenant-slug: ${TENANT_SLUG}" \
  -H "stripe-signature: t=${ts},v1=${sig}" \
  -H "Content-Type: application/json" \
  -d "$payload" \
  -w '\n%{http_code}')"
webhook_status="$(echo "$webhook_response" | tail -1)"
if [[ "$webhook_status" == "200" ]]; then
  pass "keep billing webhook (real Stripe HMAC signature verified)"
else
  fail "keep billing webhook (HTTP $webhook_status): $(echo "$webhook_response" | head -1)"
fi

##############################################################################
log "step 5/6: herald -- verify operator key-rotation API works"
##############################################################################
# Deliberately NOT sending a fresh invite here -- see this script's own
# header comment for why (an unresolved key-distribution bug turns any new
# comms.* event into an infinite RabbitMQ redelivery loop until fixed).
HERALD_OPERATOR_TOKEN="${HERALD_OPERATOR_TOKEN:-}"
if [[ -n "$HERALD_OPERATOR_TOKEN" ]]; then
  port_forward herald "$HERALD_LOCAL_PORT" 8080
  HERALD_URL="http://localhost:${HERALD_LOCAL_PORT}"
  rotate_response="$(curl -s -X POST "${HERALD_URL}/operator/rotate-keys" \
    -H "Authorization: Bearer ${HERALD_OPERATOR_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"keys":["unsubscribe-signing"]}' \
    -w '\n%{http_code}')"
  rotate_status="$(echo "$rotate_response" | tail -1)"
  if [[ "$rotate_status" == "200" ]]; then
    pass "herald operator key-rotation API (real signet admin push)"
  else
    fail "herald key rotation (HTTP $rotate_status): $(echo "$rotate_response" | head -1)"
  fi
else
  log "SKIP: herald step needs HERALD_OPERATOR_TOKEN set -- see README.md for the current dev value"
fi

##############################################################################
log "step 6/6: chronicle analytics -- real lookout ingest -> ClickHouse -> report"
##############################################################################
event_id="scenario-$(date +%s)"
ingest_response="$(curl -s -X POST "${LOOKOUT_URL}/events" \
  -H "Content-Type: application/json" \
  -d "{\"tenant\":\"${TENANT_SLUG}\",\"application\":\"web\",\"eventType\":\"auth.login-succeeded\",\"identityHash\":\"${event_id}\",\"idp\":\"dex\"}" \
  -w '\n%{http_code}')"
ingest_status="$(echo "$ingest_response" | tail -1)"
if [[ "$ingest_status" != "202" ]]; then
  fail "lookout event ingestion (HTTP $ingest_status): $(echo "$ingest_response" | head -1)"
else
  chronicle_jwt="$(python3 - "$CHRONICLE_JWT_SECRET" <<'PYEOF'
import sys, hmac, hashlib, base64, json, time

def b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=')

secret = sys.argv[1].encode()
header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
payload = b64url(json.dumps({"permissions": ["analytics:read"], "iat": int(time.time()), "exp": int(time.time()) + 300}, separators=(",", ":")).encode())
signing_input = header + b"." + payload
sig = b64url(hmac.new(secret, signing_input, hashlib.sha256).digest())
print((signing_input + b"." + sig).decode())
PYEOF
)"

  # Give chronicle's RabbitMQ consumer a moment to write the row before
  # querying. Chronicle enforces a max 92-day report window, so use a
  # narrow one around today rather than an arbitrary wide range.
  report_from="$(date -u -v-1d +%Y-%m-%d 2>/dev/null || date -u -d '1 day ago' +%Y-%m-%d)"
  report_to="$(date -u -v+1d +%Y-%m-%d 2>/dev/null || date -u -d '1 day' +%Y-%m-%d)"
  found=0
  for _ in $(seq 1 10); do
    report="$(curl -s "${CHRONICLE_URL}/tenants/${TENANT_SLUG}/analytics/reports/auth-funnel?from=${report_from}&to=${report_to}" \
      -H "Authorization: Bearer ${chronicle_jwt}")"
    logins="$(echo "$report" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("signupConversion",{}).get("logins",0))' 2>/dev/null || echo 0)"
    if [[ "$logins" -gt 0 ]]; then
      found=1
      break
    fi
    sleep 1
  done

  if [[ "$found" == "1" ]]; then
    pass "chronicle analytics (real lookout->RabbitMQ->ClickHouse->report chain, logins=$logins)"
  else
    fail "chronicle analytics -- event ingested (202) but never appeared in the auth-funnel report"
  fi
fi

##############################################################################
log "golden path complete: ${PASS} passed, ${FAIL} failed"
##############################################################################
[[ "$FAIL" -eq 0 ]] || exit 1
