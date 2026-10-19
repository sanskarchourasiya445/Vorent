CREATE TABLE IF NOT EXISTS "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"status" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payment_orders' AND column_name = 'payer_id') THEN
    ALTER TABLE "payment_orders" ADD COLUMN "payer_id" text;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_events_type_idx" ON "webhook_events" USING btree ("event_type","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_events_resource_idx" ON "webhook_events" USING btree ("resource_id");
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkout_proposals_consumed_nonce_id_unique') THEN
    ALTER TABLE "checkout_proposals" ADD CONSTRAINT "checkout_proposals_consumed_nonce_id_unique" UNIQUE("consumed_nonce_id");
  END IF;
END $$;