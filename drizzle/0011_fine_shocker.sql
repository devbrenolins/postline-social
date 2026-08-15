ALTER TABLE "inbox_items" ADD COLUMN "social_account_id" uuid;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "external_id" varchar(80);--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "external_media_id" varchar(80);--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "permalink" text;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_external_idx" ON "inbox_items" USING btree ("workspace_id","external_id");