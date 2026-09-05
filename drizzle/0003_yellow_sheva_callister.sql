CREATE TABLE `camp_actions` (
	`token` text NOT NULL,
	`request_id` text NOT NULL,
	`command` text NOT NULL,
	`result` text NOT NULL,
	PRIMARY KEY(`token`, `request_id`),
	FOREIGN KEY (`token`) REFERENCES `campers`(`token`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `campers` ADD `fishing` text DEFAULT 'null' NOT NULL;--> statement-breakpoint
ALTER TABLE `campers` ADD `lock_id` text;--> statement-breakpoint
ALTER TABLE `campers` ADD `lock_until` integer DEFAULT 0 NOT NULL;