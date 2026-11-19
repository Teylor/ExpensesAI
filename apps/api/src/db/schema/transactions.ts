import {
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";
import { users } from "./users.js";

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Scope: income | expense | investment | networth */
    scope: text("scope").notNull(),
    name: text("name").notNull(),
    icon: text("icon"),
    color: text("color"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("categories_user_scope_idx").on(table.userId, table.scope)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Kind: income | expense | transfer */
    kind: text("kind").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    destinationAccountId: uuid("destination_account_id").references(
      () => accounts.id,
    ),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    amount: numeric("amount", { precision: 20, scale: 8 }).notNull(),
    currency: text("currency").notNull(),
    destinationAmount: numeric("destination_amount", {
      precision: 20,
      scale: 8,
    }),
    destinationCurrency: text("destination_currency"),
    fxRateToBase: numeric("fx_rate_to_base", { precision: 20, scale: 8 }),
    occurredAtUtc: timestamp("occurred_at_utc", {
      withTimezone: true,
    }).notNull(),
    localDate: text("local_date").notNull(),
    timezone: text("timezone").notNull(),
    description: text("description").notNull(),
    clientOrPayee: text("client_or_payee"),
    /** Origin hook for V1 & V2: manual | agent | recurring | csv_import | bank_sync */
    source: text("source").notNull().default("manual"),
    /** External bank/CSV idempotency key for V2-01 / V2-02 */
    externalId: text("external_id"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("transactions_user_local_date_idx").on(table.userId, table.localDate),
    index("transactions_user_account_idx").on(table.userId, table.accountId),
    index("transactions_user_external_idx").on(table.userId, table.externalId),
  ],
);
