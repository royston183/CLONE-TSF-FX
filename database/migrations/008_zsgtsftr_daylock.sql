-- ZSGTSFTR_DAYLOCK — TRM Day Wise Locking (SAP DDIC, client-dependent).
-- From the DDIC fields of the ZSGTSF_PFX_BLOTTER export (schemaVersion 2.1). One row per blotter date, trader
-- group and trader code once that day's FX Deal Blotter (ZB_TYPE 'DE6') has been locked: the Lock Blotter action
-- writes ZLOCKED = 'X', and a blotter whose own day is locked, or whose previous working day is not, is read-only.
-- This SQLite table is the source of those rows. Column names are SAP's, lower-cased; DATS / TIMS stay 8-char /
-- 6-char text as in SAP. ZYEAR / ZMONTH are the year and month of ZPDATE, and ZCO_AREA is the controlling area
-- the program writes (OL10).
CREATE TABLE zsgtsftr_daylock (
  client        TEXT NOT NULL,            -- CLNT(3) Client
  zb_type       TEXT NOT NULL,            -- CHAR(30) Deal Source (the blotter: DE6)
  zco_area      TEXT NOT NULL,            -- CHAR(4) Controlling Area
  zgrp          TEXT NOT NULL,            -- CHAR(3) Group
  zmonth        TEXT NOT NULL,            -- CHAR(3) Month
  zpdate        TEXT NOT NULL,            -- DATS(8) Parameter Date (the blotter date)
  ztype         TEXT NOT NULL,            -- CHAR(10) Type (the trader / trade code)
  zyear         TEXT NOT NULL,            -- NUMC(4) Fiscal Year
  zlocked       TEXT NOT NULL DEFAULT '', -- CHAR(1) Lock ('X' = locked)
  zcreated_by   TEXT NOT NULL DEFAULT '', -- CHAR(12) Entered By
  zcreated_date TEXT NOT NULL DEFAULT '', -- DATS(8) Entered On
  zcreated_time TEXT NOT NULL DEFAULT '', -- TIMS(6) Entry Time
  zchanged_by   TEXT NOT NULL DEFAULT '', -- CHAR(12) Last Changed By
  zchanged_date TEXT NOT NULL DEFAULT '', -- DATS(8) Changed On
  zchanged_time TEXT NOT NULL DEFAULT '', -- TIMS(6) Time Changed
  PRIMARY KEY (client, zb_type, zco_area, zgrp, zmonth, zpdate, ztype, zyear)
);
