-- Nachtrag für Posten, die vor dieser Spalte entstanden sind.
--
-- Neue Spalten bleiben auf bestehenden Zeilen NULL, und NULL heißt hier „ich
-- weiß nicht, womit dieser Posten angefangen hat" — der Balken bliebe für den
-- ganzen Altbestand aus. Was schon offen im Kühlschrank steht, hat als beste
-- verfügbare Annahme seine aktuelle Menge als Startmenge: dann zeigt die Zeile
-- „voll" und wird ab der nächsten Entnahme ehrlich.
UPDATE stock_item SET initial_quantity = quantity WHERE initial_quantity IS NULL;
