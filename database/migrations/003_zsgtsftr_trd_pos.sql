-- ZSGTSFTR_TRD_POS — Trade Invoice Posting Details (SAP DDIC, client-dependent).
-- Generated from SLC_SAP_METADATA_V2_1.json. One row per Deal ID + settlement sequence; it holds the
-- settled / posted flags (ZSET_CHECK, ZPOST_CHECK) and the FI posting fields of the Execute Settlement
-- for Deal ID screen (ZSGTSF_RDEAL_TRD_INV / R060). This SQLite table is the source of those rows.
-- Column names are SAP's, lower-cased. DATS stay 8-char YYYYMMDD and TIMS 6-char HHMMSS text, as in SAP;
-- amounts (CURR 17,2) are NUMERIC.
CREATE TABLE zsgtsftr_trd_pos (
  client       TEXT    NOT NULL,             -- CLNT(3) Client
  zdeal_id     TEXT    NOT NULL,             -- CHAR(15) Deal ID
  zseq         TEXT    NOT NULL,             -- CHAR(2) Sequence
  zbukrs       TEXT    NOT NULL DEFAULT '',  -- CHAR(4) Company Code
  zt_type      TEXT    NOT NULL DEFAULT '',  -- CHAR(4) Trade Type
  zrp          TEXT    NOT NULL DEFAULT '',  -- CHAR(50) Receipt/Payment
  zsell        TEXT    NOT NULL DEFAULT '',  -- CHAR(10) Seller
  zbuy         TEXT    NOT NULL DEFAULT '',  -- CHAR(10) Buyer
  zamt         NUMERIC NOT NULL DEFAULT 0,   -- CURR(17,2) Invoice Amount
  zcurr        TEXT    NOT NULL DEFAULT '',  -- CUKY(5) Invoice Currency
  zdue_date    TEXT    NOT NULL DEFAULT '',  -- DATS(8) Due Date
  zp_date      TEXT    NOT NULL DEFAULT '',  -- DATS(8) Posting Date in the Document
  zd_map       TEXT    NOT NULL DEFAULT '',  -- CHAR(5) FX Deal
  ztrf_type    TEXT    NOT NULL DEFAULT '',  -- CHAR(2) Transfer Type
  zset_type    TEXT    NOT NULL DEFAULT '',  -- CHAR(50) Letter Desc
  zset_desc    TEXT    NOT NULL DEFAULT '',  -- CHAR(120) Settlement Description
  zset_check   TEXT    NOT NULL DEFAULT '',  -- CHAR(1) Settlement Check
  zpost_check  TEXT    NOT NULL DEFAULT '',  -- CHAR(1) Posting Check
  zfi_type     TEXT    NOT NULL DEFAULT '',  -- CHAR(2) Posting Type
  zpost_desc   TEXT    NOT NULL DEFAULT '',  -- CHAR(40) Posting Type Description
  zpay_amt     NUMERIC NOT NULL DEFAULT 0,   -- CURR(17,2) Payment Amount
  zset_curr    TEXT    NOT NULL DEFAULT '',  -- CUKY(5) Pay Currency
  zahlvid      TEXT    NOT NULL DEFAULT '',  -- CHAR(10) Identification of Payment Details (Standing Instructions)
  zhbkid       TEXT    NOT NULL DEFAULT '',  -- CHAR(5) Short Key for a House Bank
  zhktid       TEXT    NOT NULL DEFAULT '',  -- CHAR(5) ID for Account Details
  zbelnr       TEXT    NOT NULL DEFAULT '',  -- CHAR(10) Accounting Document Number
  zrec_hbkid   TEXT    NOT NULL DEFAULT '',  -- CHAR(5) Short Key for a House Bank
  zrec_hktid   TEXT    NOT NULL DEFAULT '',  -- CHAR(5) ID for Account Details
  zdoc_type    TEXT    NOT NULL DEFAULT '',  -- CHAR(2) Document Type
  zdr_pk       TEXT    NOT NULL DEFAULT '',  -- CHAR(2) Posting Key
  zdr_accnt    TEXT    NOT NULL DEFAULT '',  -- CHAR(10) Counterparty
  zdr_acc      TEXT    NOT NULL DEFAULT '',  -- CHAR(2) Component of the Version Number
  zdr_cv       TEXT    NOT NULL DEFAULT '',  -- CHAR(10) Account Number of Supplier
  zdr_prctr    TEXT    NOT NULL DEFAULT '',  -- CHAR(10) Profit Center
  zdr_rbusa    TEXT    NOT NULL DEFAULT '',  -- CHAR(4) Business Area
  zdr_gl       TEXT    NOT NULL DEFAULT '',  -- CHAR(10) General Ledger Account
  zcr_pk       TEXT    NOT NULL DEFAULT '',  -- CHAR(2) Posting Key
  zcr_accnt    TEXT    NOT NULL DEFAULT '',  -- CHAR(10) Counterparty
  zcr_acc      TEXT    NOT NULL DEFAULT '',  -- CHAR(2) Component of the Version Number
  zcr_cv       TEXT    NOT NULL DEFAULT '',  -- CHAR(10) Account Number of Supplier
  zcr_prctr    TEXT    NOT NULL DEFAULT '',  -- CHAR(10) Profit Center
  zcr_rbusa    TEXT    NOT NULL DEFAULT '',  -- CHAR(4) Business Area
  zcr_gl       TEXT    NOT NULL DEFAULT '',  -- CHAR(10) General Ledger Account
  zmsg         TEXT    NOT NULL DEFAULT '',  -- CHAR(80) Type Description
  zexe_co      TEXT    NOT NULL DEFAULT '',  -- CHAR(1) Sett Complete (Execution)
  zacc_co      TEXT    NOT NULL DEFAULT '',  -- CHAR(1) Sett Complete (Accounting)
  zcreated_by  TEXT    NOT NULL DEFAULT '',  -- CHAR(12) Entered By
  zcreated_date TEXT    NOT NULL DEFAULT '', -- DATS(8) Entered On
  zcreated_time TEXT    NOT NULL DEFAULT '', -- TIMS(6) Entry Time
  zchanged_by  TEXT    NOT NULL DEFAULT '',  -- CHAR(12) Last Changed By
  zchanged_date TEXT    NOT NULL DEFAULT '', -- DATS(8) Changed On
  zchanged_time TEXT    NOT NULL DEFAULT '', -- TIMS(6) Time Changed
  PRIMARY KEY (client, zdeal_id, zseq)
);

CREATE INDEX idx_zsgtsftr_trd_pos_deal ON zsgtsftr_trd_pos (zdeal_id);
