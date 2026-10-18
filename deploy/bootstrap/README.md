# Bootstrap

One-time prerequisites that cannot live in the chart (the chart is deployed with them).

| What | How | Who | When |
|---|---|---|---|
| Local: Vault (dev) + VSO + KV, image, chart | `./deploy/bootstrap/up-local.sh` | you, on the Mac (OrbStack) | any time; idempotent |
| CI identity on the VPS cluster | `kubectl apply -f deploy/bootstrap/deploy-rbac.yaml` | cluster admin | once |
| `KUBECONFIG_B64` for GitHub Actions | `SERVER=https://<public API>:6443 ./deploy/bootstrap/make-kubeconfig.sh` | cluster admin | once + on token rotation |
| Prod secrets in Vault (`secret/prod/voxel-vault`) | `KUBE_CONTEXT=<vps> ./deploy/bootstrap/vault-prod.sh` | Vault admin | before the first deploy; again to change a secret |
| Image pull credentials (`ghcr-pull`) | `KUBE_CONTEXT=<vps> ./deploy/bootstrap/ghcr-pull-secret.sh` | project owner | once (skip if the package is public) |
| GitHub secrets | `KUBECONFIG_B64`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | project owner | once |
| DNS | `api-voxelvault.mono.place` → the cluster's ingress (proxied); `voxelvault.mono.place` is created by `wrangler deploy` (custom domain) | Cloudflare | once |
| Telegram | BotFather: trusted origin `https://voxelvault.mono.place`, redirect `https://voxelvault.mono.place/api/v1/auth/telegram/callback` | bot owner | once |

## Order for production

```sh
kubectl --context <vps> apply -f deploy/bootstrap/deploy-rbac.yaml
KUBE_CONTEXT=<vps> ./deploy/bootstrap/vault-prod.sh
KUBE_CONTEXT=<vps> ./deploy/bootstrap/ghcr-pull-secret.sh
SERVER=https://<public API>:6443 ./deploy/bootstrap/make-kubeconfig.sh   # → GitHub secret KUBECONFIG_B64
# release: git tag 0.3.0 && git push origin 0.3.0 → .github/workflows/deploy.yml: tests → API image + helm → frontend Worker
# (pushes to master and pull requests only run the checks)
```

Secrets never go through command arguments, values files or git: scripts read them from the
environment or the macOS Keychain (`security add-generic-password -a "$USER" -s <item> -w`) and pass
them on stdin. `vault-prod.sh` never installs or reconfigures the cluster's Vault; it only adds this
project's policy, role and `secret/prod/voxel-vault`.
