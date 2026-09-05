CREATE TABLE `campers` (
	`token` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`room` text NOT NULL,
	`name` text NOT NULL,
	`pose` text NOT NULL,
	`seen` integer NOT NULL,
	`last_action` text,
	`last_result` text,
	FOREIGN KEY (`room`) REFERENCES `camps`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `campers_room_seen` ON `campers` (`room`,`seen`);--> statement-breakpoint
CREATE UNIQUE INDEX `campers_id` ON `campers` (`id`);--> statement-breakpoint
CREATE TABLE `camps` (
	`code` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
