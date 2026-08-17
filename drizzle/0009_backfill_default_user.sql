-- Nachtrag für Installationen von vor M11 (mehrere Nutzer).
--
-- `user_id` kam gerade als nullbare Spalte dazu (siehe 0008) — bestehende
-- Zeilen aus stock_item, receipt und shopping_list_item haben also noch
-- keinen Eigentümer. Ohne Backfill würde die folgende NOT-NULL-Migration
-- (0010) an genau diesen Zeilen scheitern, und der ganze bisherige Bestand
-- verschwände aus jeder nutzerscoped-Abfrage.
--
-- Ein einziger Default-Nutzer „Ich" übernimmt sie alle — genau das, was vor
-- M11 ohnehin der (einzige, implizite) Nutzer war. Nur anlegen, wenn es noch
-- keinen Nutzer gibt: ein zweiter Lauf dieser Migration passiert nie (jede
-- Migration läuft laut drizzle-kit genau einmal), aber die WHERE-Klauseln
-- machen die Zeilen-Zuordnung zusätzlich sicher, falls doch schon Nutzer
-- angelegt wurden, bevor diese Migration lief.
INSERT INTO user (name, created_at)
SELECT 'Ich', unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM user);--> statement-breakpoint

UPDATE stock_item SET user_id = (SELECT id FROM user ORDER BY id LIMIT 1) WHERE user_id IS NULL;--> statement-breakpoint
UPDATE receipt SET user_id = (SELECT id FROM user ORDER BY id LIMIT 1) WHERE user_id IS NULL;--> statement-breakpoint
UPDATE shopping_list_item SET user_id = (SELECT id FROM user ORDER BY id LIMIT 1) WHERE user_id IS NULL;
