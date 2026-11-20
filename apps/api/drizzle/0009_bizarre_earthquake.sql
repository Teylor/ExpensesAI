ALTER TABLE "investments" ADD COLUMN "track_price" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "net_worth_items" ADD COLUMN "purchased_at" text;--> statement-breakpoint
ALTER TABLE "net_worth_items" ADD COLUMN "purchase_price" numeric(20, 8);--> statement-breakpoint
ALTER TABLE "net_worth_items" ADD COLUMN "track_price" boolean DEFAULT false NOT NULL;