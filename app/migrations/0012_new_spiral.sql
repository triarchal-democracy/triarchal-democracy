CREATE TABLE `phone_verification_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`phone` text NOT NULL,
	`started_at` integer NOT NULL,
	`confirmed_at` integer,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `members` ADD `phone` text;--> statement-breakpoint
ALTER TABLE `members` ADD `phone_verified_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `members_phone_unique` ON `members` (`phone`);