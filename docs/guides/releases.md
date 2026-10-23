# Releases

## Procedure

The release helper is `scripts/release.mjs`. Release notes live at `docs/releases/<version>.md`; package and lockfile versions must match the intended release.

```sh
node scripts/release.mjs
```

The helper validates branch/base/tag state and runs dependency installation, tests, production build, Go checks, Helm validation, production model decoding and the mobile browser probe before publication. Read the script for the exact commands and required tools.

After checks, it prepares one release commit, creates the tag, pushes, waits for the deployment workflow and creates a GitHub release. The squash helper protects published history, creates a backup branch before collapsing unpublished commits and preserves staged work if commit creation fails. Do not bypass failed checks or overwrite an existing release tag.

CI deployment behavior is defined in `.github/workflows/deploy.yml`. Cluster identities, Vault values and frontend/API hosts are documented in [bootstrap](../../deploy/bootstrap/README.md) and the [Helm chart](../../deploy/helm/voxel-vault/README.md).

## Recovery

A failure after push may leave a published commit/tag even if deployment or GitHub release creation failed. Inspect remote tags, GitHub Actions and production before rerunning the helper. Do not infer deployment success from tag creation, a local version number or an old test report.

If release history was changed externally, reconcile local and remote state before invoking the helper. It is not a mechanism to repeat a force push or recreate an existing tag.

## Acceptance and evidence

A release needs passing checks for the intended source revision, a successful API/frontend deployment and a production smoke check. Fresh installation, container build, database checks and real-device validation have distinct scopes; record which actually ran. Keep generated logs and browser evidence in `artifacts/`, with English report text.

The 0.3.10 tag was reported pushed during the 2026-10-22 session. Successful deployment was not independently confirmed in that session. The [release notes](../releases/0.3.10.md) describe its contents, not its current deployment status. Check CI and production for authoritative status.
