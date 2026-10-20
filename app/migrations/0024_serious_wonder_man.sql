CREATE TABLE `interim_measure_approvals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`measure_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`approved_at` integer NOT NULL,
	FOREIGN KEY (`measure_id`) REFERENCES `interim_measures`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interim_measure_approvals_measure_id_member_id_unique` ON `interim_measure_approvals` (`measure_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `interim_measures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`moderator_id` integer NOT NULL,
	`target_member_id` integer NOT NULL,
	`kind` text NOT NULL,
	`content_kind` text,
	`content_id` integer,
	`reason` text NOT NULL,
	`report_id` integer NOT NULL,
	`taken_at` integer NOT NULL,
	`lapses_at` integer NOT NULL,
	`extended_at` integer,
	`ended_at` integer,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`moderator_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`report_id`) REFERENCES `conduct_reports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `moderators` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`appointed_by` integer NOT NULL,
	`appointed_at` integer NOT NULL,
	`removed_at` integer,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`appointed_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `proposal_comments` ADD `hidden_measure_id` integer;--> statement-breakpoint
ALTER TABLE `sector_post_comments` ADD `hidden_measure_id` integer;--> statement-breakpoint
ALTER TABLE `sector_posts` ADD `hidden_measure_id` integer;