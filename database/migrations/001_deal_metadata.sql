-- Application-specific data attached to an SAP transaction.
-- SAP/OData owns the transaction itself; this row only carries what SAP has no field for.
-- Linked to SAP by its business key (company code + financial transaction), never by SQLite's id.
CREATE TABLE deal_metadata (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  company_code       TEXT NOT NULL,
  transaction_id     TEXT NOT NULL,
  product_type       TEXT,
  strategy           TEXT,
  internal_reference TEXT,
  remark             TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_code, transaction_id)
);

CREATE INDEX idx_deal_metadata_updated_at ON deal_metadata (updated_at DESC);
