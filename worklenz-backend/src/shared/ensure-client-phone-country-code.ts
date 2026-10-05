import db from "../config/db";

let ensured: Promise<void> | null = null;

const ADD_PHONE_COUNTRY_CODE_SQL = `
  ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS phone_country_code CHAR(2);
`;

/**
 * Client create and list select phone_country_code. The running database is
 * not migrated on container start, so add the column the first time it is used.
 */
export function ensureClientPhoneCountryCode(): Promise<void> {
  if (!ensured) {
    ensured = db.query(ADD_PHONE_COUNTRY_CODE_SQL).then(() => undefined).catch(error => {
      ensured = null;
      throw error;
    });
  }
  return ensured;
}
