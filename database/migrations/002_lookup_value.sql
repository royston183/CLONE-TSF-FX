-- Static lookup values the application owns (statuses, strategies, defaults).
-- Filled by `npm run db:seed`; rows are keyed so the seed can run repeatedly.
CREATE TABLE lookup_value (
  category   TEXT    NOT NULL,
  code       TEXT    NOT NULL,
  label      TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (category, code)
);
