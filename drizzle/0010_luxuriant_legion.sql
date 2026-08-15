CREATE TABLE "analytics_breakdowns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"social_account_id" uuid NOT NULL,
	"platform" varchar(24) NOT NULL,
	"day" date NOT NULL,
	"metric" varchar(40) NOT NULL,
	"dimension" varchar(40) NOT NULL,
	"label" varchar(160) NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_daily" ADD COLUMN "profile_views" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_daily" ADD COLUMN "website_clicks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_daily" ADD COLUMN "accounts_engaged" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_daily" ADD COLUMN "total_interactions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_daily" ADD COLUMN "replies" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_daily" ADD COLUMN "follower_delta" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "publish_options" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "analytics_breakdowns" ADD CONSTRAINT "analytics_breakdowns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_breakdowns" ADD CONSTRAINT "analytics_breakdowns_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "breakdown_unique_idx" ON "analytics_breakdowns" USING btree ("social_account_id","day","metric","dimension","label");--> statement-breakpoint
CREATE INDEX "breakdown_workspace_day_idx" ON "analytics_breakdowns" USING btree ("workspace_id","day");