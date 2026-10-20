CREATE TABLE `minority_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`proposal_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`body` text NOT NULL,
	`filed_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `minority_reports_proposal_id_member_id_unique` ON `minority_reports` (`proposal_id`,`member_id`);--> statement-breakpoint
ALTER TABLE `delegate_recognitions` ADD `below_trigger_since` integer;--> statement-breakpoint
ALTER TABLE `delegate_recognitions` ADD `co_delegate_of_id` integer;