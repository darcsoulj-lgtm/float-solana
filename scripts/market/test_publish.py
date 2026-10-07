"""No network or provider requests: exercise publication failure boundaries."""
import importlib.util
import io
import json
import os
import pathlib
import tempfile
import unittest
import urllib.error
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('market_publish', pathlib.Path(__file__).with_name('publish.py'))
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class PublicationRetryTests(unittest.TestCase):
    def call(self, events, path='/git/blobs', method='POST', headers=None):
        requests, delays = [], []

        def opener(request, timeout):
            requests.append((request.full_url, request.data, timeout))
            event = events.pop(0)
            if isinstance(event, int):
                raise urllib.error.HTTPError(request.full_url, event, 'test', headers or {}, io.BytesIO())
            if isinstance(event, Exception):
                raise event
            return io.BytesIO(b'{"sha":"verified-object"}')

        self.requests, self.delays = requests, delays
        with patch.dict(os.environ, {'GITHUB_REPOSITORY': 'test/public', 'GH_TOKEN': 'fixture-only'}):
            return publisher.api(path, method, {'content': 'public-fixture'}, opener=opener, sleep=delays.append)

    def test_transient_blob_error_reuses_identical_body(self):
        self.assertEqual(self.call([500, 502, 'ok'])['sha'], 'verified-object')
        self.assertEqual(self.delays, [1, 2])
        self.assertEqual(len(set(self.requests)), 1)

    def test_read_network_failure_recovers(self):
        self.call([urllib.error.URLError('temporary'), 'ok'], '/git/ref/heads/market-data', 'GET')
        self.assertEqual(len(self.requests), 2)

    def test_exhaustion_stays_failed(self):
        with self.assertRaises(urllib.error.HTTPError):
            self.call([503] * 4)
        self.assertEqual(len(self.requests), 4)
        self.assertEqual(self.delays, [1, 2, 4])

    def test_access_identity_and_validation_errors_are_not_retried(self):
        for code in [401, 403, 404, 409, 422]:
            with self.subTest(code=code), self.assertRaises(urllib.error.HTTPError):
                self.call([code])
            self.assertEqual(len(self.requests), 1)

    def test_branch_mutations_are_never_replayed(self):
        for path, method in [('/git/refs/heads/market-data', 'PATCH'), ('/git/refs', 'POST')]:
            with self.subTest(method=method), self.assertRaises(urllib.error.HTTPError):
                self.call([500], path, method)
            self.assertEqual(len(self.requests), 1)

    def test_short_retry_after_is_respected(self):
        self.call([429, 'ok'], headers={'Retry-After': '7'})
        self.assertEqual(self.delays, [7])

    def test_long_retry_after_stops_without_blind_retry(self):
        with self.assertRaises(urllib.error.HTTPError):
            self.call([429], headers={'Retry-After': '60'})
        self.assertEqual(self.delays, [])

    def test_full_publication_keeps_manifest_link_after_blob_retry(self):
        calls, delays = [], []
        failed = False

        def opener(request, timeout):
            nonlocal failed
            path = request.full_url.removeprefix('https://api.github.com/repos/test/public')
            body = json.loads(request.data) if request.data else None
            calls.append((path, request.method, body))
            if path == '/git/blobs' and not failed:
                failed = True
                raise urllib.error.HTTPError(request.full_url, 500, 'test', {}, io.BytesIO())
            result = {'private': False} if path == '' else {'sha': 'object-' + str(len(calls))}
            return io.BytesIO(json.dumps(result).encode())

        original_api = publisher.api
        def fixture_api(path, method='GET', data=None):
            return original_api(path, method, data, opener=opener, sleep=delays.append)

        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / 'work/market-snapshot'
            (root / 'chunks').mkdir(parents=True)
            (root / 'pending.json').write_text('{"chunks":["fixture"]}')
            (root / 'state.json').write_text('{}')
            (root / 'verification.json').write_text('{"health":[]}')
            (root / 'chunks/fixture.json').write_text('{}')
            before = os.getcwd()
            try:
                os.chdir(directory)
                with patch.dict(os.environ, {'GITHUB_REPOSITORY': 'test/public', 'GH_TOKEN': 'fixture-only', 'GITHUB_STEP_SUMMARY': ''}), patch.object(publisher, 'api', fixture_api):
                    publisher.main()
            finally:
                os.chdir(before)
        self.assertEqual(delays, [1])
        update = [body for path, method, body in calls if path == '/git/trees' and 'base_tree' in body][0]
        commits = [body for path, method, body in calls if path == '/git/commits']
        manifest = json.loads(update['tree'][0]['content'])
        self.assertEqual(commits[-1]['parents'], [manifest['commit']])
        self.assertEqual(calls[-1][0:2], ('/git/refs/heads/market-data', 'PATCH'))
        self.assertEqual(sum(method == 'PATCH' for path, method, body in calls), 1)


if __name__ == '__main__':
    unittest.main()
