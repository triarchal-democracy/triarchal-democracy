CREATE TABLE `time_sensitive_petition_signatures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`proposal_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`signed_at` integer NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `time_sensitive_petition_signatures_proposal_id_member_id_unique` ON `time_sensitive_petition_signatures` (`proposal_id`,`member_id`);--> statement-breakpoint
ALTER TABLE `contributions` ADD `claimed_at` integer;--> statement-breakpoint
ALTER TABLE `proposals` ADD `time_sensitive` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `proposals` ADD `time_sensitive_deadline_note` text;--> statement-breakpoint
-- Prompt23 Part E — "Path A" renamed to the "Default-Delegate Mechanism" in
-- the Aug 2026 documentation amendment (see CLAUDE.md's Naming section).
-- Data-only rename of the seatKind value already seeded in production by
-- community.ts's ensureCommunity — no schema change, additive in effect
-- (updates existing rows to the new value the app now writes/compares
-- against; never touches any other column or row).
UPDATE `members` SET `seat_kind` = 'default_delegate_seat' WHERE `seat_kind` = 'path_a_seat';--> statement-breakpoint
-- Same rename, applied to the seat placeholders' display name and
-- placeholder email (community.ts's seeding loop now writes
-- "Default-Delegate Seat — ..." / "default-delegate-seat-...@..." for new
-- rows) — `members.name` is shown to real Members in the /delegation target
-- picker (see index.tsx's publicSeats), so an unrenamed row would read as
-- contradicting the new terminology right in the UI, not just in code.
UPDATE `members` SET `name` = REPLACE(`name`, 'Path A Seat — ', 'Default-Delegate Seat — ') WHERE `name` LIKE 'Path A Seat — %';--> statement-breakpoint
UPDATE `members` SET `email` = REPLACE(`email`, 'path-a-seat-', 'default-delegate-seat-') WHERE `email` LIKE 'path-a-seat-%@placeholder.triarc.internal';