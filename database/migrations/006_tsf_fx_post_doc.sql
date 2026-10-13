-- TSF_FX_POST_DOC — the FI documents of an FX deal leg's TBB1 posting (BO: Post Accounting Entries for Settlement).
-- Not a SAP table: SAP keeps the documents in BKPF, which has no middleware resource, and PostFlows returns them only
-- in its answer. BO stores that answer here so FI Doc 1 / 2 show after a reload. One row per company code + financial
-- transaction; every number is one SAP returned, never made up.
CREATE TABLE tsf_fx_post_doc (
  client        TEXT    NOT NULL,            -- CLNT(3) Client
  zbukrs        TEXT    NOT NULL,            -- CHAR(4) Company Code
  zrfha         TEXT    NOT NULL,            -- CHAR(13) Financial Transaction
  zdoc1         TEXT    NOT NULL DEFAULT '', -- CHAR(10) FI Doc 1 (BELNR)
  zgjahr1       TEXT    NOT NULL DEFAULT '', -- NUMC(4) Fiscal Year of Doc 1
  zdoc2         TEXT    NOT NULL DEFAULT '', -- CHAR(10) FI Doc 2 (BELNR)
  zgjahr2       TEXT    NOT NULL DEFAULT '', -- NUMC(4) Fiscal Year of Doc 2
  zmsg          TEXT    NOT NULL DEFAULT '', -- CHAR(255) Posting message
  zcreated_by   TEXT    NOT NULL DEFAULT '', -- CHAR(12) Entered By
  zcreated_date TEXT    NOT NULL DEFAULT '', -- DATS(8) Entered On
  zcreated_time TEXT    NOT NULL DEFAULT '', -- TIMS(6) Entry Time
  zchanged_by   TEXT    NOT NULL DEFAULT '', -- CHAR(12) Last Changed By
  zchanged_date TEXT    NOT NULL DEFAULT '', -- DATS(8) Changed On
  zchanged_time TEXT    NOT NULL DEFAULT '', -- TIMS(6) Time Changed
  PRIMARY KEY (client, zbukrs, zrfha)
);
