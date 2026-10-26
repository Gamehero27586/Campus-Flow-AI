CREATE TYPE "public"."deleted_reason" AS ENUM('user_deleted', 'recipient_removed', 'assignment_cancelled');--> statement-breakpoint
CREATE TYPE "public"."estimate_source" AS ENUM('user', 'history', 'ai');--> statement-breakpoint
CREATE TYPE "public"."task_category" AS ENUM('assignment', 'study', 'project', 'reading', 'other');--> statement-breakpoint
CREATE TYPE "public"."task_context" AS ENUM('personal', 'assignment', 'team');--> statement-breakpoint
CREATE TYPE "public"."task_event_type" AS ENUM('created', 'status_changed', 'deadline_changed', 'reopened', 'deleted', 'restored', 'resubmission_granted', 'reassigned', 'start_backfilled');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."task_source" AS ENUM('manual', 'ai_breakdown');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'done');--> statement-breakpoint
CREATE TABLE "task_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"event_type" "task_event_type" NOT NULL,
	"from_value" text,
	"to_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"context" "task_context" NOT NULL,
	"created_by" uuid NOT NULL,
	"assignee_id" uuid,
	"assignment_id" uuid,
	"team_id" uuid,
	"parent_task_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"category" "task_category" NOT NULL,
	"category_other" text,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"source" "task_source" DEFAULT 'manual' NOT NULL,
	"ai_suggestion_id" uuid,
	"deadline" timestamp with time zone,
	"original_deadline" timestamp with time zone,
	"reschedule_count" integer DEFAULT 0 NOT NULL,
	"estimate_minutes" integer,
	"estimate_source" "estimate_source",
	"resubmission_until" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"deleted_reason" "deleted_reason",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_context_shape" CHECK ((
        ("tasks"."context" = 'personal'
          AND "tasks"."assignee_id" IS NOT NULL
          AND "tasks"."assignee_id" = "tasks"."created_by"
          AND "tasks"."assignment_id" IS NULL
          AND "tasks"."team_id" IS NULL)
        OR
        ("tasks"."context" = 'assignment'
          AND "tasks"."assignee_id" IS NOT NULL
          AND "tasks"."assignment_id" IS NOT NULL
          AND "tasks"."team_id" IS NULL)
        OR
        ("tasks"."context" = 'team'
          AND "tasks"."team_id" IS NOT NULL
          AND "tasks"."assignment_id" IS NULL)
      )),
	CONSTRAINT "tasks_done_has_completed_at" CHECK (("tasks"."status" = 'done') = ("tasks"."completed_at" IS NOT NULL)),
	CONSTRAINT "tasks_category_other_label" CHECK (("tasks"."category" = 'other') = ("tasks"."category_other" IS NOT NULL)),
	CONSTRAINT "tasks_deleted_pair" CHECK (("tasks"."deleted_at" IS NULL) = ("tasks"."deleted_reason" IS NULL)),
	CONSTRAINT "tasks_started_before_completed" CHECK ("tasks"."started_at" IS NULL OR "tasks"."completed_at" IS NULL OR "tasks"."started_at" <= "tasks"."completed_at"),
	CONSTRAINT "tasks_reschedule_count_not_negative" CHECK ("tasks"."reschedule_count" >= 0),
	CONSTRAINT "tasks_estimate_in_range" CHECK ("tasks"."estimate_minutes" IS NULL OR "tasks"."estimate_minutes" BETWEEN 1 AND 6000),
	CONSTRAINT "tasks_started_after_created" CHECK ("tasks"."started_at" IS NULL OR "tasks"."started_at" >= "tasks"."created_at"),
	CONSTRAINT "tasks_completed_after_created" CHECK ("tasks"."completed_at" IS NULL OR "tasks"."completed_at" >= "tasks"."created_at"),
	CONSTRAINT "tasks_estimate_has_source" CHECK (("tasks"."estimate_minutes" IS NULL) = ("tasks"."estimate_source" IS NULL)),
	CONSTRAINT "tasks_resubmission_only_assignment" CHECK ("tasks"."resubmission_until" IS NULL OR "tasks"."context" = 'assignment'),
	CONSTRAINT "tasks_deadline_has_original" CHECK ("tasks"."deadline" IS NULL OR "tasks"."original_deadline" IS NOT NULL),
	CONSTRAINT "tasks_title_not_blank" CHECK (length(btrim("tasks"."title")) > 0),
	CONSTRAINT "tasks_category_other_not_blank" CHECK ("tasks"."category_other" IS NULL OR length(btrim("tasks"."category_other")) > 0),
	CONSTRAINT "tasks_personal_delete_reason" CHECK ("tasks"."context" <> 'personal' OR "tasks"."deleted_reason" IS NULL OR "tasks"."deleted_reason" = 'user_deleted'),
	CONSTRAINT "tasks_not_its_own_parent" CHECK ("tasks"."parent_task_id" IS NULL OR "tasks"."parent_task_id" <> "tasks"."id")
);
--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_tasks_id_fk" FOREIGN KEY ("parent_task_id") REFERENCES "public"."tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_events_task_created_idx" ON "task_events" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_one_assignment_task_per_student" ON "tasks" USING btree ("assignment_id","assignee_id") WHERE "tasks"."parent_task_id" IS NULL;--> statement-breakpoint
CREATE INDEX "tasks_assignee_deadline_idx" ON "tasks" USING btree ("assignee_id","deadline");--> statement-breakpoint
CREATE INDEX "tasks_parent_idx" ON "tasks" USING btree ("parent_task_id");--> statement-breakpoint
CREATE INDEX "tasks_assignment_idx" ON "tasks" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "tasks_team_idx" ON "tasks" USING btree ("team_id");--> statement-breakpoint
-- task_events is append-only, like audit_logs (migration 0002): the same function refuses every
-- UPDATE, DELETE and TRUNCATE (docs/data-model.md §4, CLAUDE.md security rule 8).
CREATE TRIGGER "task_events_no_update_or_delete"
BEFORE UPDATE OR DELETE ON "task_events"
FOR EACH ROW EXECUTE FUNCTION "reject_append_only_change"();--> statement-breakpoint
CREATE TRIGGER "task_events_no_truncate"
BEFORE TRUNCATE ON "task_events"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_append_only_change"();
