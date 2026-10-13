-- ZSGTSFTR_DMS_TYP — DMS Customized Data: the document types offered per DMS category (SAP DDIC, client-dependent).
-- Generated from the DDIC export of DS4 / 100 (schemaVersion 2.1). One row per ZDMS_CAT + ZDMS_TYPE: the slots the
-- Deal ID documents panel (shared/fx/DealDmsModal, category 10) shows, with their description and the number range
-- object / interval the custom DMS code is drawn from. This SQLite table is the source of those rows.
-- Column names are SAP's, lower-cased; DATS / TIMS stay 8-char / 6-char text as in SAP.
CREATE TABLE zsgtsftr_dms_typ (
  client        TEXT    NOT NULL,            -- CLNT(3) Client
  zdms_cat      TEXT    NOT NULL,            -- CHAR(2) DMS Category
  zdms_type     TEXT    NOT NULL,            -- CHAR(3) DMS Type
  zdms_desc     TEXT    NOT NULL DEFAULT '', -- CHAR(100) DMS Type Description
  zdms_dtype    TEXT    NOT NULL DEFAULT '', -- CHAR(3) Document Type (DOKAR)
  zdms_ddesc    TEXT    NOT NULL DEFAULT '', -- CHAR(20) Description of Document Type
  zshort_desc   TEXT    NOT NULL DEFAULT '', -- CHAR(50) Short Desc
  zdms_obj      TEXT    NOT NULL DEFAULT '', -- CHAR(10) Name of number range object
  zdms_range    TEXT    NOT NULL DEFAULT '', -- CHAR(2) Number range number
  zdms_from     TEXT    NOT NULL DEFAULT '', -- CHAR(20) From number
  zdms_to       TEXT    NOT NULL DEFAULT '', -- CHAR(20) To number
  zcreated_by   TEXT    NOT NULL DEFAULT '', -- CHAR(12) Entered By
  zcreated_date TEXT    NOT NULL DEFAULT '', -- DATS(8) Entered On
  zcreated_time TEXT    NOT NULL DEFAULT '', -- TIMS(6) Entry Time
  zchanged_by   TEXT    NOT NULL DEFAULT '', -- CHAR(12) Last Changed By
  zchanged_date TEXT    NOT NULL DEFAULT '', -- DATS(8) Changed On
  zchanged_time TEXT    NOT NULL DEFAULT '', -- TIMS(6) Time Changed
  PRIMARY KEY (client, zdms_cat, zdms_type)
);
