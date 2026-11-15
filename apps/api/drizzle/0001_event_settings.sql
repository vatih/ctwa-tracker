CREATE TYPE "public"."event_kind" AS ENUM('standard', 'custom');--> statement-breakpoint
CREATE TABLE "event_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" "event_kind" NOT NULL,
	"name" text NOT NULL,
	"label" text,
	"default_value" bigint,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_settings" ADD CONSTRAINT "event_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_settings_user_name_uq" ON "event_settings" USING btree ("user_id","name");