CREATE TABLE `proposal_delegation_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`proposal_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`to_member_id` integer NOT NULL,
	`sector_id` integer,
	`granted_at` integer NOT NULL,
	`captured_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sector_id`) REFERENCES `sectors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proposal_delegation_snapshots_proposal_id_member_id_to_member_id_sector_id_unique` ON `proposal_delegation_snapshots` (`proposal_id`,`member_id`,`to_member_id`,`sector_id`);