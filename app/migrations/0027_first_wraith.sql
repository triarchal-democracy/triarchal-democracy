CREATE TABLE `concentration_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`sector_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`proposal_id` integer NOT NULL,
	`opened_at` integer NOT NULL,
	`supporters` integer NOT NULL,
	`share_pct` real NOT NULL,
	`resolved_at` integer,
	`outcome` text,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sector_id`) REFERENCES `sectors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE no action
);
