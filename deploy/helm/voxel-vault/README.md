# Voxel Vault API

The Go API and (optionally) a single-node PostgreSQL. Same layout as loncha.

## Configuration is env — two stores, no `.env` files

| What | Where | Reaches the pod as |
|---|---|---|
| Non-secret config | `env:` in `values*.yaml`, UPPERCASE keys | ConfigMap `<fullname>-env` → `envFrom` |
| Secrets | HashiCorp Vault KV-v2 `secret/<env>/voxel-vault` (`secret/local/voxel-vault`, `secret/prod/voxel-vault`) | Vault Secrets Operator → Secret `voxel-vault-secrets` → `envFrom` |

Values files layer on `values.yaml`:

- `values.local.yaml` — OrbStack on this Mac, local Vault (dev mode), `https://vault.loper.me`.
- `values.prod.yaml` — VPS cluster, `https://voxelvault.mono.place` / `api-voxelvault.mono.place` (not deployed yet).

Secret keys (all env): `TELEGRAM_CLIENT_SECRET`, `DATABASE_URL`, `POSTGRES_PASSWORD` (bundled Postgres only).
VSO overwrites the Secret with the KV: fill the KV, the read policy and the Kubernetes-auth role
**before** an install with `secrets.source: vso`.

## Local (OrbStack)

```sh
security add-generic-password -a "$USER" -s voxel-vault-telegram -w   # once: the Telegram secret into the Keychain
./deploy/bootstrap/up-local.sh   # Vault + VSO + KV/policy/role, API image, chart (values.local.yaml), checks
npm run dev                                                 # behind the tunnel https://vault.loper.me → :5173
```

Vite proxies `/api` to the cluster Service (`VITE_API_TARGET`; OrbStack resolves `cluster.local` from
macOS) and accepts the tunnel host (`VITE_ALLOWED_HOSTS`). Dev Vault keeps the KV in memory: after
`vault-0` restarts, run the bootstrap again (it keeps the Postgres password from the synced Secret).

## Hosts

| | Development | Production |
|---|---|---|
| Frontend | `https://vault.loper.me` (Cloudflare tunnel → Vite `:5173`) | `https://voxelvault.mono.place` (Cloudflare) |
| API | Vite proxies `/api` to the cluster Service | `https://api-voxelvault.mono.place` (VPS cluster), behind the frontend's `/api/*` |

Passkeys (`WEBAUTHN_RP_ID`), the Telegram redirect and the session cookie belong to the frontend
origin. Telegram rejects `localhost`, hence the tunnel. BotFather: trusted origin = the frontend
origin, redirect URI = `TELEGRAM_REDIRECT_URL`.
