CREATE TABLE `receipt_image` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`receipt_id` integer NOT NULL,
	`path` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`receipt_id`) REFERENCES `receipt`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `receipt_image_receipt_idx` ON `receipt_image` (`receipt_id`,`sort_order`);--> statement-breakpoint
ALTER TABLE `receipt` DROP COLUMN `image_path`;--> statement-breakpoint
ALTER TABLE `stock_item` DROP COLUMN `is_opened`;