-- ZSGTSFTR_LIM_MAN — FX limit master of the Limit Management dashboard (tcode ZSGTSFP021), client-dependent.
--
-- !! The DDIC export SLC_SAP_METADATA_V2_1_LIM_MAN.json for this table came back EMPTY ("No active DDIC version was returned"
-- !! for ZSGTSFTR_LIM_MAN), so the field list below is the one the program's analysis names, NOT a DDIC copy:
-- !!   - field names are as listed for the program (ZLIMIT_STARTDT, ZLIMIT_MATDT, ZYEAR, ZCURR_PAIR, ZCURR, ZINI_AAMT, ZAD_AAMT,
-- !!     ZUNAPROV_AMT, ZUTL_AMT, ZLIM_SET, ZLIM_APP, ZLIM_REJ, ZLIM_ADDLIM and the created / changed audit fields);
-- !!   - lengths and types are inferred (ZCURR_PAIR 7 = ZSGTRMTR_CURPAIR-PAIR, ZCURR 5 = CUKY, amounts CURR 17,2 as in TRD_POS);
-- !!   - the PRIMARY KEY (year, pair, start, end) is an ASSUMPTION.
-- !! When the DDIC export succeeds, align this table with it in a NEW migration (never edit this one), as 010 did for DAYLOCK.
--
-- Column names are SAP's, lower-cased. DATS stay 8-char YYYYMMDD and TIMS 6-char HHMMSS text, as in SAP; amounts are NUMERIC.
-- Flags are CHAR(1) 'X' / ''. ZUNAPROV_AMT holds an amount awaiting approval; ZLIM_SET marks a limit that has been set.
CREATE TABLE zsgtsftr_lim_man (
  client         TEXT    NOT NULL CHECK (length(client) <= 3),                    -- CLNT(3) Client
  zyear          TEXT    NOT NULL CHECK (length(zyear) <= 4),                     -- NUMC(4) Limit year
  zcurr_pair     TEXT    NOT NULL CHECK (length(zcurr_pair) <= 7),                -- CHAR(7) Currency pair
  zlimit_startdt TEXT    NOT NULL CHECK (length(zlimit_startdt) <= 8),            -- DATS(8) Validity start
  zlimit_matdt   TEXT    NOT NULL CHECK (length(zlimit_matdt) <= 8),              -- DATS(8) Validity end
  zcurr          TEXT    NOT NULL DEFAULT '' CHECK (length(zcurr) <= 5),          -- CUKY(5) Limit currency
  zini_aamt      NUMERIC NOT NULL DEFAULT 0,                                      -- CURR(17,2) Initial approved amount
  zad_aamt       NUMERIC NOT NULL DEFAULT 0,                                      -- CURR(17,2) Total approved amount
  zunaprov_amt   NUMERIC NOT NULL DEFAULT 0,                                      -- CURR(17,2) Amount awaiting approval
  zutl_amt       NUMERIC NOT NULL DEFAULT 0,                                      -- CURR(17,2) Utilised amount
  zlim_set       TEXT    NOT NULL DEFAULT '' CHECK (length(zlim_set) <= 1),       -- CHAR(1) Limit set
  zlim_app       TEXT    NOT NULL DEFAULT '' CHECK (length(zlim_app) <= 1),       -- CHAR(1) Approved
  zlim_rej       TEXT    NOT NULL DEFAULT '' CHECK (length(zlim_rej) <= 1),       -- CHAR(1) Rejected
  zlim_addlim    TEXT    NOT NULL DEFAULT '' CHECK (length(zlim_addlim) <= 1),    -- CHAR(1) Additional limit requested
  zcreated_by    TEXT    NOT NULL DEFAULT '' CHECK (length(zcreated_by) <= 12),   -- CHAR(12) Entered By
  zcreated_date  TEXT    NOT NULL DEFAULT '' CHECK (length(zcreated_date) <= 8),  -- DATS(8) Entered On
  zcreated_time  TEXT    NOT NULL DEFAULT '' CHECK (length(zcreated_time) <= 6),  -- TIMS(6) Entry Time
  zchanged_by    TEXT    NOT NULL DEFAULT '' CHECK (length(zchanged_by) <= 12),   -- CHAR(12) Last Changed By
  zchanged_date  TEXT    NOT NULL DEFAULT '' CHECK (length(zchanged_date) <= 8),  -- DATS(8) Changed On
  zchanged_time  TEXT    NOT NULL DEFAULT '' CHECK (length(zchanged_time) <= 6),  -- TIMS(6) Time Changed
  PRIMARY KEY (client, zyear, zcurr_pair, zlimit_startdt, zlimit_matdt)
);
