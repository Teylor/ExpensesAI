import {
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const investments = pgTable(
  "investments",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** User-editable category name (e.g., Crypto, Acciones, ETF, Fondos, custom) */
    assetType: text("asset_type").notNull(),
    name: text("name").notNull(),
    /** V2-03 hook for live market price feeds */
    symbol: text("symbol"),
    quantity: numeric("quantity", { precision: 20, scale: 8 }),
    investedAmount: numeric("invested_amount", {
      precision: 20,
      scale: 8,
    }).notNull(),
    currentValue: numeric("current_value", {
      precision: 20,
      scale: 8,
    }).notNull(),
    currency: text("currency").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("investments_user_idx").on(table.userId)],
);

export const netWorthItems = pgTable(
  "net_worth_items",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Kind: asset | liability */
    kind: text("kind").notNull(),
    /** User-editable category name (e.g., Inmuebles, Vehículos, Cartas, Hipoteca, custom) */
    category: text("category").notNull(),
    name: text("name").notNull(),
    estimatedValue: numeric("estimated_value", {
      precision: 20,
      scale: 8,
    }).notNull(),
    currency: text("currency").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("net_worth_items_user_idx").on(table.userId)],
);
