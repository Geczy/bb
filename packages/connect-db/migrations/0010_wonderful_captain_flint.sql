CREATE TABLE `community_merch_address` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`country` text NOT NULL,
	`hat` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `community_survey_response` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`answers` text NOT NULL
);
