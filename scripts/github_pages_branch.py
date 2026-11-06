#!/usr/bin/env python3
"""Publish verified RU bytes to a managed branch; this does not verify Pages deployment."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shlex
import stat
import subprocess
from cloudflare_pages import verify_bundle, source_sha as validate_sha

REPOSITORY = 'ergohaven/projects-ru'
REMOTE = 'git@github.com:ergohaven/projects-ru.git'
REF = 'refs/heads/gh-pages'
AUTHOR = 'kissetfall'
EMAIL = 'j@ergohaven.xyz'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def safe_path(name):
    path = PurePosixPath(name)
    if (not name or path.is_absolute() or path.as_posix() != name
            or any(p in ('.', '..', '.git') for p in path.parts)
            or any(ord(c) < 32 or c in '\\\x7f' for c in name)):
        raise ValueError('unsafe inventory path')
    if name.lower().endswith('.html') and name not in ('index.html', '404.html', 'phenom/index.html'):
        raise ValueError('unexpected HTML outside Phenom scope')


class Git:
    def __init__(self, workdir, identity, known_hosts):
        self.workdir = workdir
        self.env = {k: v for k, v in os.environ.items() if not k.startswith('GIT_')}
        self.env.update(GIT_CONFIG_GLOBAL='/dev/null', GIT_CONFIG_NOSYSTEM='1',
                        GIT_TERMINAL_PROMPT='0', GIT_AUTHOR_NAME=AUTHOR, GIT_AUTHOR_EMAIL=EMAIL,
                        GIT_COMMITTER_NAME=AUTHOR, GIT_COMMITTER_EMAIL=EMAIL,
                        GIT_SSH_COMMAND=shlex.join(['ssh', '-F', '/dev/null', '-i', str(identity),
                            '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
                            '-o', 'StrictHostKeyChecking=yes', '-o', 'GlobalKnownHostsFile=/dev/null',
                            '-o', 'UserKnownHostsFile=' + str(known_hosts)]))

    def run(self, args, data=None):
        result = subprocess.run(['git', '-c', 'credential.helper=', '-c', 'core.hooksPath=/dev/null',
                                 *args], cwd=self.workdir, env=self.env, input=data,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return result.stdout

    def remote(self, args):
        return self.run(args)

    def tip(self):
        output = self.remote(['ls-remote', '--refs', REMOTE, REF]).decode().strip()
        if not output:
            return None
        parts = output.split()
        if len(parts) != 2 or parts[1] != REF or not re.fullmatch('[0-9a-f]{40}', parts[0]):
            raise ValueError('unexpected remote ref readback')
        return parts[0]


def admit(git, commit):
    """Read Git objects, never check out or execute old branch content."""
    files = {}
    directories = set()
    for entry in git.run(['ls-tree', '-r', '-t', '-z', commit]).split(b'\0'):
        if not entry:
            continue
        info, name = entry.split(b'\t', 1)
        mode, kind, oid = info.decode().split()
        name = name.decode('utf-8')
        if mode == '040000' and kind == 'tree':
            directories.add(name)
            continue
        if mode != '100644' or kind != 'blob':
            raise ValueError('unmanaged branch mode or symlink')
        files[name] = git.run(['cat-file', 'blob', oid])
    try:
        publication = json.loads(files['publication.json'])
        manifest = publication['manifest']
        validate_sha(publication['source_sha'])
        if set(publication) != {'source_sha', 'manifest', 'workflow_sha256'}:
            raise ValueError('unknown publication fields')
        if manifest['source_sha'] != publication['source_sha'] or set(manifest) != {'source_sha', 'files'}:
            raise ValueError('old manifest source mismatch')
        if set(manifest['files']) != {'ru', 'en'}:
            raise ValueError('old manifest locale mismatch')
        for inventory in manifest['files'].values():
            if not isinstance(inventory, dict) or 'phenom/index.html' not in inventory:
                raise ValueError('old manifest missing Phenom')
            for name, value in inventory.items():
                safe_path(name)
                if not isinstance(value, str) or not re.fullmatch('[0-9a-f]{64}', value):
                    raise ValueError('old manifest invalid hash')
        workflow_hash = publication['workflow_sha256']
        # Old code is data only; the new payload always uses the trusted template.
        if (not isinstance(workflow_hash, str) or not re.fullmatch('[0-9a-f]{64}', workflow_hash)
                or digest(files['.github/workflows/pages.yml']) != workflow_hash):
            raise ValueError('untrusted previous workflow')
        expected = {'publication.json', '.github/workflows/pages.yml'} | {'site/' + p for p in manifest['files']['ru']}
        if set(files) != expected:
            raise ValueError('unknown previous branch inventory')
        expected_directories = {str(p) for name in expected for p in PurePosixPath(name).parents if str(p) != '.'}
        if directories != expected_directories:
            raise ValueError('unknown previous branch directory')
        if any(digest(files['site/' + p]) != h for p, h in manifest['files']['ru'].items()):
            raise ValueError('previous site content mismatch')
    except (KeyError, TypeError, json.JSONDecodeError) as error:
        raise ValueError('unmanaged previous publication') from error
    return files


def publish(*, root, source_sha, repository, identity, known_hosts, workflow_template, workdir):
    validate_sha(source_sha)
    if repository != REPOSITORY:
        raise ValueError('only ergohaven/projects-ru is permitted')
    root, identity, known_hosts, workflow_template, workdir = map(Path, (root, identity, known_hosts, workflow_template, workdir))
    for path in (root, identity, known_hosts, workflow_template, workdir.parent):
        if path.is_symlink() or not path.exists() or path.resolve() != path.absolute():
            raise ValueError('missing path or symlink ancestor')
    if not identity.is_file() or identity.stat().st_uid != os.getuid() or stat.S_IMODE(identity.stat().st_mode) not in (0o400, 0o600):
        raise ValueError('identity must be a dedicated owner-only private key file')
    if not known_hosts.is_file() or not workflow_template.is_file():
        raise ValueError('trusted host pins and template must be files')
    if workdir.parent.stat().st_uid != os.getuid() or workdir.exists() or workdir.is_symlink():
        raise ValueError('workdir must be new under an owned directory')
    root, workdir = root.resolve(), workdir.absolute()
    if workdir == root or root in workdir.parents or workdir in root.parents:
        raise ValueError('workspace and artifact overlap')
    for path in root.rglob('*'):
        if path.is_symlink() or not (path.is_file() or path.is_dir()):
            raise ValueError('artifact symlinks/special files forbidden')
    expected = verify_bundle(root, source_sha)
    for inventory in expected['files'].values():
        for name in inventory:
            safe_path(name)
    template = workflow_template.read_bytes()
    payload = {'site/' + name: (root / 'ru' / name).read_bytes() for name in expected['files']['ru']}
    # Detect artifact changes during packaging too.
    if any(digest(payload['site/' + name]) != value for name, value in expected['files']['ru'].items()):
        raise ValueError('artifact changed during packaging')
    publication = dict(source_sha=source_sha, manifest=expected, workflow_sha256=digest(template))
    payload.update({'publication.json': (json.dumps(publication, sort_keys=True, indent=2) + '\n').encode(),
                    '.github/workflows/pages.yml': template})
    workdir.mkdir(mode=0o700)
    git = Git(workdir, identity.resolve(), known_hosts.resolve())
    git.run(['init', '--quiet'])
    git.run(['config', 'user.name', AUTHOR])
    git.run(['config', 'user.email', EMAIL])
    for key, value in [('user.name', AUTHOR), ('user.email', EMAIL)]:
        if git.run(['config', '--local', '--get', key]).decode().strip() != value:
            raise ValueError('Git identity mismatch')
    old = git.tip()
    if old:
        git.remote(['fetch', '--no-tags', REMOTE, REF])
        if git.run(['rev-parse', 'FETCH_HEAD']).decode().strip() != old:
            raise ValueError('remote advanced during fetch')
        previous = admit(git, old)
        if previous == payload:
            if git.tip() != old:
                raise ValueError('idempotent remote readback mismatch')
            return dict(status='branch-published', commit=old, source_sha=source_sha,
                        reused=True, pages_deployment_verified=False)
    for name, data in sorted(payload.items()):
        oid = git.run(['hash-object', '-w', '--stdin'], data).decode().strip()
        git.run(['update-index', '--add', '--cacheinfo', '100644,' + oid + ',' + name])
    tree = git.run(['write-tree']).decode().strip()
    commit = git.run(['commit-tree', tree, *(['-p', old] if old else [])],
                     ('Publish RU ' + source_sha + '\n').encode()).decode().strip()
    # No force, no retry after any uncertain write. Remote advancement rejects the push.
    git.remote(['push', REMOTE, commit + ':' + REF])
    if git.tip() != commit:
        raise ValueError('branch push readback mismatch; deployment not verified')
    return dict(status='branch-published', commit=commit, source_sha=source_sha,
                reused=False, pages_deployment_verified=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['publish'])
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--source-sha', required=True)
    parser.add_argument('--repository', required=True)
    for option in ('identity', 'known-hosts', 'workflow-template', 'workdir'):
        parser.add_argument('--' + option, type=Path, required=True)
    args = vars(parser.parse_args())
    args.pop('command')
    print(json.dumps(publish(**args), sort_keys=True))


if __name__ == '__main__':
    main()
