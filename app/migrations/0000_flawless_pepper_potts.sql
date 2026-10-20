CREATE TABLE `attestations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contribution_id` integer NOT NULL,
	`attestor_id` integer NOT NULL,
	`attested_at` integer NOT NULL,
	`voided_at` integer,
	FOREIGN KEY (`contribution_id`) REFERENCES `contributions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attestor_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attestations_contribution_id_attestor_id_unique` ON `attestations` (`contribution_id`,`attestor_id`);--> statement-breakpoint
CREATE TABLE `communities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`params` text NOT NULL,
	`created_at` integer NOT NULL,
	`clock_offset_ms` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contributions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`domain` text NOT NULL,
	`description` text NOT NULL,
	`evidence_link` text,
	`logged_at` integer NOT NULL,
	`verified_at` integer,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `delegations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`to_member_id` integer NOT NULL,
	`granted_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `dividend_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`period_end` integer NOT NULL,
	`pool_amount` integer NOT NULL,
	`distributed_amount` integer NOT NULL,
	`per_member` text NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`salt` text NOT NULL,
	`joined_at` integer NOT NULL,
	`last_active_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_email_unique` ON `members` (`email`);--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`by` integer NOT NULL,
	`title` text NOT NULL,
	`why` text NOT NULL,
	`cost` text,
	`reversal` text,
	`cls` text NOT NULL,
	`submitted_at` integer NOT NULL,
	`vote_freeze_at` integer NOT NULL,
	`vote_opens_at` integer NOT NULL,
	`voting_closes_at` integer NOT NULL,
	`stage` text DEFAULT 'deliberation' NOT NULL,
	`outcome` text,
	`tally` text,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `record` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`member_id` integer,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`member_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `treasury_ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`source` text NOT NULL,
	`restriction` text,
	`member_id` integer,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `treasury_state` (
	`community_id` integer PRIMARY KEY NOT NULL,
	`ops_balance` integer DEFAULT 0 NOT NULL,
	`dividend_balance` integer DEFAULT 0 NOT NULL,
	`reserve_balance` integer DEFAULT 0 NOT NULL,
	`last_dividend_at` integer NOT NULL,
	`dividends_paid` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `votes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`proposal_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`value` integer NOT NULL,
	`cast_at` integer NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `votes_proposal_id_member_id_unique` ON `votes` (`proposal_id`,`member_id`);