import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Metadatos base del sistema para verificar conectividad, migraciones y esquema inicial.
 * Todas las entidades financieras de V1 se añadirán en Seeds posteriores sobre este schema.
 */
export const systemMeta = pgTable("system_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
