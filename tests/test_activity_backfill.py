import importlib.util, pathlib, sqlite3, unittest
from datetime import datetime, timezone
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('activity_backfill', pathlib.Path(__file__).resolve().parents[1] / 'scripts/market/backfill-trading-activity.py')
backfill = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backfill)

class ReservationTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.db.execute('CREATE TABLE market_cache(key TEXT PRIMARY KEY,payload TEXT,fetched_at INTEGER,retry_after INTEGER)')
        self.day = int(datetime.now(timezone.utc).timestamp()*1000)//86400000*86400000
    def tearDown(self): self.db.close()
    def query(self, sql, params): return [dict(row) for row in self.db.execute(sql, params).fetchall()]
    def test_full_pass_and_retry_share_existing_rolling_ledger_without_replay(self):
        with patch.object(backfill, 'query', self.query):
            backfill.reserve('birdeye-usage:v2:activity-backfill:fixture', 3000)
            backfill.reserve('birdeye-usage:v2:activity-backfill:fixture', 3000, reuse=True)
            backfill.reserve('birdeye-usage:v2:activity-backfill:fixture:retry:mint:1', 40)
            with self.assertRaisesRegex(ValueError, 'uncharged replay'):
                backfill.reserve('birdeye-usage:v2:activity-backfill:fixture:retry:mint:1', 40)
        self.assertEqual(self.db.execute('SELECT SUM(CAST(payload AS INTEGER)) FROM market_cache').fetchone()[0], 3040)
    def test_legacy_usage_is_reweighted_and_budget_denial_writes_nothing(self):
        self.db.execute('INSERT INTO market_cache VALUES (?,?,?,0)', ('birdeye-usage:v1:old', '1000', self.day))
        self.db.execute('INSERT INTO market_cache VALUES (?,?,?,0)', ('birdeye-usage:v2:today', '16000', self.day))
        with patch.object(backfill, 'query', self.query):
            with self.assertRaisesRegex(ValueError, 'existing free-volume budget'):
                backfill.reserve('birdeye-usage:v2:activity-backfill:fixture', 3000)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM market_cache').fetchone()[0], 2)
    def test_expired_usage_does_not_block_recovery_or_get_reset(self):
        self.db.execute('INSERT INTO market_cache VALUES (?,?,?,0)', ('birdeye-usage:v2:old', '20000', self.day-32*86400000))
        with patch.object(backfill, 'query', self.query):
            backfill.reserve('birdeye-usage:v2:activity-backfill:fixture', 3000)
        self.assertEqual(self.db.execute("SELECT payload FROM market_cache WHERE key='birdeye-usage:v2:old'").fetchone()[0], '20000')

if __name__ == '__main__': unittest.main()
