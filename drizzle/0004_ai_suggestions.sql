CREATE TYPE "public"."ai_outcome" AS ENUM('pending', 'accepted', 'edited', 'discarded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ai_suggestion_kind" AS ENUM('breakdown', 'summary');--> statement-breakpoint
CREATE TYPE "public"."ai_timeframe" AS ENUM('week', 'month');--> statement-breakpoint
CREATE TABLE "ai_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid,
	"kind" "ai_suggestion_kind" NOT NULL,
	"timeframe" "ai_timeframe",
	"timeframe_start" date,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"output_raw" text,
	"output_valid" boolean DEFAULT false NOT NULL,
	"latency_ms" integer,
	"items_suggested" integer,
	"items_kept" integer,
	"outcome" "ai_outcome" DEFAULT 'pending' NOT NULL,
	"rating" smallint,
	"feedback_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "ai_suggestions_kind_shape" CHECK ((
        ("ai_suggestions"."kind" = 'summary'
          AND "ai_suggestions"."timeframe" IS NOT NULL
          AND "ai_suggestions"."timeframe_start" IS NOT NULL
          AND "ai_suggestions"."task_id" IS NULL)
        OR
        ("ai_suggestions"."kind" = 'breakdown'
          AND "ai_suggestions"."task_id" IS NOT NULL
          AND "ai_suggestions"."timeframe" IS NULL
          AND "ai_suggestions"."timeframe_start" IS NULL)
      )),
	CONSTRAINT "ai_suggestions_rating_range" CHECK ("ai_suggestions"."rating" IS NULL OR "ai_suggestions"."rating" BETWEEN 1 AND 5),
	CONSTRAINT "ai_suggestions_resolved_pair" CHECK (("ai_suggestions"."outcome" = 'pending') = ("ai_suggestions"."resolved_at" IS NULL)),
	CONSTRAINT "ai_suggestions_resolved_after_created" CHECK ("ai_suggestions"."resolved_at" IS NULL OR "ai_suggestions"."resolved_at" >= "ai_suggestions"."created_at"),
	CONSTRAINT "ai_suggestions_failed_not_valid" CHECK ("ai_suggestions"."outcome" <> 'failed' OR "ai_suggestions"."output_valid" = false),
	CONSTRAINT "ai_suggestions_saved_is_valid" CHECK ("ai_suggestions"."outcome" NOT IN ('accepted', 'edited') OR "ai_suggestions"."output_valid" = true),
	CONSTRAINT "ai_suggestions_kept_only_when_saved" CHECK ("ai_suggestions"."items_kept" IS NULL OR "ai_suggestions"."outcome" IN ('accepted', 'edited')),
	CONSTRAINT "ai_suggestions_accepted_kept_all" CHECK ("ai_suggestions"."outcome" <> 'accepted' OR "ai_suggestions"."items_kept" = "ai_suggestions"."items_suggested"),
	CONSTRAINT "ai_suggestions_feedback_after_saving" CHECK (("ai_suggestions"."rating" IS NULL AND "ai_suggestions"."feedback_text" IS NULL) OR "ai_suggestions"."outcome" IN ('accepted', 'edited')),
	CONSTRAINT "ai_suggestions_latency_not_negative" CHECK ("ai_suggestions"."latency_ms" IS NULL OR "ai_suggestions"."latency_ms" >= 0),
	CONSTRAINT "ai_suggestions_items_not_negative" CHECK (("ai_suggestions"."items_suggested" IS NULL OR "ai_suggestions"."items_suggested" >= 0) AND ("ai_suggestions"."items_kept" IS NULL OR "ai_suggestions"."items_kept" >= 0)),
	CONSTRAINT "ai_suggestions_kept_within_suggested" CHECK ("ai_suggestions"."items_kept" IS NULL OR "ai_suggestions"."items_suggested" IS NULL OR "ai_suggestions"."items_kept" <= "ai_suggestions"."items_suggested"),
	CONSTRAINT "ai_suggestions_feedback_not_blank" CHECK ("ai_suggestions"."feedback_text" IS NULL OR length(btrim("ai_suggestions"."feedback_text")) > 0),
	CONSTRAINT "ai_suggestions_feedback_length" CHECK ("ai_suggestions"."feedback_text" IS NULL OR length("ai_suggestions"."feedback_text") <= 500)
);
--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_suggestions_user_kind_created_idx" ON "ai_suggestions" USING btree ("user_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "ai_suggestions_task_idx" ON "ai_suggestions" USING btree ("task_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_ai_suggestion_id_ai_suggestions_id_fk" FOREIGN KEY ("ai_suggestion_id") REFERENCES "public"."ai_suggestions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_source_matches_suggestion" CHECK (("tasks"."source" = 'ai_breakdown') = ("tasks"."ai_suggestion_id" IS NOT NULL));