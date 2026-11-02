-- ZSGTRMTR_FIELDS — Field names (SAP DDIC, client-dependent). One row per field of the Deal ID Details list the Limit Management
-- dashboard (ZSGTSFP021) shows: ZFIELD is the field, ZNAME its name. The program reads it to build that list's field catalog.
-- Schema: supplied SLC_SAP_METADATA_V2_1_trmtr_fields.json (DS4 / client 100, 21 October 2026).
-- Column names are SAP's, lower-cased. CLNT / CHAR / DATS / TIMS stay TEXT; only the DDIC key fields are NOT NULL.
CREATE TABLE zsgtrmtr_fields (
  client        TEXT NOT NULL CHECK (length(client) <= 3),                       -- CLNT(3) Client
  zfield        TEXT NOT NULL CHECK (length(zfield) <= 30),                      -- CHAR(30) Field
  zname         TEXT NOT NULL DEFAULT '' CHECK (length(zname) <= 30),            -- CHAR(30) Name
  created_by    TEXT NOT NULL DEFAULT '' CHECK (length(created_by) <= 12),       -- CHAR(12) Entered By
  created_date  TEXT NOT NULL DEFAULT '' CHECK (length(created_date) <= 8),      -- DATS(8) Entered On
  created_time  TEXT NOT NULL DEFAULT '' CHECK (length(created_time) <= 6),      -- TIMS(6) Entry Time
  changed_by    TEXT NOT NULL DEFAULT '' CHECK (length(changed_by) <= 12),       -- CHAR(12) Last Changed By
  changed_date  TEXT NOT NULL DEFAULT '' CHECK (length(changed_date) <= 8),      -- DATS(8) Changed On
  changed_time  TEXT NOT NULL DEFAULT '' CHECK (length(changed_time) <= 6),      -- TIMS(6) Time Changed
  PRIMARY KEY (client, zfield)
);
