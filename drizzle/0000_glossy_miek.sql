CREATE TABLE `category` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`default_shelf_life_days` integer NOT NULL,
	`emoji` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_name_unique` ON `category` (`name`);--> statement-breakpoint
CREATE TABLE `product` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category_id` integer NOT NULL,
	`default_unit` text DEFAULT 'piece' NOT NULL,
	`shelf_life_days` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_name_unique` ON `product` (`name`);--> statement-breakpoint
CREATE INDEX `product_category_idx` ON `product` (`category_id`);--> statement-breakpoint
CREATE TABLE `product_alias` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`raw_text_normalized` text NOT NULL,
	`product_id` integer NOT NULL,
	`store` text,
	`hit_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alias_normalized_uq` ON `product_alias` (`raw_text_normalized`);--> statement-breakpoint
CREATE TABLE `receipt` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`image_path` text NOT NULL,
	`store` text,
	`purchased_at` integer,
	`total_cents` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`raw_response` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `receipt_status_idx` ON `receipt` (`status`);--> statement-breakpoint
CREATE TABLE `receipt_line` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`receipt_id` integer NOT NULL,
	`raw_text` text NOT NULL,
	`parsed_name` text,
	`quantity` real,
	`unit` text,
	`price_cents` integer,
	`confidence` text DEFAULT 'low' NOT NULL,
	`product_id` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	FOREIGN KEY (`receipt_id`) REFERENCES `receipt`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `receipt_line_receipt_idx` ON `receipt_line` (`receipt_id`);--> statement-breakpoint
CREATE TABLE `shopping_list_item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer,
	`free_text` text,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit` text DEFAULT 'piece' NOT NULL,
	`is_done` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `shopping_open_idx` ON `shopping_list_item` (`is_done`);--> statement-breakpoint
CREATE TABLE `stock_item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit` text DEFAULT 'piece' NOT NULL,
	`location` text DEFAULT 'fridge' NOT NULL,
	`best_before` integer,
	`best_before_is_estimated` integer DEFAULT true NOT NULL,
	`is_opened` integer DEFAULT false NOT NULL,
	`purchased_at` integer NOT NULL,
	`consumed_at` integer,
	`receipt_id` integer,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`receipt_id`) REFERENCES `receipt`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `stock_open_by_expiry_idx` ON `stock_item` (`consumed_at`,`best_before`);--> statement-breakpoint
CREATE INDEX `stock_product_idx` ON `stock_item` (`product_id`);--> statement-breakpoint
CREATE INDEX `stock_location_idx` ON `stock_item` (`location`);