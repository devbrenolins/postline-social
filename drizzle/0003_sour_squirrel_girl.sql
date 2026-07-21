ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "provider" varchar(24) DEFAULT 'meta';--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "external_id" varchar(64);--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "page_id" varchar(64);--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "access_token" text;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "scopes" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auth_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_url" text;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_external_idx" ON "social_accounts" USING btree ("workspace_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_auth_id_idx" ON "users" USING btree ("auth_id");