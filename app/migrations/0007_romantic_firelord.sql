CREATE TABLE `official_seats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`jurisdiction` text NOT NULL,
	`seat_label` text NOT NULL,
	`official_name` text,
	`election_seeded_support_pct` real,
	`election_label` text,
	`opted_in` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `members` ADD `seat_kind` text;