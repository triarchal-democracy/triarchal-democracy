CREATE TABLE `dispute_panel_parties` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`panel_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`role` text NOT NULL,
	FOREIGN KEY (`panel_id`) REFERENCES `dispute_panels`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dispute_panel_parties_panel_id_member_id_unique` ON `dispute_panel_parties` (`panel_id`,`member_id`);--> statement-breakpoint
ALTER TABLE `dispute_panels` ADD `respond_by` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `dispute_panels` ADD `responded_at` integer;--> statement-breakpoint
ALTER TABLE `dispute_panels` ADD `response_waived_at` integer;--> statement-breakpoint
ALTER TABLE `members` ADD `dispute_pool_opt_in_at` integer;
