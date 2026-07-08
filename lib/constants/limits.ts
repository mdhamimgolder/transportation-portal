/**
 * Safety ceiling for list queries that don't otherwise have a date/week
 * filter narrowing them. Existing filters (week picker, date range) still
 * apply at the database level first -- this just backstops the case where
 * no filter is applied and the table has years of history behind it.
 */
export const MAX_UNFILTERED_ROWS = 1000;
