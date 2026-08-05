ALTER TABLE "direct_automations" ADD COLUMN "post_id" uuid;--> statement-breakpoint
ALTER TABLE "direct_automations" ADD CONSTRAINT "direct_automations_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "direct_automations_post_idx" ON "direct_automations" USING btree ("post_id");