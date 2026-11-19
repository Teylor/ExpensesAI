import {
  index,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const fxRates = pgTable(
  "fx_rates",
  {
    pivotCurrency: text("pivot_currency").notNull(),
    quoteCurrency: text("quote_currency").notNull(),
    rate: numeric("rate", { precision: 20, scale: 8 }).notNull(),
    rateDate: text("rate_date").notNull(),
    provider: text("provider").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.pivotCurrency, table.quoteCurrency, table.rateDate],
    }),
    index("fx_rates_pivot_date_idx").on(table.pivotCurrency, table.rateDate),
  ],
);
