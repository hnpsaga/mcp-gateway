CREATE TABLE `connections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`transport_type` text NOT NULL,
	`transport_config` text DEFAULT '{}' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `discovery_cache` (
	`connection_id` text PRIMARY KEY NOT NULL,
	`discovered_at` text NOT NULL,
	`tools` text DEFAULT '[]' NOT NULL,
	`resources` text DEFAULT '[]' NOT NULL,
	`prompts` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `runtime_state` (
	`connection_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`last_connection_attempt` text,
	`last_successful_connection` text,
	`last_disconnect_time` text,
	`last_failure` text,
	`failure_reason` text,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`runtime_metadata` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE cascade
);
