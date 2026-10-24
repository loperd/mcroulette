# Releases

## Procedure

The release helper is `scripts/release.mjs`. Release notes live at `docs/releases/<version>.md`; package and lockfile versions must match the intended release.

```sh
node scripts/release.mjs
```

Before invoking the helper, isolate unrelated work and explicitly stage only the intended release changes. Review both the staged diff and all unpublished commits since the last release tag: those commits will be squashed into the release too. The helper refuses unstaged changes or untracked files outside ignored paths; it never stages files automatically. It also refuses changes to HEAD or the staged source tree during validation. Do not stage unrelated work merely to satisfy this guard.

The helper validates branch/base/tag state and runs dependency installation, tests, production build, Go checks, Helm validation, migration-job regression tests, production model decoding and the mobile browser probe before publication. Read the script for the exact commands and required tools.

After checks, it prepares one release commit using the version's release notes as its message, creates the tag, pushes, waits for the deployment workflow and creates a GitHub release. The notes must start with `# <version>` and contain a release description. The squash helper protects published history, creates a backup branch before collapsing unpublished commits and preserves staged work if commit creation fails. Do not bypass failed checks or overwrite an existing release tag.

CI deployment behavior is defined in `.github/workflows/deploy.yml`. Cluster identities, Vault values and frontend/API hosts are documented in [bootstrap](../../deploy/bootstrap/README.md) and the [Helm chart](../../deploy/helm/voxel-vault/README.md).

## Recovery

A failure after push may leave a published commit/tag even if deployment or GitHub release creation failed. Inspect remote tags, GitHub Actions and production before rerunning the helper. Do not infer deployment success from tag creation, a local version number or an old test report.

If release history was changed externally, reconcile local and remote state before invoking the helper. It is not a mechanism to repeat a force push or recreate an existing tag.

## Acceptance and evidence

A release needs passing checks for the intended source revision, a successful API/frontend deployment and a production smoke check. Fresh installation, container build, database checks and real-device validation have distinct scopes; record which actually ran. Keep generated logs and browser evidence in `artifacts/`, with English report text.

