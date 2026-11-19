import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";
import { categories } from "./transactions.js";
import { users } from "./users.js";

export const recurringRules = pgTable(
  "recurring_rules",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Kind: income | expense */
    kind: text("kind").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    amount: numeric("amount", { precision: 20, scale: 8 }).notNull(),
    currency: text("currency").notNull(),
    /** Frequency: daily | weekly | monthly | quarterly | yearly */
    frequency: text("frequency").notNull(),
    dayOfMonth: integer("day_of_month"),
    dayOfWeek: integer("day_of_week"),
    description: text("description").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    lastTriggeredLocalDate: text("last_triggered_local_date"),
    nextDueLocalDate: text("next_due_local_date").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("recurring_rules_user_active_idx").on(table.userId, table.isActive),
    index("recurring_rules_next_due_idx").on(
      table.isActive,
      table.nextDueLocalDate,
    ),
  ],
);
