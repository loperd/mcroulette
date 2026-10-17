#!/usr/bin/env bash
# Everything up on OrbStack in one go: local Vault + VSO, the API image, the chart with
# values.local.yaml, then a check that the API answers through its Service.
#
#   ./deploy/bootstrap/up-local.sh           (Telegram secret: Keychain or TELEGRAM_CLIENT_SECRET, see vault-local.sh)
#
# Then: `npm run dev` and the Cloudflare tunnel https://vault.loper.me → http://localhost:5173.
set -euo pipefail
cd "$(dirname "$0")/../.."

CONTEXT=${KUBE_CONTEXT:-orbstack}
APP_NS=${APP_NAMESPACE:-voxel-vault}
RELEASE=${RELEASE:-voxel-vault}
FULLNAME=${FULLNAME:-$RELEASE-voxel-vault}
CHART=./deploy/helm/voxel-vault
k() { kubectl --context "$CONTEXT" "$@"; }

k get nodes >/dev/null || { echo "OrbStack Kubernetes is not reachable (context $CONTEXT)" >&2; exit 1; }
k create namespace "$APP_NS" --dry-run=client -o yaml | k apply -f - >/dev/null

echo "=== 1/4 Vault (secrets)"
KUBE_CONTEXT=$CONTEXT APP_NAMESPACE=$APP_NS RELEASE=$RELEASE FULLNAME=$FULLNAME ./deploy/bootstrap/vault-local.sh

echo "=== 2/4 API image"
docker build -t voxel-vault-api:local ./server

echo "=== 3/4 Chart"
# The old chart's own Postgres Secret is no longer rendered; Helm removes it on upgrade, the
# password lives on in Vault (vault-local.sh copied it).
helm upgrade --install "$RELEASE" "$CHART" -f "$CHART/values.local.yaml" \
  --kube-context "$CONTEXT" --namespace "$APP_NS" --wait --timeout 5m
# Same tag "local" for a fresh build: roll the pods so they run it.
k -n "$APP_NS" rollout restart "deployment/$FULLNAME" >/dev/null
k -n "$APP_NS" rollout status "deployment/$FULLNAME" --timeout=180s

echo "=== 4/4 Check"
k -n "$APP_NS" get vaultstaticsecret "$FULLNAME" -o jsonpath='{.status.conditions[*].type}{"\n"}' 2>/dev/null || true
k -n "$APP_NS" get pods
for path in /healthz /readyz /api/v1/auth/providers /api/v1/cases; do
  printf '%-26s ' "$path"
  k -n "$APP_NS" run "probe-$RANDOM" --rm -i --restart=Never --quiet --image=curlimages/curl:8.11.1 -- \
    curl -sS -m 5 -w ' [%{http_code}]\n' "http://$FULLNAME:8080$path" 2>/dev/null | tail -c 300 || echo "failed"
done
echo "✓ API is up. Frontend: npm run dev, tunnel https://vault.loper.me → http://localhost:5173"
