-- ZSGTSFTR_DEALDMS — SLC - DMS Data: the documents attached to a Deal ID (SAP DDIC, client-dependent).
-- Generated from DEAL_DMS.json (schema 2.1, DS4 / 100). One row per Deal ID + DMS category + document type: the
-- slot's document date, its custom DMS code (ZSGTSFTR_TSF_DMS-ZTSF_DMS_CODE) and the SAP DMS document number.
-- The SLC middleware has no resource for this table, so the Deal ID Documents dialog reads and writes it here.
-- Column names are SAP's, lower-cased; DATS / TIMS stay 8-char / 6-char text as in SAP.
CREATE TABLE zsgtsftr_dealdms (
  client        TEXT    NOT NULL,            -- CLNT(3) Client
  zdms_cat      TEXT    NOT NULL,            -- CHAR(2) DMS Category
  zdms_type     TEXT    NOT NULL,            -- CHAR(3) Doc Type
  zdeal_id      TEXT    NOT NULL,            -- CHAR(10) Deal ID
  zddate        TEXT    NOT NULL DEFAULT '', -- DATS(8) Document Date
  zdms_code     TEXT    NOT NULL DEFAULT '', -- CHAR(10) SLC - DMS Code
  zstnd_dms     TEXT    NOT NULL DEFAULT '', -- CHAR(25) Standard Document Number (ALPHA)
  zcreated_by   TEXT    NOT NULL DEFAULT '', -- CHAR(12) Entered By
  zcreated_date TEXT    NOT NULL DEFAULT '', -- DATS(8) Entered On
  zcreated_time TEXT    NOT NULL DEFAULT '', -- TIMS(6) Entry Time
  zchanged_by   TEXT    NOT NULL DEFAULT '', -- CHAR(12) Last Changed By
  zchanged_date TEXT    NOT NULL DEFAULT '', -- DATS(8) Changed On
  zchanged_time TEXT    NOT NULL DEFAULT '', -- TIMS(6) Time Changed
  PRIMARY KEY (client, zdms_cat, zdms_type, zdeal_id)
);

-- The dialog always reads one Deal ID's slots.
CREATE INDEX zsgtsftr_dealdms_deal ON zsgtsftr_dealdms (client, zdeal_id);
