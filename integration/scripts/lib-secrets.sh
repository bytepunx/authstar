#!/usr/bin/env bash
# Generated alongside secrets/authstar/**/*.yaml from one source (see
# scripts/README-generation-note if present, or the repo README's
# "regenerating placeholder secrets" section) — the values here are
# byte-identical to those committed files' plaintext `value:` fields.
# Sourced by scripts/provision.sh only.
#
# Values live here (not re-parsed from secrets/*.yaml at provision time)
# because after a real `signet secret set` run those files become genuine
# SOPS ciphertext, and signet's threat model deliberately never exposes the
# age private key to CLI users to decrypt them back server-side-only
# decryption is the whole point. This file is the durable plaintext source
# of record instead.
#
# Plain indexed variables + bash indirect expansion (${!varname}), not an
# associative array — associative arrays need bash 4+, and macOS ships
# bash 3.2 as /bin/bash. Uses plain (not read -r) assignment so multi-line
# PEM/JSON values keep their embedded newlines.
#
# The five rabbitmqUrl values below are NOT a stable dev placeholder like
# everything else in this file — they're this specific cluster's real,
# randomly-generated broker credential (kluster-lib/addon/rabbitmq.go seeds
# auth.username/auth.password from a real signet-issued credential, not
# guest/guest, per its own doc comment — confirmed for real: guest/guest
# gets ACCESS_REFUSED from a live broker). Read the actual values from the
# live cluster before every fresh `kluster up` + provision.sh run:
#   kubectl get statefulset rabbitmq -n rabbitmq \
#     -o jsonpath='{.spec.template.spec.containers[0].env}' \
#     | jq -r '.[] | select(.name=="RABBITMQ_USERNAME") | .value'
#   kubectl get secret rabbitmq -n rabbitmq \
#     -o jsonpath='{.data.rabbitmq-password}' | base64 -d
# This is a real, unfixed gap: ADR 0012's rabbitmq-provisioner Job already
# creates least-privilege per-service credentials (tower-rabbitmq-credentials
# / keep-rabbitmq-credentials K8s Secrets, pushed to signet under
# <service>/<service>/rabbitmq-username|password) — but tower/keep/herald's
# own server.ts only ever reads a single bundle.rabbitmqUrl value, with no
# code path that assembles one from separate username/password fields. Until
# that's wired up, every service shares the one broker-bootstrap credential
# above, not its own least-privilege one.

# service/name pairs this repo currently provisions placeholder secrets
# for. scripts/provision.sh iterates this list (rather than globbing
# secrets/authstar/*/*.yaml) so the list is correct even before any file
# in that tree has been created.
SECRET_ENTRIES=(
  "tower/dbConnectionString"
  "tower/rabbitmqUrl"
  "tower/signetAdminToken"
  "tower/contactHashPepper"
  "tower/operatorToken"
  "tower/default-provider-client-secret"
  "tower/tenant-acme-contact-hash-pepper"
  "keep/dbConnectionString"
  "keep/rabbitmqUrl"
  "keep/signetAdminToken"
  "keep/stripe-secret-key-acme"
  "keep/stripe-webhook-secret-acme"
  "herald/dbConnectionString"
  "herald/rabbitmqUrl"
  "herald/signetAdminToken"
  "herald/operatorToken"
  "herald/payloadKeyGenerations"
  "herald/unsubscribeKeyGenerations"
  "lookout/rabbitmqUrl"
  "chronicle/clickhousePassword"
  "chronicle/rabbitmqUrl"
  "chronicle/internalJwtSecret"
  "portcullis/tenant-acme-session-key"
  "portcullis/tenant-acme-internal-key"
  "portcullis/tenant-acme-identity-hash-key-1"
  "portcullis/tenant-acme-provider-dex-client-secret"
)

