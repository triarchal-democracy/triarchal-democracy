CREATE TABLE `joint_actions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`sector_id` integer NOT NULL,
	`recognition_id` integer NOT NULL,
	`kind` text NOT NULL,
	`payload_json` text NOT NULL,
	`summary` text NOT NULL,
	`proposed_by` integer NOT NULL,
	`proposed_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`resolved_by` integer,
	`resolved_at` integer,
	`referral_proposal_id` integer,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sector_id`) REFERENCES `sectors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recognition_id`) REFERENCES `delegate_recognitions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposed_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `position_compensation_splits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`sector_id` integer NOT NULL,
	`first_member_id` integer NOT NULL,
	`second_member_id` integer NOT NULL,
	`first_share_pct` integer NOT NULL,
	`agreed_at` integer NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sector_id`) REFERENCES `sectors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`first_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`second_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `position_spokespersons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`sector_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`designated_at` integer NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sector_id`) REFERENCES `sectors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `proposals` ADD `joint_action_id` integer;