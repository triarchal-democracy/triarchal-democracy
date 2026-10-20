CREATE TABLE `contribution_sectors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contribution_id` integer NOT NULL,
	`sector_id` integer NOT NULL,
	FOREIGN KEY (`contribution_id`) REFERENCES `contributions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sector_id`) REFERENCES `sectors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contribution_sectors_contribution_id_sector_id_unique` ON `contribution_sectors` (`contribution_id`,`sector_id`);--> statement-breakpoint
CREATE TABLE `critical_petition_signatures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`proposal_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`signed_at` integer NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `critical_petition_signatures_proposal_id_member_id_unique` ON `critical_petition_signatures` (`proposal_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `delegate_recognitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`sector_id` integer NOT NULL,
	`position_decision_proposal_id` integer NOT NULL,
	`recognized_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sector_id`) REFERENCES `sectors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`position_decision_proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `member_sector_follows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`sector_id` integer NOT NULL,
	`followed_at` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sector_id`) REFERENCES `sectors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_sector_follows_member_id_sector_id_unique` ON `member_sector_follows` (`member_id`,`sector_id`);--> statement-breakpoint
CREATE TABLE `opportunities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`posted_by` integer NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`domain` text,
	`posted_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`posted_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `opportunity_sectors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`opportunity_id` integer NOT NULL,
	`sector_id` integer NOT NULL,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sector_id`) REFERENCES `sectors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `opportunity_sectors_opportunity_id_sector_id_unique` ON `opportunity_sectors` (`opportunity_id`,`sector_id`);--> statement-breakpoint
CREATE TABLE `proposal_sectors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`proposal_id` integer NOT NULL,
	`sector_id` integer NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sector_id`) REFERENCES `sectors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proposal_sectors_proposal_id_sector_id_unique` ON `proposal_sectors` (`proposal_id`,`sector_id`);--> statement-breakpoint
CREATE TABLE `sectors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_proposal_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`proposal_id` integer NOT NULL,
	`member_id` integer,
	`display_name` text,
	`is_anonymous` integer DEFAULT 0 NOT NULL,
	`body` text NOT NULL,
	`posted_at` integer NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_proposal_comments`("id", "proposal_id", "member_id", "display_name", "is_anonymous", "body", "posted_at") SELECT "id", "proposal_id", "member_id", "display_name", "is_anonymous", "body", "posted_at" FROM `proposal_comments`;--> statement-breakpoint
DROP TABLE `proposal_comments`;--> statement-breakpoint
ALTER TABLE `__new_proposal_comments` RENAME TO `proposal_comments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `delegations` ADD `sector_id` integer REFERENCES sectors(id);--> statement-breakpoint
ALTER TABLE `proposals` ADD `critical` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `proposals` ADD `met_min_participation` integer;--> statement-breakpoint
ALTER TABLE `proposals` ADD `amount` integer;--> statement-breakpoint
ALTER TABLE `proposals` ADD `target_member_id` integer REFERENCES members(id);--> statement-breakpoint
ALTER TABLE `proposals` ADD `target_sector_id` integer REFERENCES sectors(id);--> statement-breakpoint
ALTER TABLE `proposals` ADD `position_action` text;