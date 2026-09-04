DROP INDEX "audit_entity_idx";--> statement-breakpoint
DROP INDEX "audit_actor_idx";--> statement-breakpoint
DROP INDEX "audit_at_idx";--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "seq" bigint NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1);--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id","at","seq");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_log" USING btree ("actor_id","at","seq");--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_log" USING btree ("at","seq");