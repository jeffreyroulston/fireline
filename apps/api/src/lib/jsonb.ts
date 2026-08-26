import { sql, type RawBuilder } from "kysely";

/**
 * Encode a value for a Postgres `jsonb` column.
 *
 * node-pg serializes JavaScript arrays as Postgres array literals (`{1,2}`),
 * which is invalid for `jsonb`. Always bind JSON text and cast.
 */
export function toJsonb<T>(value: T): RawBuilder<T> {
  return sql`${JSON.stringify(value)}::jsonb`;
}
