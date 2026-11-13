#!/usr/bin/env sh
# Make the harness's TLS material for the in-pod TLS front (S-0017, I-0007):
# a self-signed harness CA and a leaf cert it signs for the tenant hosts
# services fetch their JWKS from, https://authstar.<domain>/.well-known/jwks.json.
#   harness-tls.sh <dir>
# Writes ca.crt, ca.key, tls.crt, and tls.key into <dir>, which the deploys
# load as Secret authstar-tls (ca.crt, tls.crt, tls.key). A CA already in <dir>
# is kept, and so is a leaf it signed for the same hosts, so running it again
# changes nothing. Point <dir> outside the checkout, or at a git-ignored
# folder such as flai's kluster state: the keys never belong in the repository.
# HARNESS_TLS_HOSTS (default authstar.acme.authstar.app) is the leaf's DNS
# names, separated by spaces. HARNESS_TLS_DAYS (default 825) is the leaf's
# lifetime; the CA's is ten years.
set -eu

harness_tls_log() {
  printf '%s\n' "$*" >&2
}

harness_tls_die() {
  printf '%s: %s\n' "${0##*/}" "$*" >&2
  exit 1
}

if [ "$#" -ne 1 ] || [ -z "$1" ]; then
  harness_tls_die "usage: harness-tls.sh <dir>; name the directory to write the CA and cert into"
fi
command -v openssl >/dev/null 2>&1 || harness_tls_die "openssl is not on PATH; install it and run again"

dir="$1"
hosts="${HARNESS_TLS_HOSTS:-authstar.acme.authstar.app}"
days="${HARNESS_TLS_DAYS:-825}"
[ -n "$hosts" ] || harness_tls_die "HARNESS_TLS_HOSTS is empty; give the leaf at least one DNS name"

mkdir -p "$dir"
umask 077

if [ -s "$dir/ca.crt" ] && [ -s "$dir/ca.key" ]; then
  harness_tls_log "harness CA in $dir kept"
else
  openssl req -x509 -new -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
    -keyout "$dir/ca.key" -out "$dir/ca.crt" -days 3650 \
    -subj "/CN=authstar integration harness CA" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -addext "subjectKeyIdentifier=hash" \
    || harness_tls_die "openssl could not make the harness CA in $dir; it needs OpenSSL 1.1.1 or later"
  # A new CA invalidates any leaf the old one signed.
  rm -f "$dir/tls.crt" "$dir/tls.key" "$dir/hosts"
  harness_tls_log "harness CA made in $dir"
fi

san=""
for host in $hosts; do
  san="${san:+$san,}DNS:$host"
done

if [ -s "$dir/tls.crt" ] && [ -s "$dir/tls.key" ] && [ -s "$dir/hosts" ] \
  && [ "$(cat "$dir/hosts")" = "$san" ]; then
  harness_tls_log "leaf cert for $san in $dir kept"
  exit 0
fi

first_host="${san%%,*}"
first_host="${first_host#DNS:}"
openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
  -keyout "$dir/tls.key" -out "$dir/tls.csr" -subj "/CN=$first_host" \
  || harness_tls_die "openssl could not make the leaf key and request in $dir"
printf '%s\n' \
  "basicConstraints=critical,CA:FALSE" \
  "keyUsage=critical,digitalSignature" \
  "extendedKeyUsage=serverAuth" \
  "subjectAltName=$san" \
  "subjectKeyIdentifier=hash" \
  "authorityKeyIdentifier=keyid" > "$dir/tls.ext"
openssl x509 -req -in "$dir/tls.csr" -CA "$dir/ca.crt" -CAkey "$dir/ca.key" \
  -CAcreateserial -CAserial "$dir/ca.srl" -days "$days" -sha256 \
  -extfile "$dir/tls.ext" -out "$dir/tls.crt" \
  || harness_tls_die "openssl could not sign the leaf cert for $san with the CA in $dir"
rm -f "$dir/tls.csr" "$dir/tls.ext"
printf '%s\n' "$san" > "$dir/hosts"
harness_tls_log "leaf cert for $san made in $dir"