SECRET_VALUE__tower__dbConnectionString='postgres://postgres:postgres@postgresql.postgres.svc.cluster.local:5432/tower?sslmode=disable'
# rabbitmq-provisioner-bootstrap (kluster's authstar profile, ADR 0008/0012)
# generates a fresh random password for the "tower" RabbitMQ user on every
# `kluster up`, then pushes it to signet at secrets/tower/tower/rabbitmq-
# {username,password}.yaml -- a different namespace/service scope AND a
# split username/password shape than the single authstar/tower/rabbitmqUrl
# connection string tower's own server.ts actually reads (bundle.rabbitmqUrl
# ?? secrets.rabbitmqUrl). Confirmed real: images/rabbitmq-provisioner's own
# src/index.js hardcodes `pushServiceSecret(gitops, service, service, ...)`
# (namespace=service, not the shared "authstar" namespace every other
# secret uses) -- a genuine cross-repo gap in kickr, not something fixed
# here. Until that's fixed upstream, this value must be hand-copied from
# `kubectl get secret <service>-rabbitmq-credentials -n rabbitmq -o
# jsonpath='{.data.username}{"\n"}{.data.password}' | base64 -d` after
# every fresh cluster (same manual fixup this repo's own git history shows
# happening repeatedly -- "chore: update RabbitMQ credential for the fresh
# authstar-integration cluster instance"). Vhost is "/authstar", not the
# default "/" -- kluster-lib/addon/rabbitmq.go's RabbitMQVhost constant.
SECRET_VALUE__tower__rabbitmqUrl='amqp://tower:7f2404f31f79db28f89d2feb3a175af5e52c80699ce083cd@rabbitmq.rabbitmq.svc.cluster.local:5672/authstar'
SECRET_VALUE__tower__signetAdminToken='dev-placeholder-4KApxqBOTcqSxG3u2jysc4UwSxvp03apRnHHf6OAFu8'
SECRET_VALUE__tower__contactHashPepper='dev-placeholder-1f6ReyqGSS-jXOr8w_yt-Uftij6Sf6WzJy67c8Zsw4I'
SECRET_VALUE__tower__operatorToken='dev-placeholder-nWvzdBisvYWVX4ZqZ4iE3k7jC-dmh5nbrU_9DcI536A'
SECRET_VALUE__tower__default_provider_client_secret='authstar-dev-secret'
SECRET_VALUE__tower__tenant_acme_contact_hash_pepper='dev-placeholder-7Js3wLrnMyiFnQJcX0Bwqkcxcwl5v7IyPut6L303ATw'
SECRET_VALUE__keep__dbConnectionString='postgres://postgres:postgres@postgresql.postgres.svc.cluster.local:5432/keep?sslmode=disable'
# See tower__rabbitmqUrl's own comment above -- same fresh-per-cluster
# credential, same manual-copy caveat, same "/authstar" vhost.
SECRET_VALUE__keep__rabbitmqUrl='amqp://keep:6af43b1da5f19fe9afc943d330d664353fe14de0b8773cfa@rabbitmq.rabbitmq.svc.cluster.local:5672/authstar'
SECRET_VALUE__keep__signetAdminToken='dev-placeholder-wpFlp6pZEAmPfmDyQt-JJriEpTT-nHySI6QquFUer10'
SECRET_VALUE__keep__stripe_secret_key_acme='sk_test_51PlaceholderAcmeDevKeyDoNotUseInProd00000000'
SECRET_VALUE__keep__stripe_webhook_secret_acme='whsec_PlaceholderAcmeDevWebhookSigningSecret0000'
SECRET_VALUE__herald__dbConnectionString='postgres://postgres:postgres@postgresql.postgres.svc.cluster.local:5432/herald?sslmode=disable'
# herald isn't in rabbitmqTargetServices ("today: tower, keep" per ADR
# 0008/0012 -- kluster-lib/profile/authstar.go), so it gets no dedicated
# least-privilege user from rabbitmq-provisioner-bootstrap. guest/guest
# does NOT work here -- confirmed live (ACCESS_REFUSED, "Login was refused
# using authentication mechanism PLAIN"): this chart's guest user is not
# usable for a real remote login, matching this repo's own git history of
# hitting exactly this ("why guest/guest 403s ... against a real broker").
# Reuses tower's own dedicated user instead, same as lookout/chronicle's
# manifests (see their own comments) -- tower's Permission resource is a
# fully-permissive dev-only wildcard, so this is safe for a disposable dev
# cluster. Must target the "/authstar" vhost, not the default "/" --
# tower/keep publish onto "/authstar", and RabbitMQ vhosts are fully
# isolated namespaces, so a herald connected to "/" would never see any of
# their messages.
SECRET_VALUE__herald__rabbitmqUrl='amqp://tower:7f2404f31f79db28f89d2feb3a175af5e52c80699ce083cd@rabbitmq.rabbitmq.svc.cluster.local:5672/authstar'
SECRET_VALUE__herald__payloadKeyGenerations='[{"version": 1, "publicKeyPem": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsD5ljGxKNJM5Zs6gz+5g\nwKm7LNdk8T5iUny4YH06VUnt09Rx/28HbDl/3IXxqckh6KLuHjxfv02t25SfsaLh\nGrFERK8/QCyes98fK6h0+lJp5AQR98BgBkoTgrEwJM+QJYQjKtqZ5H24DkMpvy1c\nyc5op78LyG51gNqIZvbZ84aqcA68Iyv5D3GhX5k6J7xaAfoCkbh8RMh8V1SfTFHF\n8OV2FSGgIT2EaRhm1njNttkSiIPu5C7t9DqAVE1AEJNmeqFqK1voPMWKcU17mTIp\neUBI+HgT2exbGeClccJZamXo5YSiecmiflpG3aofDBDOuySiyjGHPYQJ8aU4uW74\n4wIDAQAB\n-----END PUBLIC KEY-----\n", "privateKeyPem": "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAsD5ljGxKNJM5Zs6gz+5gwKm7LNdk8T5iUny4YH06VUnt09Rx\n/28HbDl/3IXxqckh6KLuHjxfv02t25SfsaLhGrFERK8/QCyes98fK6h0+lJp5AQR\n98BgBkoTgrEwJM+QJYQjKtqZ5H24DkMpvy1cyc5op78LyG51gNqIZvbZ84aqcA68\nIyv5D3GhX5k6J7xaAfoCkbh8RMh8V1SfTFHF8OV2FSGgIT2EaRhm1njNttkSiIPu\n5C7t9DqAVE1AEJNmeqFqK1voPMWKcU17mTIpeUBI+HgT2exbGeClccJZamXo5YSi\necmiflpG3aofDBDOuySiyjGHPYQJ8aU4uW744wIDAQABAoIBACdiOiUQCeEHyTr9\nD5iHh11mUGpr06XJMAWI01bUhRWMCLZecf8Hm5wGmVj5IZC0Xnxy9E0TZr4EKMa5\nxpnWcQEa/ctvce3wSqKdSITkBwftJLaMZkt71LlzEjsRR1XigC6yAX3RDbSul1Ow\nlIKhK2v5UQ+zNHncnStnKjYAEaJGZX3hQ1t8Ol7tP54wqbeYzwFmvegihpmgYD/h\nhYcHjJvDRKwmbIhqgrF27AmDfaD17FZFLoDaFwNS+FDMNXgAGKKckM4NFyZXsLkc\nDYVrfIknF1V5HjcqCkpCG5H5x8e/6+rgn5pkUoYY74X5iODreC/o7/pexbV9w6d7\nXRSr42ECgYEA380nKHJJFJHKrW3xnIcTdEwS4YXiI/SwQWEC7mdXJjN2kc/dfZ+C\nvTqo14VTaeASNjEar70tcbg7zHIdKeqSDMDQEMSWz2ogoGmYPRCksrkiWj9wYs7X\ngQUeHToqx6CI8e2ghwHKi7Ib2+pDbE/+/GtG071zWTMuidBoh/YlEXECgYEAyZmk\n8AbTuNtsa0rRNAGzmiyZVggJVv/KThTKmHb5RE/rupcOG8eUlN+SMnibhRQogDdu\nMpVZWA9rmBx+QQqn9lZrvvyPnvoimM1lu4b6rpbMwz0+YCgco+MA+ZfnHAOWqhxU\nAhq9byvV/yailqc6GCykLY+Nh9UZFfedslpaxZMCgYBkd0gY1BUSctA1QqGvzsNg\n9bWUH/IAihuFffM+6o0ozPlxQ4r+ldiu8eJRvbxQTxJd2XVNZvM7laTihmepJXAi\n4XuFy3qX6eBzonOBFjOZN5rAQLJG6Ou9M3rtS+tgaiSP1ki10owGYhI3itZxjQe+\ncLn+25Eofd1qaHBEeK7zQQKBgQCzKCCE0nxbHlyWaNHLtutmStYlt1SdhQnDJAT7\nQ1e31pJ1qoH2PAIV3y1sPvRuaoCnmRsMRt80O9fxQPkOUir75scv3gDAVihixL3w\nzj5+4zKrGwUQrPTuy/B03wKaSbIeELizehH49urhKfN5kLk2/I0WlClBmiYF+Jyj\nAFsEkwKBgQCdXJPj9bpKaxGUm5FxTAbsDs1Dxsn3h2Vkj/1Hf8XzAJzOtlL5D6Rk\n8NPAJF48iw2q+25Kd7uZlR/u+3/tZjFqQh8ZNBvcm7q6pubdCspWNMm6nIDz1n1a\nsCx+HU08lEfE7J1uO0eRXYGIQdhgB8az+dW+VbhaTvxmXU3qxqc8fA==\n-----END RSA PRIVATE KEY-----\n"}]'
SECRET_VALUE__herald__unsubscribeKeyGenerations='[{"version": 1, "keyBase64": "Wln1OJMuBKisj/rhjw7+4Q2zo8e7Q10xI52bM4ijGPw="}]'
# herald/src/routes/operator-rotate-keys.ts gates POST /operator/rotate-keys
# on secrets.operatorToken (isOperatorRequest) -- never provisioned in this
# repo at all (only tower's own operatorToken existed), a real gap this run
# found: without this, herald has real payload-encryption key material of
# its own (payloadKeyGenerations above) but no way to ever announce its
# public half to tower via signet, so tower falls back to a fresh ephemeral
# key on every boot that herald can never decrypt -- see server.ts's own
# "no signet-sourced herald payload-encryption public key configured yet"
# log line, and its consequence: comms-consumer.ts's blanket
# nack(msg, false, true) on ANY ingestCommunication error (not just
# transient ones) turned that permanent decryption failure into an
# infinite tight redelivery loop (herald.comms hit 700k+ redeliveries in
# minutes -- confirmed live via the RabbitMQ management API) until this was
# fixed and POST /operator/rotate-keys was actually called once.
SECRET_VALUE__herald__operatorToken='dev-placeholder-LKL0D3M7tKg2ZpRXgB3c29lviezj-cRFBUTSYEWJV7w'
# herald/src/server.ts gained its own createSignetAdmin wiring (ADR 0025,
# for pushing herald's payload-encryption public key to signet) after this
# repo's manifests/secrets were first authored -- never previously
# provisioned, a real gap this run found (herald crashed on startup:
# "missing required environment variable SIGNET_ADMIN_TOKEN"). Same
# dev-placeholder shape as tower/keep's own signetAdminToken -- never
# cryptographically validated at plain startup, only exercised lazily by
# herald's own POST /operator/rotate-keys route.
SECRET_VALUE__herald__signetAdminToken='dev-placeholder-NI5l4rFr-pD3atJJnVuTQBLLArPmMWjv1rb9Rn17hLg'
SECRET_VALUE__lookout__rabbitmqUrl='amqp://rmq-e723a8343b2dd491:c68cd68864a92438478140b78988be85c7ba571a@rabbitmq.rabbitmq.svc.cluster.local:5672/'
SECRET_VALUE__chronicle__clickhousePassword='clickhouse'
SECRET_VALUE__chronicle__rabbitmqUrl='amqp://rmq-e723a8343b2dd491:c68cd68864a92438478140b78988be85c7ba571a@rabbitmq.rabbitmq.svc.cluster.local:5672/'
SECRET_VALUE__chronicle__internalJwtSecret='8a900dc6787a1a88b320691ab42efecf20078e542c6c8e9aa1db5794e7ce18e4'
SECRET_VALUE__portcullis__tenant_acme_session_key='-----BEGIN EC PRIVATE KEY-----
MHcCAQEEICPtVZCzAstGsDJCz6C/uWD9TKa4hCSvMIrst/IyizW+oAoGCCqGSM49
AwEHoUQDQgAEfCWfmH+EVU4g/glZdLuOW+ETjP6jtvs7JMGFrPDMAT427mRZClza
ogSawgyBTOXxjo0BbGTmHQc/rJuLkQV/Ow==
-----END EC PRIVATE KEY-----'
SECRET_VALUE__portcullis__tenant_acme_internal_key='-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIO77VY/8Hh9nOuOSBgdidh0t92eokYaI4amZNM9YG1DooAoGCCqGSM49
AwEHoUQDQgAEblgFtkLLvfvpDP/MyEIuRYBU90CKoTVUHnrXv8K7jP6Ei6Ywb6iM
0B4EBQJ802IYk3lOR54IrlRLeS1KyfGqNg==
-----END EC PRIVATE KEY-----'
SECRET_VALUE__portcullis__tenant_acme_identity_hash_key_1='dev-placeholder-5I4jwdzEOyLx-C4WG2Km7U3Y9lxyhWuc_qFGGdHeUYM'
SECRET_VALUE__portcullis__tenant_acme_provider_dex_client_secret='authstar-dev-secret'
