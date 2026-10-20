ALTER TABLE `contributions` ADD `pre_void_verified_at` integer;--> statement-breakpoint
ALTER TABLE `contributions` ADD `pre_void_claimed_at` integer;--> statement-breakpoint
ALTER TABLE `dispute_panels` ADD `revocation_effective_at` integer;--> statement-breakpoint
ALTER TABLE `dispute_panels` ADD `revocation_completed_at` integer;--> statement-breakpoint
ALTER TABLE `dispute_panels` ADD `overturned_at` integer;--> statement-breakpoint
ALTER TABLE `member_sanctions` ADD `overturned_at` integer;--> statement-breakpoint
ALTER TABLE `members` ADD `revoked_at` integer;--> statement-breakpoint
ALTER TABLE `proposals` ADD `overturns_panel_id` integer;