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
SECRET_VALUE__tower__rabbitmqUrl='amqp://guest:guest@rabbitmq.rabbitmq.svc.cluster.local:5672/'
SECRET_VALUE__tower__signetAdminToken='dev-placeholder-4KApxqBOTcqSxG3u2jysc4UwSxvp03apRnHHf6OAFu8'
SECRET_VALUE__tower__contactHashPepper='dev-placeholder-1f6ReyqGSS-jXOr8w_yt-Uftij6Sf6WzJy67c8Zsw4I'
SECRET_VALUE__tower__operatorToken='dev-placeholder-nWvzdBisvYWVX4ZqZ4iE3k7jC-dmh5nbrU_9DcI536A'
SECRET_VALUE__tower__default_provider_client_secret='authstar-dev-secret'
SECRET_VALUE__tower__tenant_acme_contact_hash_pepper='dev-placeholder-7Js3wLrnMyiFnQJcX0Bwqkcxcwl5v7IyPut6L303ATw'
SECRET_VALUE__keep__dbConnectionString='postgres://postgres:postgres@postgresql.postgres.svc.cluster.local:5432/keep?sslmode=disable'
SECRET_VALUE__keep__rabbitmqUrl='amqp://guest:guest@rabbitmq.rabbitmq.svc.cluster.local:5672/'
SECRET_VALUE__keep__signetAdminToken='dev-placeholder-wpFlp6pZEAmPfmDyQt-JJriEpTT-nHySI6QquFUer10'
SECRET_VALUE__keep__stripe_secret_key_acme='sk_test_51PlaceholderAcmeDevKeyDoNotUseInProd00000000'
SECRET_VALUE__keep__stripe_webhook_secret_acme='whsec_PlaceholderAcmeDevWebhookSigningSecret0000'
SECRET_VALUE__herald__dbConnectionString='postgres://postgres:postgres@postgresql.postgres.svc.cluster.local:5432/herald?sslmode=disable'
SECRET_VALUE__herald__rabbitmqUrl='amqp://guest:guest@rabbitmq.rabbitmq.svc.cluster.local:5672/'
SECRET_VALUE__herald__payloadKeyGenerations='[{"version": 1, "publicKeyPem": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsD5ljGxKNJM5Zs6gz+5g\nwKm7LNdk8T5iUny4YH06VUnt09Rx/28HbDl/3IXxqckh6KLuHjxfv02t25SfsaLh\nGrFERK8/QCyes98fK6h0+lJp5AQR98BgBkoTgrEwJM+QJYQjKtqZ5H24DkMpvy1c\nyc5op78LyG51gNqIZvbZ84aqcA68Iyv5D3GhX5k6J7xaAfoCkbh8RMh8V1SfTFHF\n8OV2FSGgIT2EaRhm1njNttkSiIPu5C7t9DqAVE1AEJNmeqFqK1voPMWKcU17mTIp\neUBI+HgT2exbGeClccJZamXo5YSiecmiflpG3aofDBDOuySiyjGHPYQJ8aU4uW74\n4wIDAQAB\n-----END PUBLIC KEY-----\n", "privateKeyPem": "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAsD5ljGxKNJM5Zs6gz+5gwKm7LNdk8T5iUny4YH06VUnt09Rx\n/28HbDl/3IXxqckh6KLuHjxfv02t25SfsaLhGrFERK8/QCyes98fK6h0+lJp5AQR\n98BgBkoTgrEwJM+QJYQjKtqZ5H24DkMpvy1cyc5op78LyG51gNqIZvbZ84aqcA68\nIyv5D3GhX5k6J7xaAfoCkbh8RMh8V1SfTFHF8OV2FSGgIT2EaRhm1njNttkSiIPu\n5C7t9DqAVE1AEJNmeqFqK1voPMWKcU17mTIpeUBI+HgT2exbGeClccJZamXo5YSi\necmiflpG3aofDBDOuySiyjGHPYQJ8aU4uW744wIDAQABAoIBACdiOiUQCeEHyTr9\nD5iHh11mUGpr06XJMAWI01bUhRWMCLZecf8Hm5wGmVj5IZC0Xnxy9E0TZr4EKMa5\nxpnWcQEa/ctvce3wSqKdSITkBwftJLaMZkt71LlzEjsRR1XigC6yAX3RDbSul1Ow\nlIKhK2v5UQ+zNHncnStnKjYAEaJGZX3hQ1t8Ol7tP54wqbeYzwFmvegihpmgYD/h\nhYcHjJvDRKwmbIhqgrF27AmDfaD17FZFLoDaFwNS+FDMNXgAGKKckM4NFyZXsLkc\nDYVrfIknF1V5HjcqCkpCG5H5x8e/6+rgn5pkUoYY74X5iODreC/o7/pexbV9w6d7\nXRSr42ECgYEA380nKHJJFJHKrW3xnIcTdEwS4YXiI/SwQWEC7mdXJjN2kc/dfZ+C\nvTqo14VTaeASNjEar70tcbg7zHIdKeqSDMDQEMSWz2ogoGmYPRCksrkiWj9wYs7X\ngQUeHToqx6CI8e2ghwHKi7Ib2+pDbE/+/GtG071zWTMuidBoh/YlEXECgYEAyZmk\n8AbTuNtsa0rRNAGzmiyZVggJVv/KThTKmHb5RE/rupcOG8eUlN+SMnibhRQogDdu\nMpVZWA9rmBx+QQqn9lZrvvyPnvoimM1lu4b6rpbMwz0+YCgco+MA+ZfnHAOWqhxU\nAhq9byvV/yailqc6GCykLY+Nh9UZFfedslpaxZMCgYBkd0gY1BUSctA1QqGvzsNg\n9bWUH/IAihuFffM+6o0ozPlxQ4r+ldiu8eJRvbxQTxJd2XVNZvM7laTihmepJXAi\n4XuFy3qX6eBzonOBFjOZN5rAQLJG6Ou9M3rtS+tgaiSP1ki10owGYhI3itZxjQe+\ncLn+25Eofd1qaHBEeK7zQQKBgQCzKCCE0nxbHlyWaNHLtutmStYlt1SdhQnDJAT7\nQ1e31pJ1qoH2PAIV3y1sPvRuaoCnmRsMRt80O9fxQPkOUir75scv3gDAVihixL3w\nzj5+4zKrGwUQrPTuy/B03wKaSbIeELizehH49urhKfN5kLk2/I0WlClBmiYF+Jyj\nAFsEkwKBgQCdXJPj9bpKaxGUm5FxTAbsDs1Dxsn3h2Vkj/1Hf8XzAJzOtlL5D6Rk\n8NPAJF48iw2q+25Kd7uZlR/u+3/tZjFqQh8ZNBvcm7q6pubdCspWNMm6nIDz1n1a\nsCx+HU08lEfE7J1uO0eRXYGIQdhgB8az+dW+VbhaTvxmXU3qxqc8fA==\n-----END RSA PRIVATE KEY-----\n"}]'
SECRET_VALUE__herald__unsubscribeKeyGenerations='[{"version": 1, "keyBase64": "Wln1OJMuBKisj/rhjw7+4Q2zo8e7Q10xI52bM4ijGPw="}]'
SECRET_VALUE__lookout__rabbitmqUrl='amqp://guest:guest@rabbitmq.rabbitmq.svc.cluster.local:5672/'
SECRET_VALUE__chronicle__clickhousePassword='clickhouse'
SECRET_VALUE__chronicle__rabbitmqUrl='amqp://guest:guest@rabbitmq.rabbitmq.svc.cluster.local:5672/'
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
