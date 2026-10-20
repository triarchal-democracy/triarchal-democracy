CREATE TABLE `sustainability_snapshots` (
	`community_id` integer PRIMARY KEY NOT NULL,
	`computed_at` integer NOT NULL,
	`result` text NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `communities` ADD `founder_id` integer REFERENCES members(id);