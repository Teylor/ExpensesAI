import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const aiConnections = pgTable(
  "ai_connections",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Kind: chatgpt_oauth (Plan Sharing base) | byok (Bring Your Own Key fallback) */
    kind: text("kind").notNull(),
    /** Provider: openai | anthropic | openai_compatible */
    provider: text("provider").notNull(),
    label: text("label").notNull(),
    model: text("model").notNull(),
    baseUrl: text("base_url"),
    /** AES-256-GCM encrypted token or API key payload */
    encryptedCredential: text("encrypted_credential").notNull(),
    /** Masked preview safe for UI display (e.g., "sk-...9a2f" or "ChatGPT Plan") */
    maskedPreview: text("masked_preview").notNull(),
    /** Lower priority number = tried first (1 = Plan Sharing, 2 = BYOK) */
    priority: integer("priority").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("ai_connections_user_priority_idx").on(table.userId, table.priority),
  ],
);

export const aiOauthStates = pgTable(
  "ai_oauth_states",
  {
    /** SHA-256 digest of the random OAuth state parameter */
    stateHash: text("state_hash").primaryKey(),
    /** AES-256-GCM encrypted PKCE code_verifier */
    encryptedCodeVerifier: text("encrypted_code_verifier").notNull(),
    /** Optional userId when linking to an existing Email+Password session */
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("ai_oauth_states_expires_idx").on(table.expiresAt)],
);
