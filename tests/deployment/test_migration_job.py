"""Regression coverage for Kubernetes admission of distroless migration images."""
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('migration_release', ROOT / 'deploy/migrate-identity.py')
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


class MigrationJobTest(unittest.TestCase):
    def test_every_migration_container_has_an_explicit_non_root_uid(self):
        created = []

        def run(command, **kwargs):
            if 'secret' in command and 'get' in command:
                return subprocess.CompletedProcess(command, 0, json.dumps({'data': {
                    'SECURITY_MIGRATION_DATABASE_URL': '', 'IDENTITY_MIGRATION_DATABASE_URL': ''}}), '')
            if 'get' in command and 'job' in command:
                return subprocess.CompletedProcess(command, 1, '', 'NotFound')
            if 'create' in command:
                created.append(json.loads(kwargs['input']))
            return subprocess.CompletedProcess(command, 0, '', '')

        with patch.object(migration.subprocess, 'run', side_effect=run), patch('sys.argv', [
                'migrate-identity.py', '--image', 'registry.example/api:release', '--release', '0.3.13']):
            migration.main()
        self.assertEqual(len(created), 1)
        pod = created[0]['spec']['template']['spec']
        self.assertFalse(pod['automountServiceAccountToken'])
        for container in pod['initContainers'] + pod['containers']:
            security = container['securityContext']
            self.assertTrue(security['runAsNonRoot'])
            self.assertIsInstance(security['runAsUser'], int)
            self.assertGreater(security['runAsUser'], 0)
            self.assertFalse(security['allowPrivilegeEscalation'])
            self.assertTrue(security['readOnlyRootFilesystem'])
