ALTER TABLE "workspaces" ALTER COLUMN "plan" SET DEFAULT 'trial';--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "trial_ends_at" timestamp with time zone;