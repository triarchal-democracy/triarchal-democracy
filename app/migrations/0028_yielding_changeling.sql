CREATE INDEX `login_attempts_email_idx` ON `login_attempts` (`email`,`attempted_at`);--> statement-breakpoint
CREATE INDEX `login_attempts_ip_idx` ON `login_attempts` (`ip`,`attempted_at`);--> statement-breakpoint
CREATE INDEX `security_events_kind_ip_idx` ON `security_events` (`kind`,`ip`,`occurred_at`);