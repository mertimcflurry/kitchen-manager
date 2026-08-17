CREATE TABLE `user` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `receipt` ADD `user_id` integer REFERENCES user(id);--> statement-breakpoint
CREATE INDEX `receipt_user_idx` ON `receipt` (`user_id`);--> statement-breakpoint
ALTER TABLE `shopping_list_item` ADD `user_id` integer REFERENCES user(id);--> statement-breakpoint
CREATE INDEX `shopping_user_idx` ON `shopping_list_item` (`user_id`);--> statement-breakpoint
ALTER TABLE `stock_item` ADD `user_id` integer REFERENCES user(id);--> statement-breakpoint
CREATE INDEX `stock_user_idx` ON `stock_item` (`user_id`);