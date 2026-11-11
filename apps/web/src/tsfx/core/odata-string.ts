/** An OData string literal: quoted, with single quotes doubled. Neutral (no SAP code), so the BackEnd's list queries can use it. */
export const odataString = (v: unknown): string => `'${String(v ?? '').replace(/'/g, "''")}'`;
