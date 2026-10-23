"""Run explicit, forward-only context migrations before deploying their runtime."""
import argparse
import json
import subprocess


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--image', required=True)
    p.add_argument('--release', required=True)
    p.add_argument('--namespace', default='voxel-vault')
    args = p.parse_args()
    name = 'identity-migrate-' + args.release.replace('.', '-')
    def container(name, command, variable):
        return {'name': name, 'image': args.image, 'command': [command],
                'env': [{'name': variable, 'valueFrom': {'secretKeyRef': {
                    'name': 'voxel-vault-secrets', 'key': variable.replace('_DATABASE_URL', '_MIGRATION_DATABASE_URL')}}}],
                'securityContext': {'runAsNonRoot': True, 'allowPrivilegeEscalation': False,
                                    'readOnlyRootFilesystem': True, 'capabilities': {'drop': ['ALL']}}}
    job = {'apiVersion': 'batch/v1', 'kind': 'Job',
           'metadata': {'name': name, 'namespace': args.namespace},
           'spec': {'backoffLimit': 0, 'activeDeadlineSeconds': 180, 'ttlSecondsAfterFinished': 86400,
                    'template': {'spec': {'restartPolicy': 'Never', 'automountServiceAccountToken': False,
                        'imagePullSecrets': [{'name': 'ghcr-pull'}],
                        'initContainers': [container('security', '/security-migrate', 'SECURITY_DATABASE_URL')],
                        'containers': [container('identity', '/identity-migrate', 'IDENTITY_DATABASE_URL')]}}}}
    result = subprocess.run(['kubectl', '-n', args.namespace, 'get', 'job', name, '-o', 'json'], capture_output=True)
    if result.returncode == 0:
        current = json.loads(result.stdout)
        if current.get('status', {}).get('succeeded') == 1:
            print('Context migrations already completed for this release.')
            return
        raise SystemExit('An incomplete migration job exists; inspect its logs before retrying.')
    subprocess.run(['kubectl', 'create', '-f', '-'], input=json.dumps(job).encode(), check=True)
    try:
        subprocess.run(['kubectl', '-n', args.namespace, 'wait', '--for=condition=complete',
                        'job/' + name, '--timeout=180s'], check=True)
    finally:
        subprocess.run(['kubectl', '-n', args.namespace, 'logs', 'job/' + name, '--all-containers=true'], check=False)


if __name__ == '__main__':
    main()
