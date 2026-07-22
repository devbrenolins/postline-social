ALTER TABLE "posts" ALTER COLUMN "metrics" SET DEFAULT '{"likes":0,"comments":0,"shares":0,"saves":0,"reach":0,"views":0,"clicks":0}'::jsonb;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "external_media" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "metrics_synced_at" timestamp with time zone;