ALTER TABLE "ai_generations" ADD COLUMN "input_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "output_tokens" integer DEFAULT 0 NOT NULL;