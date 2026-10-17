#!/usr/bin/env bash
# Генерация kubeconfig для CI-деплоя voxel-vault из ServiceAccount, заведённого
# deploy/bootstrap/deploy-rbac.yaml. Выводит base64 — значение GitHub-секрета
# KUBECONFIG_B64 (GitHub → Settings → Secrets and variables → Actions).
#
#   kubectl apply -f deploy/bootstrap/deploy-rbac.yaml
#   ./deploy/bootstrap/make-kubeconfig.sh [--raw]
#
# Требует прав на чтение секрета SA в namespace (запускает кластер-админ).
# API-сервер берётся из ТЕКУЩЕГО контекста kubectl — убедись, что контекст тот.
#
# ВНИМАНИЕ: вывод — это учётные данные. Не коммить, не класть в логи CI.
set -euo pipefail

NS="${NS:-voxel-vault}"
SA="${SA:-voxel-vault-deployer}"
SECRET="${SECRET:-${SA}-token}"

need() { command -v "$1" >/dev/null || { echo "нужен $1" >&2; exit 1; }; }
need kubectl
need base64

# Токен наполняется контроллером асинхронно — подождём.
for i in $(seq 1 30); do
  TOKEN_B64="$(kubectl -n "$NS" get secret "$SECRET" -o jsonpath='{.data.token}' 2>/dev/null || true)"
  [ -n "${TOKEN_B64:-}" ] && break
  [ "$i" = 1 ] && echo "жду выпуск токена для $NS/$SECRET…" >&2
  sleep 1
done
[ -n "${TOKEN_B64:-}" ] || {
  echo "токен не выпущен: секрет $NS/$SECRET пуст. Применён ли deploy-rbac.yaml?" >&2
  exit 1
}

TOKEN="$(printf %s "$TOKEN_B64" | base64 -d)"
CA_B64="$(kubectl -n "$NS" get secret "$SECRET" -o jsonpath='{.data.ca\.crt}')"
# Адрес API. По умолчанию — из текущего контекста, но у k3s там 127.0.0.1, что для
# CI бесполезно: раннеру нужен публично достижимый адрес (он есть в SAN серта).
#   SERVER=https://51.83.4.43:6443 ./deploy/bootstrap/make-kubeconfig.sh
SERVER="${SERVER:-$(kubectl config view --minify --raw -o jsonpath='{.clusters[0].cluster.server}')}"
[ -n "$SERVER" ] || { echo "не смог определить API-сервер из текущего контекста" >&2; exit 1; }

KUBECONFIG_YAML=$(cat <<EOF
apiVersion: v1
kind: Config
clusters:
  - name: voxel-vault
    cluster:
      server: ${SERVER}
      certificate-authority-data: ${CA_B64}
contexts:
  - name: voxel-vault
    context:
      cluster: voxel-vault
      namespace: ${NS}
      user: ${SA}
current-context: voxel-vault
users:
  - name: ${SA}
    user:
      token: ${TOKEN}
EOF
)

if [ "${1:-}" = "--raw" ]; then
  printf '%s\n' "$KUBECONFIG_YAML"
  exit 0
fi

echo "# API-сервер: ${SERVER}" >&2
echo "# Проверка прав (должно быть yes):" >&2
printf '#   deployments: %s\n' "$(kubectl auth can-i create deployments \
  --as="system:serviceaccount:${NS}:${SA}" -n "$NS" 2>/dev/null || echo '?')" >&2
printf '#   jobs:        %s\n' "$(kubectl auth can-i create jobs \
  --as="system:serviceaccount:${NS}:${SA}" -n "$NS" 2>/dev/null || echo '?')" >&2
echo "# Ниже — значение для GitHub-секрета KUBECONFIG_B64 :" >&2

printf '%s' "$KUBECONFIG_YAML" | base64 -w0 2>/dev/null || printf '%s' "$KUBECONFIG_YAML" | base64
echo
