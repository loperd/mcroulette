#!/usr/bin/env bash
# The cluster's pull credentials for ghcr.io/loperd/mcroulette-api (a private package).
# A GitHub token with read:packages, from GHCR_TOKEN or the Keychain item "ghcr-read-packages".
#   KUBE_CONTEXT=<vps> ./deploy/bootstrap/ghcr-pull-secret.sh
set -euo pipefail
CONTEXT=${KUBE_CONTEXT:?set KUBE_CONTEXT to the VPS cluster context}
USERNAME=${GHCR_USER:-loperd}
GHCR_TOKEN=${GHCR_TOKEN:-$(security find-generic-password -a "$USER" -s ghcr-read-packages -w 2>/dev/null || true)}
: "${GHCR_TOKEN:?no token (GHCR_TOKEN or Keychain item ghcr-read-packages)}"
# The config goes through stdin: the token is never a command argument.
GHCR_USER=$USERNAME GHCR_TOKEN=$GHCR_TOKEN python3 -c 'import base64, json, os
user, token = os.environ["GHCR_USER"], os.environ["GHCR_TOKEN"]
auth = base64.b64encode((user + ":" + token).encode()).decode()
print(json.dumps({"auths": {"ghcr.io": {"auth": auth}}}))' \
  | kubectl --context "$CONTEXT" -n voxel-vault create secret generic ghcr-pull --type=kubernetes.io/dockerconfigjson \
      --from-file=.dockerconfigjson=/dev/stdin --dry-run=client -o yaml \
  | kubectl --context "$CONTEXT" -n voxel-vault apply -f -
echo "✓ ghcr-pull in voxel-vault"
