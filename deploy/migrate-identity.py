"""Run explicit, forward-only context migrations before deploying their runtime."""
import argparse
import json
import subprocess
import sys

SECRET = 'voxel-vault-secrets'
STEPS = [('security', '/security-migrate', 'SECURITY_DATABASE_URL'),
         ('identity', '/identity-migrate', 'IDENTITY_DATABASE_URL')]


def migration_key(variable):
    return variable.replace('_DATABASE_URL', '_MIGRATION_DATABASE_URL')


def kubectl(namespace, *args, capture=True):
    return subprocess.run(['kubectl', '-n', namespace, *args], capture_output=capture, text=True)


def report(namespace, name):
    """What the cluster knows about the job: its pods, their state and events. Never secret values."""
    print(f'--- job/{name}', flush=True)
    kubectl(namespace, 'describe', 'job', name, capture=False)
    print(f'--- pods of job/{name}', flush=True)
    kubectl(namespace, 'describe', 'pod', '-l', 'job-name=' + name, capture=False)
    print('--- logs', flush=True)
    kubectl(namespace, 'logs', 'job/' + name, '--all-containers=true', capture=False)
    print('--- events', flush=True)
    events = kubectl(namespace, 'get', 'events', '--sort-by=.lastTimestamp', '-o',
                     'custom-columns=TIME:.lastTimestamp,OBJECT:.involvedObject.name,REASON:.reason,MESSAGE:.message')
    print('\n'.join(line for line in events.stdout.splitlines()
                    if line.startswith('TIME') or name in line), flush=True)


def require_secret_keys(namespace):
    """The pods read their URLs from the Secret; a missing key leaves them unstartable and silent."""
    result = kubectl(namespace, 'get', 'secret', SECRET, '-o', 'json')
    if result.returncode != 0:
        sys.exit(f'Secret {SECRET} is not readable: {result.stderr.strip()}')
    present = set(json.loads(result.stdout).get('data', {}))
    missing = [migration_key(variable) for _, _, variable in STEPS if migration_key(variable) not in present]
    if missing:
        sys.exit(f'Secret {SECRET} lacks {", ".join(missing)}: add them to Vault (secret/prod/voxel-vault), '
                 'see deploy/helm/voxel-vault/README.md.')


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
                    'name': SECRET, 'key': migration_key(variable)}}}],
                'securityContext': {'runAsNonRoot': True, 'runAsUser': 65532, 'runAsGroup': 65532,
                                    'allowPrivilegeEscalation': False,
                                    'readOnlyRootFilesystem': True, 'capabilities': {'drop': ['ALL']}}}
    job = {'apiVersion': 'batch/v1', 'kind': 'Job',
           'metadata': {'name': name, 'namespace': args.namespace},
           'spec': {'backoffLimit': 0, 'activeDeadlineSeconds': 180, 'ttlSecondsAfterFinished': 86400,
                    'template': {'spec': {'restartPolicy': 'Never', 'automountServiceAccountToken': False,
                        'imagePullSecrets': [{'name': 'ghcr-pull'}],
                        'initContainers': [container(*STEPS[0])],
                        'containers': [container(*STEPS[1])]}}}}
    result = kubectl(args.namespace, 'get', 'job', name, '-o', 'json')
    if result.returncode == 0:
        status = json.loads(result.stdout).get('status', {})
        if status.get('succeeded') == 1:
            print('Context migrations already completed for this release.')
            return
        if not status.get('failed'):
            report(args.namespace, name)
            sys.exit('A migration job for this release is still running; inspect it before retrying.')
        # A failed job ran forward-only migrations at most partly; each applied version is recorded,
        # so a new job continues from there. Keep what the failed one left in the deploy log.
        print('A previous migration job failed:', flush=True)
        report(args.namespace, name)
        kubectl(args.namespace, 'delete', 'job', name, '--wait=true', capture=False)
    require_secret_keys(args.namespace)
    subprocess.run(['kubectl', 'create', '-f', '-'], input=json.dumps(job), text=True, check=True)
    waited = kubectl(args.namespace, 'wait', '--for=condition=complete', 'job/' + name, '--timeout=180s',
                     capture=False)
    if waited.returncode != 0:
        report(args.namespace, name)
        sys.exit(f'Migration job {name} did not complete.')
    kubectl(args.namespace, 'logs', 'job/' + name, '--all-containers=true', capture=False)


if __name__ == '__main__':
    main()
