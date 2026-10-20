CREATE TABLE `dispute_draw_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`subject_kind` text NOT NULL,
	`subject_id` integer NOT NULL,
	`panel_id` integer,
	`seq` integer DEFAULT 0 NOT NULL,
	`seats` integer NOT NULL,
	`requested_at` integer NOT NULL,
	`parties_json` text NOT NULL,
	`disputed_contribution_id` integer,
	`beacon_round` integer,
	`deferral_reason` text,
	`completed_at` integer,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`panel_id`) REFERENCES `dispute_panels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `dispute_panel_draws` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`panel_id` integer NOT NULL,
	`request_id` integer NOT NULL,
	`kind` text NOT NULL,
	`method` text NOT NULL,
	`beacon_chain` text NOT NULL,
	`beacon_round` integer NOT NULL,
	`beacon_randomness` text NOT NULL,
	`case_key` text NOT NULL,
	`seed` text NOT NULL,
	`pool_json` text NOT NULL,
	`drawn_json` text NOT NULL,
	`drawn_at` integer NOT NULL,
	FOREIGN KEY (`panel_id`) REFERENCES `dispute_panels`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`request_id`) REFERENCES `dispute_draw_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `dispute_panel_members` ADD `declined_at` integer;