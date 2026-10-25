-- audit_logs is append-only: rows can be added, never changed or removed (docs/permissions.md §6 rule 7).
-- The function refuses every UPDATE, DELETE and TRUNCATE, so a bug in the app, a stray query or a
-- mistyped command in a SQL console cannot rewrite history. (A database owner can still drop the
-- trigger on purpose; this stops accidents and application bugs, not a determined owner.)
-- The same function is reused for task_events in Slice 3.
CREATE FUNCTION "reject_append_only_change"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "audit_logs_no_update_or_delete"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION "reject_append_only_change"();--> statement-breakpoint
CREATE TRIGGER "audit_logs_no_truncate"
BEFORE TRUNCATE ON "audit_logs"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_append_only_change"();
