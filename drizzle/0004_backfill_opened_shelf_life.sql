-- Nachtrag für Installationen, deren Kategorien vor dieser Spalte entstanden.
--
-- seedCategories() ist absichtlich rein ergänzend: es überschreibt keine
-- angepassten Werte. Damit bleiben neue Spalten auf bestehenden Zeilen aber
-- NULL, und eine geöffnete Packung behielte das Datum der verschlossenen.
-- Nur dort setzen, wo noch nichts steht — von Hand Geändertes bleibt.
UPDATE category SET opened_shelf_life_days = 5  WHERE name = 'Milchprodukte'           AND opened_shelf_life_days IS NULL;--> statement-breakpoint
UPDATE category SET opened_shelf_life_days = 10 WHERE name = 'Käse'                    AND opened_shelf_life_days IS NULL;--> statement-breakpoint
UPDATE category SET opened_shelf_life_days = 2  WHERE name = 'Fleisch & Fisch'         AND opened_shelf_life_days IS NULL;--> statement-breakpoint
UPDATE category SET opened_shelf_life_days = 4  WHERE name = 'Tofu & Fleischersatz'    AND opened_shelf_life_days IS NULL;--> statement-breakpoint
UPDATE category SET opened_shelf_life_days = 5  WHERE name = 'Aufschnitt & Aufstriche' AND opened_shelf_life_days IS NULL;--> statement-breakpoint
UPDATE category SET opened_shelf_life_days = 3  WHERE name = 'Konserven'               AND opened_shelf_life_days IS NULL;--> statement-breakpoint
UPDATE category SET opened_shelf_life_days = 60 WHERE name = 'Gewürze & Saucen'        AND opened_shelf_life_days IS NULL;--> statement-breakpoint
UPDATE category SET opened_shelf_life_days = 30 WHERE name = 'Süßes & Snacks'          AND opened_shelf_life_days IS NULL;--> statement-breakpoint
UPDATE category SET opened_shelf_life_days = 5  WHERE name = 'Getränke'                AND opened_shelf_life_days IS NULL;
