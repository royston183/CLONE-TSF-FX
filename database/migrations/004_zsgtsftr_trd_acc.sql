-- ZSGTSFTR_TRD_ACC — Trade Invoice posting configuration per posting type (SAP DDIC, client-dependent).
-- Generated from SLC_SAP_METADATA_V2_1_TRD_ACC.json. One row per ZFI_TYPE: the document type, header texts and the
-- debit / credit posting keys and line texts that ZSGTSFTR_SET_TYP rows (by ZFI_TYPE) use when the Execute Settlement
-- for Deal ID screen (R060) shows and posts a Trade Invoice leg. This SQLite table is the source of those rows.
-- Column names are SAP's, lower-cased; DATS / TIMS stay 8-char / 6-char text as in SAP.
CREATE TABLE zsgtsftr_trd_acc (
  client        TEXT    NOT NULL,            -- CLNT(3) Client
  zfi_type      TEXT    NOT NULL,            -- CHAR(2) Posting Type
  zpost_desc    TEXT    NOT NULL DEFAULT '', -- CHAR(40) Posting Type Description
  zdoc_type     TEXT    NOT NULL DEFAULT '', -- CHAR(2) Document type
  zxblnr1       TEXT    NOT NULL DEFAULT '', -- CHAR(16) Reference Document Number
  zbktxt        TEXT    NOT NULL DEFAULT '', -- CHAR(25) Document Header Text
  zdebit        TEXT    NOT NULL DEFAULT '', -- CHAR(2) Debit Posting Key
  zdr_ent       TEXT    NOT NULL DEFAULT '', -- CHAR(2) Debit Entity
  zdr_acc       TEXT    NOT NULL DEFAULT '', -- CHAR(2) Dr/Cr Account
  zdr_text      TEXT    NOT NULL DEFAULT '', -- CHAR(60) Debit Line Text
  zcredit       TEXT    NOT NULL DEFAULT '', -- CHAR(2) Credit Posting Key
  zcr_ent       TEXT    NOT NULL DEFAULT '', -- CHAR(2) Credit Entity
  zcr_acc       TEXT    NOT NULL DEFAULT '', -- CHAR(2) Dr/Cr Account
  zcr_text      TEXT    NOT NULL DEFAULT '', -- CHAR(60) Credit Line Text
  zref1         TEXT    NOT NULL DEFAULT '', -- CHAR(20) Reference Key 1 Internal for Document Header
  zref2         TEXT    NOT NULL DEFAULT '', -- CHAR(20) Reference Key 2 Internal for Document Header
  zcreated_by   TEXT    NOT NULL DEFAULT '', -- CHAR(12) Entered By
  zcreated_date TEXT    NOT NULL DEFAULT '', -- DATS(8) Entered On
  zcreated_time TEXT    NOT NULL DEFAULT '', -- TIMS(6) Entry Time
  zchanged_by   TEXT    NOT NULL DEFAULT '', -- CHAR(12) Last Changed By
  zchanged_date TEXT    NOT NULL DEFAULT '', -- DATS(8) Changed On
  zchanged_time TEXT    NOT NULL DEFAULT '', -- TIMS(6) Time Changed
  PRIMARY KEY (client, zfi_type)
);
