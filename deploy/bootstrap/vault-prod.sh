#!/usr/bin/env bash
# One-time production secrets on the VPS cluster's existing Vault (the one loncha uses).
# Never installs or reconfigures Vault: only this project's KV-v2 collection voxel-vault/, the
# read policy and Kubernetes-auth role voxel-vault-prod, and the secret env at voxel-vault/prod.
#
#   KUBE_CONTEXT=<vps> ./deploy/bootstrap/vault-prod.sh
#
# Inputs, never as command arguments:
#   Vault admin token     VAULT_TOKEN, or the Keychain item "vault-admin-vps"
#   Telegram secret       TELEGRAM_CLIENT_SECRET, or the Keychain item "voxel-vault-telegram"
# The Postgres password is kept if voxel-vault/prod already has one, generated otherwise.
set -euo pipefail

CONTEXT=${KUBE_CONTEXT:?set KUBE_CONTEXT to the VPS cluster context}
APP_NS=voxel-vault
FULLNAME=voxel-vault-voxel-vault
MOUNT=voxel-vault KV_PATH=prod ROLE=voxel-vault-prod

keychain() { security find-generic-password -a "$USER" -s "$1" -w 2>/dev/null || true; }
VAULT_TOKEN=${VAULT_TOKEN:-$(keychain vault-admin-vps)}
TELEGRAM_CLIENT_SECRET=${TELEGRAM_CLIENT_SECRET:-$(keychain voxel-vault-telegram)}
: "${VAULT_TOKEN:?no Vault admin token (VAULT_TOKEN or Keychain item vault-admin-vps)}"
: "${TELEGRAM_CLIENT_SECRET:?no Telegram secret (TELEGRAM_CLIENT_SECRET or Keychain item voxel-vault-telegram)}"

POD=$(kubectl --context "$CONTEXT" -n vault get pod -l app.kubernetes.io/name=vault -o jsonpath='{.items[0].metadata.name}')
# The token travels on stdin's first line; the rest of stdin is the command's own input.
vault() { { printf '%s\n' "$VAULT_TOKEN"; cat; } | kubectl --context "$CONTEXT" -n vault exec -i "$POD" -- \
  sh -c 'read -r VAULT_TOKEN; export VAULT_TOKEN VAULT_ADDR=${VAULT_ADDR:-http://127.0.0.1:8200}; exec vault "$@"' vault "$@"; }

vault status </dev/null | grep -q 'Sealed.*false' || { echo "✗ Vault on $CONTEXT is sealed or unreachable" >&2; exit 1; }

echo "→ KV-v2 collection $MOUNT/"
vault secrets list -format=json </dev/null | grep -q "\"$MOUNT/\"" || vault secrets enable -path="$MOUNT" -version=2 kv </dev/null

echo "→ policy and role $ROLE (SA $APP_NS/$FULLNAME)"
printf 'path "%s/data/%s" { capabilities = ["read"] }\n' "$MOUNT" "$KV_PATH" | vault policy write "$ROLE" -
vault write "auth/kubernetes/role/$ROLE" bound_service_account_names="$FULLNAME" \
  bound_service_account_namespaces="$APP_NS" policies="$ROLE" audience="" ttl=1h </dev/null >/dev/null

echo "→ $MOUNT/$KV_PATH"
POSTGRES_PASSWORD=$(vault kv get -mount="$MOUNT" -field=POSTGRES_PASSWORD "$KV_PATH" </dev/null 2>/dev/null || true)
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-$(openssl rand -hex 24)}
DATABASE_URL="postgres://voxel:$POSTGRES_PASSWORD@$FULLNAME-postgres:5432/voxel_vault?sslmode=disable"
TELEGRAM_CLIENT_SECRET=$TELEGRAM_CLIENT_SECRET POSTGRES_PASSWORD=$POSTGRES_PASSWORD DATABASE_URL=$DATABASE_URL \
  python3 -c 'import json, os; print(json.dumps({k: os.environ[k] for k in ("TELEGRAM_CLIENT_SECRET", "POSTGRES_PASSWORD", "DATABASE_URL")}))' \
  | vault kv put -mount="$MOUNT" "$KV_PATH" - >/dev/null
echo "✓ Vault ready for voxel-vault (prod)."
