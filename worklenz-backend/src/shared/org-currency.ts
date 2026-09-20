import db from "../config/db";
import { DEFAULT_CURRENCY } from "./brand";

export async function getOrgBaseCurrency(teamId: string | undefined | null): Promise<string> {
  if (!teamId) return DEFAULT_CURRENCY;

  try {
    const result = await db.query(
      `SELECT COALESCE(NULLIF(TRIM(o.base_currency), ''), $2) AS base_currency
       FROM organizations o
       INNER JOIN teams t ON (t.user_id = o.user_id OR t.organization_id = o.id)
       WHERE t.id = $1
       LIMIT 1`,
      [teamId, DEFAULT_CURRENCY]
    );
    return String(result.rows[0]?.base_currency || DEFAULT_CURRENCY).toUpperCase();
  } catch {
    return DEFAULT_CURRENCY;
  }
}
