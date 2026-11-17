CREATE TABLE cup_tournament (
  id TEXT PRIMARY KEY CHECK (id IN ('winter', 'prestige')),
  name TEXT NOT NULL,
  season TEXT NOT NULL,
  state TEXT NOT NULL,
  configuration TEXT NOT NULL CHECK (json_valid(configuration))
);
--> statement-breakpoint
CREATE TABLE cup_team (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES cup_tournament(id),
  name TEXT NOT NULL,
  pool TEXT NOT NULL CHECK (pool IN ('A', 'B')),
  crest TEXT,
  kit TEXT
);
--> statement-breakpoint
CREATE TABLE cup_player (
  id TEXT PRIMARY KEY,
  team TEXT NOT NULL REFERENCES cup_team(id),
  name TEXT NOT NULL,
  shirt TEXT,
  position TEXT NOT NULL,
  duties TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  UNIQUE (id, team)
);
--> statement-breakpoint
CREATE INDEX cup_player_team ON cup_player(team, active);
--> statement-breakpoint
CREATE TABLE cup_match (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES cup_tournament(id),
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  pool TEXT CHECK (pool IN ('A', 'B')),
  place INTEGER CHECK (place IN (1, 2)),
  home TEXT REFERENCES cup_team(id),
  away TEXT REFERENCES cup_team(id),
  CHECK ((pool IS NOT NULL AND place IS NULL AND home IS NOT NULL AND away IS NOT NULL AND home <> away)
    OR (pool IS NULL AND place IS NOT NULL AND home IS NULL AND away IS NULL)),
  UNIQUE (date, time, tournament_id)
);
--> statement-breakpoint
CREATE TABLE cup_report (
  match_id TEXT NOT NULL REFERENCES cup_match(id),
  revision INTEGER NOT NULL CHECK (revision > 0),
  submission TEXT NOT NULL UNIQUE,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
  home TEXT NOT NULL REFERENCES cup_team(id),
  away TEXT NOT NULL REFERENCES cup_team(id),
  score TEXT NOT NULL CHECK (json_valid(score)),
  half_time TEXT CHECK (half_time IS NULL OR json_valid(half_time)),
  penalties TEXT CHECK (penalties IS NULL OR json_valid(penalties)),
  yellow TEXT CHECK (yellow IS NULL OR json_valid(yellow)),
  red TEXT CHECK (red IS NULL OR json_valid(red)),
  CHECK (home <> away),
  PRIMARY KEY (match_id, revision)
);
--> statement-breakpoint
CREATE TABLE cup_event (
  match_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  id TEXT NOT NULL,
  team TEXT NOT NULL REFERENCES cup_team(id),
  player TEXT NOT NULL,
  assist TEXT,
  fraction INTEGER NOT NULL CHECK (fraction IN (1, 2)),
  minute INTEGER NOT NULL CHECK (minute BETWEEN 0 AND 99),
  stoppage INTEGER NOT NULL CHECK (stoppage BETWEEN 0 AND 30),
  kind TEXT NOT NULL CHECK (kind IN ('goal', 'penalty', 'own_goal', 'yellow', 'red', 'second_yellow')),
  notes TEXT NOT NULL DEFAULT '',
  verified INTEGER NOT NULL CHECK (verified IN (0, 1)),
  PRIMARY KEY (match_id, revision, id),
  FOREIGN KEY (match_id, revision) REFERENCES cup_report(match_id, revision),
  FOREIGN KEY (player, team) REFERENCES cup_player(id, team),
  FOREIGN KEY (assist, team) REFERENCES cup_player(id, team),
  CHECK (assist IS NULL OR (kind = 'goal' AND player <> assist))
);
--> statement-breakpoint
CREATE VIEW cup_published AS
SELECT r.* FROM cup_report r
WHERE r.status = 'published'
  AND r.revision = (SELECT max(revision) FROM cup_report latest
    WHERE latest.match_id = r.match_id AND latest.status = 'published');
--> statement-breakpoint
CREATE INDEX cup_report_status ON cup_report(match_id, status, revision);
--> statement-breakpoint
CREATE TABLE cup_shootout (
  pool TEXT NOT NULL CHECK (pool IN ('A', 'B')),
  revision INTEGER NOT NULL CHECK (revision > 0),
  team_order TEXT NOT NULL CHECK (json_valid(team_order)),
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (pool, revision)
);
