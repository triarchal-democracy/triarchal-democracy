CREATE TABLE `conduct_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`reported_by` integer NOT NULL,
	`accused_id` integer NOT NULL,
	`provision` text NOT NULL,
	`statement` text NOT NULL,
	`evidence_link` text,
	`contribution_ids_json` text,
	`filed_at` integer NOT NULL,
	`panel_id` integer,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reported_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`accused_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`panel_id`) REFERENCES `dispute_panels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `member_sanctions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`panel_id` integer NOT NULL,
	`kind` text NOT NULL,
	`step` integer NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`panel_id`) REFERENCES `dispute_panels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `contributions` ADD `voided_at` integer;--> statement-breakpoint
ALTER TABLE `dispute_panel_votes` ADD `step` integer;--> statement-breakpoint
ALTER TABLE `dispute_panel_votes` ADD `reasoning` text;--> statement-breakpoint
ALTER TABLE `dispute_panel_votes` ADD `bad_faith` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `dispute_panels` ADD `sanction_step` integer;--> statement-breakpoint
ALTER TABLE `dispute_panels` ADD `bad_faith_finding` integer DEFAULT 0 NOT NULL;