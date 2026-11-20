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
    /** V2-03 hooks for per-asset opt-in price tracking & purchase date/price */
    symbol: text("symbol"),
    quantity: numeric("quantity", { precision: 20, scale: 8 }),
    purchasedAt: text("purchased_at"),
    purchasePrice: numeric("purchase_price", { precision: 20, scale: 8 }),
    trackPrice: boolean("track_price").notNull().default(false),
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
    /** V2-03 hooks for per-asset opt-in price tracking (e.g., specific Magic card) & purchase date/price */
    purchasedAt: text("purchased_at"),
    purchasePrice: numeric("purchase_price", { precision: 20, scale: 8 }),
    trackPrice: boolean("track_price").notNull().default(false),
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
