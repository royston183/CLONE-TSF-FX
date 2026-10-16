-- ZSGTSFTR_SET_FX: FX Models / Settlement Data - FX Deals.
-- Schema: supplied SET_FX.json (DS4 / client 100, 16 October 2026).
-- Preserve SAP CHAR, CUKY, DATS and TIMS as text, including leading zeroes and blanks.
CREATE TABLE zsgtsftr_set_fx (
  client        TEXT NOT NULL CHECK (length(client) <= 3),
  zmod_id       TEXT NOT NULL CHECK (length(zmod_id) <= 10),
  zd_map        TEXT NOT NULL CHECK (length(zd_map) <= 5),
  zbs           TEXT NOT NULL CHECK (length(zbs) <= 1),
  zt_type       TEXT NOT NULL DEFAULT '' CHECK (length(zt_type) <= 4),
  zmod_desc     TEXT NOT NULL DEFAULT '' CHECK (length(zmod_desc) <= 40),
  zbukrs        TEXT NOT NULL DEFAULT '' CHECK (length(zbukrs) <= 4),
  zdss_deal     TEXT NOT NULL DEFAULT '' CHECK (length(zdss_deal) <= 10),
  zcurr         TEXT NOT NULL DEFAULT '' CHECK (length(zcurr) <= 5),
  zrbukrs       TEXT NOT NULL DEFAULT '' CHECK (length(zrbukrs) <= 4),
  zbank_id      TEXT NOT NULL DEFAULT '' CHECK (length(zbank_id) <= 4),
  zpay_id       TEXT NOT NULL DEFAULT '' CHECK (length(zpay_id) <= 10),
  zacc          TEXT NOT NULL DEFAULT '' CHECK (length(zacc) <= 2),
  zseq          TEXT NOT NULL DEFAULT '' CHECK (length(zseq) <= 2),
  ztrf_type     TEXT NOT NULL DEFAULT '' CHECK (length(ztrf_type) <= 2),
  zlet_code     TEXT NOT NULL DEFAULT '' CHECK (length(zlet_code) <= 4),
  zlet_name     TEXT NOT NULL DEFAULT '' CHECK (length(zlet_name) <= 30),
  zset_type     TEXT NOT NULL DEFAULT '' CHECK (length(zset_type) <= 50),
  zset_desc     TEXT NOT NULL DEFAULT '' CHECK (length(zset_desc) <= 120),
  zcreated_by   TEXT NOT NULL DEFAULT '' CHECK (length(zcreated_by) <= 12),
  zcreated_date TEXT NOT NULL DEFAULT '' CHECK (length(zcreated_date) <= 8),
  zcreated_time TEXT NOT NULL DEFAULT '' CHECK (length(zcreated_time) <= 6),
  zchanged_by   TEXT NOT NULL DEFAULT '' CHECK (length(zchanged_by) <= 12),
  zchanged_date TEXT NOT NULL DEFAULT '' CHECK (length(zchanged_date) <= 8),
  zchanged_time TEXT NOT NULL DEFAULT '' CHECK (length(zchanged_time) <= 6),
  PRIMARY KEY (client, zmod_id, zd_map, zbs)
);
