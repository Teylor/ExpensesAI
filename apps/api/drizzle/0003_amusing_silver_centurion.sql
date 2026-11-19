CREATE TABLE "command_log" (
	"command_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"command_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"inverse_payload" jsonb NOT NULL,
	"undone_at" timestamp with time zone,
	"undone_by_command_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "command_log" ADD CONSTRAINT "command_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "command_log_user_created_idx" ON "command_log" USING btree ("user_id","created_at");