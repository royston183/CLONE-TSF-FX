-- ZSGTRMTR_CURPAIR — Define currency pair for trading (SAP DDIC, client-dependent, client column MANDT).
-- Schema: supplied SLC_SAP_METADATA_V2_1_CURPAIR.json (DS4 / client 100, 21 October 2026).
-- Read by the Limit Management dashboard's currency-pair dropdown (pairs where one leg is USD).
-- Column names are SAP's, lower-cased. CLNT / CHAR / CUKY / DATS / TIMS stay TEXT (leading zeroes, YYYYMMDD and HHMMSS as in SAP);
-- DIV_RATIO (DEC 9,0) is NUMERIC. Only the DDIC key fields are NOT NULL.
CREATE TABLE zsgtrmtr_curpair (
  mandt         TEXT    NOT NULL CHECK (length(mandt) <= 3),        -- CLNT(3) Client
  f_curr        TEXT    NOT NULL CHECK (length(f_curr) <= 5),       -- CUKY(5) from currency
  t_curr        TEXT    NOT NULL CHECK (length(t_curr) <= 5),       -- CUKY(5) to currency
  bukrs         TEXT    NOT NULL DEFAULT '' CHECK (length(bukrs) <= 4),        -- CHAR(4) Company Code
  pair          TEXT    NOT NULL DEFAULT '' CHECK (length(pair) <= 7),         -- CHAR(7) Currency Pair
  created_by    TEXT    NOT NULL DEFAULT '' CHECK (length(created_by) <= 12),  -- CHAR(12) Entered By
  created_date  TEXT    NOT NULL DEFAULT '' CHECK (length(created_date) <= 8), -- DATS(8) Entered On
  created_time  TEXT    NOT NULL DEFAULT '' CHECK (length(created_time) <= 6), -- TIMS(6) Entry Time
  upuser        TEXT    NOT NULL DEFAULT '' CHECK (length(upuser) <= 12),      -- CHAR(12) Last Changed By
  dupdat        TEXT    NOT NULL DEFAULT '' CHECK (length(dupdat) <= 8),       -- DATS(8) Changed On
  tuptim        TEXT    NOT NULL DEFAULT '' CHECK (length(tuptim) <= 6),       -- TIMS(6) Time Changed
  div_ratio     NUMERIC NOT NULL DEFAULT 0,                                    -- DEC(9,0) Ratio for the "from" currency units
  PRIMARY KEY (mandt, f_curr, t_curr)
);
