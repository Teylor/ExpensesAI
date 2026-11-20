import {
  boolean,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    accountType: text("account_type").notNull(),
    currency: text("currency").notNull(),
    initialBalance: numeric("initial_balance", { precision: 20, scale: 8 })
      .notNull()
      .default("0"),
    currentBalance: numeric("current_balance", { precision: 20, scale: 8 })
      .notNull()
      .default("0"),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("accounts_user_archived_idx").on(table.userId, table.isArchived),
  ],
);
