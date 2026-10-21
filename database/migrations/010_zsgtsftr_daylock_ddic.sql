-- Align ZSGTSFTR_DAYLOCK with SLC_SAP_METADATA_V2_1_daylock.json (DS4/100, 2026-10-19).
-- SQLite stores SAP CLNT / CHAR / NUMC / DATS / TIMS as TEXT, preserving leading zeroes
-- and SAP YYYYMMDD / HHMMSS values. Only the eight DDIC key fields are NOT NULL.
-- Empty defaults keep existing Lock Blotter inserts compatible; non-key fields also accept NULL.
-- The migration runner wraps the rebuild and its bookkeeping in one transaction.
CREATE TABLE zsgtsftr_daylock_ddic (
  client        TEXT NOT NULL CHECK (length(client) <= 3),
  zco_area      TEXT NOT NULL CHECK (length(zco_area) <= 4),
  zmonth        TEXT NOT NULL CHECK (length(zmonth) <= 3),
  zyear         TEXT NOT NULL CHECK (length(zyear) <= 4),
  ztype         TEXT NOT NULL CHECK (length(ztype) <= 10),
  zb_type       TEXT NOT NULL CHECK (length(zb_type) <= 30),
  zpdate        TEXT NOT NULL CHECK (length(zpdate) <= 8),
  zgrp          TEXT NOT NULL CHECK (length(zgrp) <= 3),
  zlocked       TEXT DEFAULT '' CHECK (length(zlocked) <= 1),
  zcreated_by   TEXT DEFAULT '' CHECK (length(zcreated_by) <= 12),
  zcreated_date TEXT DEFAULT '' CHECK (length(zcreated_date) <= 8),
  zcreated_time TEXT DEFAULT '' CHECK (length(zcreated_time) <= 6),
  zchanged_by   TEXT DEFAULT '' CHECK (length(zchanged_by) <= 12),
  zchanged_date TEXT DEFAULT '' CHECK (length(zchanged_date) <= 8),
  zchanged_time TEXT DEFAULT '' CHECK (length(zchanged_time) <= 6),
  PRIMARY KEY (client, zco_area, zmonth, zyear, ztype, zb_type, zpdate, zgrp)
);

INSERT INTO zsgtsftr_daylock_ddic (
  client, zco_area, zmonth, zyear, ztype, zb_type, zpdate, zgrp,
  zlocked, zcreated_by, zcreated_date, zcreated_time, zchanged_by, zchanged_date, zchanged_time
)
SELECT
  client, zco_area, zmonth, zyear, ztype, zb_type, zpdate, zgrp,
  zlocked, zcreated_by, zcreated_date, zcreated_time, zchanged_by, zchanged_date, zchanged_time
FROM zsgtsftr_daylock;

DROP TABLE zsgtsftr_daylock;
ALTER TABLE zsgtsftr_daylock_ddic RENAME TO zsgtsftr_daylock;
