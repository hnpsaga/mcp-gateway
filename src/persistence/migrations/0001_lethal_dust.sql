PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_discovery_cache` (
	`connection_id` text PRIMARY KEY NOT NULL,
	`discovered_at` text NOT NULL,
	`tools` text DEFAULT '[]' NOT NULL,
	`resources` text DEFAULT '[]' NOT NULL,
	`prompts` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_discovery_cache`("connection_id", "discovered_at", "tools", "resources", "prompts") SELECT "connection_id", "discovered_at", "tools", "resources", "prompts" FROM `discovery_cache`;--> statement-breakpoint
DROP TABLE `discovery_cache`;--> statement-breakpoint
ALTER TABLE `__new_discovery_cache` RENAME TO `discovery_cache`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_runtime_state` (
	`connection_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`last_connection_attempt` text,
	`last_successful_connection` text,
	`last_disconnect_time` text,
	`last_failure` text,
	`failure_reason` text,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`runtime_metadata` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_runtime_state`("connection_id", "status", "last_connection_attempt", "last_successful_connection", "last_disconnect_time", "last_failure", "failure_reason", "retry_count", "runtime_metadata") SELECT "connection_id", "status", "last_connection_attempt", "last_successful_connection", "last_disconnect_time", "last_failure", "failure_reason", "retry_count", "runtime_metadata" FROM `runtime_state`;--> statement-breakpoint
DROP TABLE `runtime_state`;--> statement-breakpoint
ALTER TABLE `__new_runtime_state` RENAME TO `runtime_state`;--> statement-breakpoint
CREATE TABLE `__new_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`transport_type` text NOT NULL,
	`transport_config` text DEFAULT '{}' NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_connections`("id", "name", "description", "transport_type", "transport_config", "enabled", "tags", "metadata", "created_at", "updated_at") SELECT "id", "name", "description", "transport_type", "transport_config", "enabled", "tags", "metadata", "created_at", "updated_at" FROM `connections`;--> statement-breakpoint
DROP TABLE `connections`;--> statement-breakpoint
ALTER TABLE `__new_connections` RENAME TO `connections`;