import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const commandLog = pgTable(
  "command_log",
  {
    commandId: uuid("command_id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actor: text("actor").notNull(),
    commandType: text("command_type").notNull(),
    payload: jsonb("payload").notNull(),
    result: jsonb("result").notNull(),
    inversePayload: jsonb("inverse_payload").notNull(),
    undoneAt: timestamp("undone_at", { withTimezone: true }),
    undoneByCommandId: uuid("undone_by_command_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("command_log_user_created_idx").on(table.userId, table.createdAt),
  ],
);
