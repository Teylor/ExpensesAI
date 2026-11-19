CREATE TABLE "fx_rates" (
	"pivot_currency" text NOT NULL,
	"quote_currency" text NOT NULL,
	"rate" numeric(20, 8) NOT NULL,
	"rate_date" text NOT NULL,
	"provider" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_rates_pivot_currency_quote_currency_rate_date_pk" PRIMARY KEY("pivot_currency","quote_currency","rate_date")
);
--> statement-breakpoint
CREATE INDEX "fx_rates_pivot_date_idx" ON "fx_rates" USING btree ("pivot_currency","rate_date");