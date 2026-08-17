PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_receipt` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`store` text,
	`purchased_at` integer,
	`total_cents` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`raw_response` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_receipt`("id", "user_id", "store", "purchased_at", "total_cents", "status", "raw_response", "created_at") SELECT "id", "user_id", "store", "purchased_at", "total_cents", "status", "raw_response", "created_at" FROM `receipt`;--> statement-breakpoint
DROP TABLE `receipt`;--> statement-breakpoint
ALTER TABLE `__new_receipt` RENAME TO `receipt`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `receipt_status_idx` ON `receipt` (`status`);--> statement-breakpoint
CREATE INDEX `receipt_user_idx` ON `receipt` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_shopping_list_item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`product_id` integer,
	`free_text` text,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit` text DEFAULT 'piece' NOT NULL,
	`is_done` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_shopping_list_item`("id", "user_id", "product_id", "free_text", "quantity", "unit", "is_done", "source", "created_at") SELECT "id", "user_id", "product_id", "free_text", "quantity", "unit", "is_done", "source", "created_at" FROM `shopping_list_item`;--> statement-breakpoint
DROP TABLE `shopping_list_item`;--> statement-breakpoint
ALTER TABLE `__new_shopping_list_item` RENAME TO `shopping_list_item`;--> statement-breakpoint
CREATE INDEX `shopping_open_idx` ON `shopping_list_item` (`is_done`);--> statement-breakpoint
CREATE INDEX `shopping_user_idx` ON `shopping_list_item` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_stock_item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`initial_quantity` real,
	`unit` text DEFAULT 'piece' NOT NULL,
	`location` text DEFAULT 'fridge' NOT NULL,
	`best_before` integer,
	`best_before_is_estimated` integer DEFAULT true NOT NULL,
	`fill_level` integer,
	`purchased_at` integer NOT NULL,
	`consumed_at` integer,
	`receipt_id` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`receipt_id`) REFERENCES `receipt`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_stock_item`("id", "user_id", "product_id", "quantity", "initial_quantity", "unit", "location", "best_before", "best_before_is_estimated", "fill_level", "purchased_at", "consumed_at", "receipt_id") SELECT "id", "user_id", "product_id", "quantity", "initial_quantity", "unit", "location", "best_before", "best_before_is_estimated", "fill_level", "purchased_at", "consumed_at", "receipt_id" FROM `stock_item`;--> statement-breakpoint
DROP TABLE `stock_item`;--> statement-breakpoint
ALTER TABLE `__new_stock_item` RENAME TO `stock_item`;--> statement-breakpoint
CREATE INDEX `stock_open_by_expiry_idx` ON `stock_item` (`consumed_at`,`best_before`);--> statement-breakpoint
CREATE INDEX `stock_product_idx` ON `stock_item` (`product_id`);--> statement-breakpoint
CREATE INDEX `stock_location_idx` ON `stock_item` (`location`);--> statement-breakpoint
CREATE INDEX `stock_user_idx` ON `stock_item` (`user_id`);