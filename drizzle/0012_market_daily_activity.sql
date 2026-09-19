CREATE TABLE `market_daily_activity` (
  `day` text PRIMARY KEY NOT NULL,
  `observed_at` integer NOT NULL,
  `volume_24h` real,
  `liquidity` real,
  `pool_count` integer NOT NULL,
  `batch_count` integer NOT NULL,
  `policy_version` text NOT NULL
);
