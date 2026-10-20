CREATE TABLE `business_page_follows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`page_id` integer NOT NULL,
	`followed_at` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`page_id`) REFERENCES `business_pages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `business_page_follows_member_id_page_id_unique` ON `business_page_follows` (`member_id`,`page_id`);--> statement-breakpoint
CREATE TABLE `business_page_updates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`page_id` integer NOT NULL,
	`body` text NOT NULL,
	`posted_at` integer NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `business_pages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `business_pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`managed_by_member_id` integer NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`managed_by_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `dispute_panel_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`panel_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`drawn_at` integer NOT NULL,
	FOREIGN KEY (`panel_id`) REFERENCES `dispute_panels`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dispute_panel_members_panel_id_member_id_unique` ON `dispute_panel_members` (`panel_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `dispute_panel_votes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`panel_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`upheld` integer NOT NULL,
	`voted_at` integer NOT NULL,
	FOREIGN KEY (`panel_id`) REFERENCES `dispute_panels`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dispute_panel_votes_panel_id_member_id_unique` ON `dispute_panel_votes` (`panel_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `dispute_panels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`subject_kind` text NOT NULL,
	`subject_id` integer NOT NULL,
	`filed_by` integer NOT NULL,
	`filed_at` integer NOT NULL,
	`decides_by` integer NOT NULL,
	`decision` text,
	`decided_at` integer,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`filed_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `nomination_challenges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`supporting_nominee_id` integer NOT NULL,
	`filed_by` integer NOT NULL,
	`kind` text NOT NULL,
	`dispute_panel_id` integer,
	`proposal_id` integer,
	`filed_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supporting_nominee_id`) REFERENCES `supporting_nominees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`filed_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dispute_panel_id`) REFERENCES `dispute_panels`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`event_kind` text NOT NULL,
	`channel` text NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_preferences_member_id_event_kind_channel_unique` ON `notification_preferences` (`member_id`,`event_kind`,`channel`);--> statement-breakpoint
CREATE TABLE `sector_post_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` integer NOT NULL,
	`member_id` integer,
	`display_name` text,
	`is_anonymous` integer DEFAULT 0 NOT NULL,
	`body` text NOT NULL,
	`posted_at` integer NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `sector_posts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sector_posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`sector_id` integer NOT NULL,
	`member_id` integer,
	`display_name` text,
	`is_anonymous` integer DEFAULT 0 NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`posted_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sector_id`) REFERENCES `sectors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `supporting_nominees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`delegate_recognition_id` integer NOT NULL,
	`nominee_member_id` integer NOT NULL,
	`title` text NOT NULL,
	`nominated_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`delegate_recognition_id`) REFERENCES `delegate_recognitions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`nominee_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `members` ADD `visibility_level` text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE `proposals` ADD `target_supporting_nominee_id` integer;