#!/usr/bin/env python3
"""Offline tests using real local bare Git; never SSH or GitHub."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import cloudflare_pages as cf

SHA = 'a' * 40
SPEC = importlib.util.find_spec('github_pages_branch')
pub = __import__('github_pages_branch') if SPEC else None


class PublisherTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=os.environ['TMPDIR'])
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.root = self.base / 'production'
        for locale in ('ru', 'en'):
            path = self.root / locale / 'phenom/index.html'
            path.parent.mkdir(parents=True)
            path.write_text(locale)
        self.manifest()
        self.remote = self.base / 'remote.git'
        self.git('init', '--bare', str(self.remote))
        self.key = self.base / 'key'
        self.key.write_text('offline fixture only')
        self.key.chmod(0o600)
        self.hosts = self.base / 'known_hosts'
        self.hosts.write_text('github.com ssh-ed25519 fixture\n')
        self.template = Path(__file__).resolve().parents[1] / 'ci/ru-pages.yml'
        self.calls = []

    def git(self, *args):
        result = subprocess.run(['git', *args], check=True, capture_output=True, text=True,
                                env=dict(os.environ, GIT_CONFIG_GLOBAL='/dev/null', GIT_CONFIG_NOSYSTEM='1'))
        return result.stdout.strip()

    def manifest(self, sha=SHA):
        (self.root / 'manifest.json').write_text(json.dumps(cf.manifest(self.root, sha)))

    def publish(self, sha=SHA, **overrides):
        self.assertIsNotNone(pub, 'trusted branch publisher is missing')
        def local(git, args):
            self.calls.append(args)
            if getattr(self, 'transport_hook', None):
                self.transport_hook(git, args)
            return git.run([str(self.remote) if arg == pub.REMOTE else arg for arg in args])
        args = dict(root=self.root, source_sha=sha, repository='ergohaven/projects-ru',
                    identity=self.key, known_hosts=self.hosts, workflow_template=self.template,
                    workdir=self.base / ('work-' + str(len(list(self.base.glob('work-*'))))))
        args.update(overrides)
        with patch.object(pub.Git, 'remote', local):
            return pub.publish(**args)

    def test_initial_branch_contains_only_ru_and_trusted_workflow(self):
        result = self.publish()
        self.assertFalse(result['reused'])
        self.assertEqual(result['status'], 'branch-published')
        self.assertFalse(result['pages_deployment_verified'])
        self.assertEqual(self.git('--git-dir=' + str(self.remote), 'show', 'gh-pages:site/phenom/index.html'), 'ru')
        files = self.git('--git-dir=' + str(self.remote), 'ls-tree', '-r', '--name-only', 'gh-pages').splitlines()
        self.assertEqual(files, ['.github/workflows/pages.yml', 'publication.json', 'site/phenom/index.html'])
        identity = self.git('--git-dir=' + str(self.remote), 'show', '-s', '--format=%an <%ae>|%cn <%ce>', 'gh-pages')
        self.assertEqual(identity, 'kissetfall <j@ergohaven.xyz>|kissetfall <j@ergohaven.xyz>')

    def test_next_version_fast_forwards_and_reuses_unchanged_version(self):
        first = self.publish()
        second = self.publish()
        self.assertTrue(second['reused'])
        self.assertEqual(first['commit'], second['commit'])
        self.assertEqual(sum(c[0] == 'push' for c in self.calls), 1)
        (self.root / 'ru/phenom/index.html').write_text('ru-v2')
        self.manifest('b' * 40)
        third = self.publish('b' * 40)
        self.assertEqual(self.git('--git-dir=' + str(self.remote), 'rev-parse', 'gh-pages^'), first['commit'])
        self.assertNotEqual(third['commit'], first['commit'])
        self.assertFalse(any('--force' in arg or arg.startswith('+') for c in self.calls for arg in c))

    def test_trusted_workflow_upgrade_fast_forwards_then_reuses_and_publishes_next_version(self):
        first = self.publish()
        template = self.base / 'trusted-v2.yml'
        template.write_bytes(self.template.read_bytes().replace(
            b'Deploy managed RU Pages', b'Deploy managed RU Pages v2', 1))
        self.assertNotEqual(template.read_bytes(), self.template.read_bytes())
        second = self.publish(workflow_template=template)
        self.assertFalse(second['reused'])
        self.assertEqual(second['source_sha'], SHA)
        self.assertNotEqual(second['commit'], first['commit'])
        self.assertEqual(self.git('--git-dir=' + str(self.remote), 'rev-parse', 'gh-pages^'), first['commit'])
        workflow = self.git('--git-dir=' + str(self.remote), 'show', 'gh-pages:.github/workflows/pages.yml')
        self.assertEqual(workflow, template.read_text().strip())
        record = json.loads(self.git('--git-dir=' + str(self.remote), 'show', 'gh-pages:publication.json'))
        self.assertEqual(record['workflow_sha256'], hashlib.sha256(template.read_bytes()).hexdigest())
        reused = self.publish(workflow_template=template)
        self.assertTrue(reused['reused'])
        self.assertEqual(reused['commit'], second['commit'])
        self.assertEqual(sum(c[0] == 'push' for c in self.calls), 2)
        (self.root / 'ru/phenom/index.html').write_text('ru-v2')
        self.manifest('b' * 40)
        third = self.publish('b' * 40, workflow_template=template)
        self.assertFalse(third['reused'])
        self.assertEqual(self.git('--git-dir=' + str(self.remote), 'rev-parse', 'gh-pages^'), second['commit'])
        self.assertEqual(self.git('--git-dir=' + str(self.remote), 'show', 'gh-pages:site/phenom/index.html'), 'ru-v2')
        self.assertEqual(self.git('--git-dir=' + str(self.remote), 'show', 'gh-pages:.github/workflows/pages.yml'), workflow)

    def test_previous_workflow_body_digest_mismatch_is_refused(self):
        self.publish()
        tip = self.mutate_remote(lambda p: (p / '.github/workflows/pages.yml').write_text('altered body'))
        before = len(self.calls)
        with self.assertRaisesRegex(ValueError, 'previous workflow'):
            self.publish()
        self.assertFalse(any(c[0] == 'push' for c in self.calls[before:]))
        self.assertEqual(self.git('--git-dir=' + str(self.remote), 'rev-parse', 'gh-pages'), tip)

    def test_malformed_previous_workflow_digest_is_refused(self):
        self.publish()
        for value in (None, 123, [], {}, 'a' * 63, 'A' * 64, 'g' * 64, 'a' * 64 + '\n'):
            with self.subTest(value=value):
                def change(path):
                    record = json.loads((path / 'publication.json').read_text())
                    record['workflow_sha256'] = value
                    (path / 'publication.json').write_text(json.dumps(record))
                tip = self.mutate_remote(change)
                before = len(self.calls)
                with self.assertRaisesRegex(ValueError, 'previous workflow'):
                    self.publish()
                self.assertFalse(any(c[0] == 'push' for c in self.calls[before:]))
                self.assertEqual(self.git('--git-dir=' + str(self.remote), 'rev-parse', 'gh-pages'), tip)

    def test_bundle_corruption_and_source_mismatch_abort_before_transport(self):
        for locale in ('ru', 'en'):
            page = self.root / locale / 'phenom/index.html'
            page.write_text('corrupt')
            with self.assertRaises(ValueError):
                self.publish()
            page.write_text(locale)
        with self.assertRaises(ValueError):
            self.publish('b' * 40)
        self.assertFalse(self.calls)

    def test_injection_wrong_targets_symlinks_and_existing_workdir_are_rejected(self):
        for repository in ('ergohaven/projects', '-oProxyCommand=evil', 'ergohaven/projects-ru;evil'):
            with self.assertRaises(ValueError):
                self.publish(repository=repository)
        for sha in ('main', SHA + '\n', ';evil'):
            with self.assertRaises(ValueError):
                self.publish(sha)
        link = self.root / 'ru/link'
        link.symlink_to(self.key)
        with self.assertRaises(ValueError):
            self.publish()
        link.unlink()
        with self.assertRaises(ValueError):
            self.publish(workdir=self.root / 'new-work')
        with self.assertRaises(ValueError):
            self.publish(workdir=self.base)
        self.key.chmod(0o644)
        with self.assertRaises(ValueError):
            self.publish()
        self.assertFalse(self.calls)

    def mutate_remote(self, changes):
        clone = self.base / ('clone-' + str(len(list(self.base.glob('clone-*')))))
        self.git('clone', '--branch', 'gh-pages', str(self.remote), str(clone))
        self.git('-C', str(clone), 'config', 'user.name', 'kissetfall')
        self.git('-C', str(clone), 'config', 'user.email', 'j@ergohaven.xyz')
        changes(clone)
        self.git('-C', str(clone), 'add', '-A')
        self.git('-C', str(clone), 'commit', '-m', 'fixture competing mutation')
        self.git('-C', str(clone), 'push', 'origin', 'gh-pages')
        return self.git('-C', str(clone), 'rev-parse', 'HEAD')

    def test_unknown_previous_inventory_refused_without_touching_remote(self):
        self.publish()
        tip = self.mutate_remote(lambda p: (p / 'unknown.txt').write_text('do not delete'))
        before = len(self.calls)
        with self.assertRaisesRegex(ValueError, 'inventory'):
            self.publish()
        self.assertFalse(any(c[0] == 'push' for c in self.calls[before:]))
        self.assertEqual(self.git('--git-dir=' + str(self.remote), 'rev-parse', 'gh-pages'), tip)

    def test_unknown_empty_tree_is_refused(self):
        result = self.publish()
        env = dict(os.environ, GIT_AUTHOR_NAME='kissetfall', GIT_AUTHOR_EMAIL='j@ergohaven.xyz',
                   GIT_COMMITTER_NAME='kissetfall', GIT_COMMITTER_EMAIL='j@ergohaven.xyz')
        def bare(args, data=None):
            return subprocess.run(['git', '--git-dir=' + str(self.remote), *args], input=data,
                                  capture_output=True, check=True, env=env).stdout
        empty = bare(['mktree'], b'').strip()
        original = bare(['ls-tree', 'gh-pages'])
        tree = bare(['mktree'], original + b'040000 tree ' + empty + b'\tunknown-empty\n').strip()
        commit = bare(['commit-tree', tree.decode(), '-p', result['commit']], b'fixture empty tree\n').strip()
        bare(['update-ref', 'refs/heads/gh-pages', commit.decode()])
        with self.assertRaisesRegex(ValueError, 'directory'):
            self.publish()

    def test_previous_symlink_is_refused(self):
        self.publish()
        self.mutate_remote(lambda p: (p / 'site/evil').symlink_to('/etc/passwd'))
        with self.assertRaisesRegex(ValueError, 'symlink'):
            self.publish()

    def test_previous_site_corruption_is_refused(self):
        self.publish()
        self.mutate_remote(lambda p: (p / 'site/phenom/index.html').write_text('changed'))
        with self.assertRaisesRegex(ValueError, 'content mismatch'):
            self.publish()

    def test_remote_advance_rejects_normal_push_without_retry(self):
        self.publish()
        (self.root / 'ru/phenom/index.html').write_text('next')
        self.manifest('b' * 40)
        advanced = []
        def hook(git, args):
            if args[0] == 'push':
                advanced.append(self.mutate_remote(lambda p: (p / 'race.txt').write_text('race')))
        self.transport_hook = hook
        before = len(self.calls)
        with self.assertRaises(subprocess.CalledProcessError):
            self.publish('b' * 40)
        self.assertEqual(sum(c[0] == 'push' for c in self.calls[before:]), 1)
        self.assertEqual(self.git('--git-dir=' + str(self.remote), 'rev-parse', 'gh-pages'), advanced[0])

    def test_readback_uncertainty_never_returns_success_or_retries_push(self):
        pushed = []
        def hook(git, args):
            if args[0] == 'push':
                pushed.append(True)
            if args[0] == 'ls-remote' and pushed:
                raise RuntimeError('offline readback uncertainty')
        self.transport_hook = hook
        with self.assertRaisesRegex(RuntimeError, 'uncertainty'):
            self.publish()
        self.assertEqual(sum(c[0] == 'push' for c in self.calls), 1)
        self.assertTrue(self.git('--git-dir=' + str(self.remote), 'rev-parse', 'gh-pages'))

    def test_inline_workflow_verifier_executes_and_rejects_extra_html(self):
        self.publish()
        clone = self.base / 'verify-checkout'
        self.git('clone', '--branch', 'gh-pages', str(self.remote), str(clone))
        source = self.template.read_text().split("python3 - <<'PY'\n", 1)[1].split('\n          PY', 1)[0]
        source = '\n'.join(line[10:] for line in source.splitlines())
        result = subprocess.run(['python3', '-c', source], cwd=clone, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        (clone / 'site/extra.html').write_text('stray')
        result = subprocess.run(['python3', '-c', source], cwd=clone, capture_output=True)
        self.assertNotEqual(result.returncode, 0)

    def test_ssh_transport_uses_pins_and_no_ambient_credentials(self):
        self.assertIsNotNone(pub)
        git = pub.Git(self.base, self.key, self.hosts)
        command = git.env['GIT_SSH_COMMAND']
        for token in ('StrictHostKeyChecking=yes', 'IdentitiesOnly=yes', 'BatchMode=yes',
                      'GlobalKnownHostsFile=/dev/null', '-F /dev/null', str(self.hosts)):
            self.assertIn(token, command)
        self.assertEqual(git.env['GIT_AUTHOR_NAME'], 'kissetfall')
        self.assertEqual(git.env['GIT_COMMITTER_EMAIL'], 'j@ergohaven.xyz')


if __name__ == '__main__':
    unittest.main()
