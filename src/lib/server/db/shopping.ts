/**
 * Die Einkaufsliste.
 *
 * Eigene Datei wie `receipts.ts`: sie teilt mit dem Bestand nur den Produkt-
 * schlüssel, und `queries.ts` ist schon lang genug. Dieselbe Regel wie dort —
 * keine SvelteKit-Importe, damit es ohne Kit testbar bleibt.
 */

import { and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from './client';
import { category, product, shoppingListItem, stockItem } from './schema';

export type ShoppingRow = {
	id: number;
	name: string;
	emoji: string;
	productId: number | null;
	isDone: boolean;
};

/**
 * Offene und erledigte Posten, jeweils in der Reihenfolge, in der sie
 * dazukamen.
 *
 * Nicht alphabetisch: im Laden geht man die Liste von oben nach unten durch,
 * und was man zuletzt vermisst hat, steht dann unten — dieselbe Reihenfolge,
 * in der man daran gedacht hat.
 */
export function listShopping(db: Db): { open: ShoppingRow[]; done: ShoppingRow[] } {
	const rows = db
		.select({
			id: shoppingListItem.id,
			productId: shoppingListItem.productId,
			freeText: shoppingListItem.freeText,
			productName: product.name,
			emoji: category.emoji,
			isDone: shoppingListItem.isDone
		})
		.from(shoppingListItem)
		.leftJoin(product, eq(shoppingListItem.productId, product.id))
		.leftJoin(category, eq(product.categoryId, category.id))
		.orderBy(asc(shoppingListItem.id))
		.all();

	const mapped: ShoppingRow[] = rows.map((row) => ({
		id: row.id,
		name: row.productName ?? row.freeText ?? '',
		// Freitext hat keine Kategorie und damit kein Emoji — ein neutraler
		// Anker ist besser als eine Lücke, die die Zeilen ungleich hoch macht.
		emoji: row.emoji ?? '📝',
		productId: row.productId,
		isDone: row.isDone
	}));

	return {
		open: mapped.filter((row) => !row.isDone),
		done: mapped.filter((row) => row.isDone)
	};
}

/**
 * Puffer beim Vorschlagen: ein paar Kandidaten mehr holen, weil gleich noch
 * herausfällt, was schon auf der Liste steht.
 */
const LIST_HEADROOM = 8;

/** Der Schlüssel fürs Doppeln-Verhindern: „Hafermilch" und „hafermilch" sind eins. */
function normalize(text: string): string {
	return text.trim().toLowerCase();
}

/**
 * Setzt ein bekanntes Produkt auf die Liste.
 *
 * Steht es schon offen drauf, passiert nichts. Zweimal „Milch" untereinander
 * wäre kein Fehler, den man merkt, sondern einer, den man im Laden ausbadet.
 */
export function addProductToList(
	db: Db,
	productId: number,
	source: 'manual' | 'suggested' = 'manual'
): number {
	const existing = db
		.select({ id: shoppingListItem.id })
		.from(shoppingListItem)
		.where(and(eq(shoppingListItem.productId, productId), eq(shoppingListItem.isDone, false)))
		.get();
	if (existing) return existing.id;

	return db
		.insert(shoppingListItem)
		.values({ productId, source })
		.returning({ id: shoppingListItem.id })
		.get().id;
}

/**
 * Freitext auf die Liste — für alles, was kein Produkt im Bestand ist.
 *
 * Passt der Text auf ein bekanntes Produkt, wird daraus ein Produkteintrag:
 * dann trägt die Zeile das Emoji ihrer Kategorie und der Eintrag zählt später
 * für die Vorschläge mit.
 */
export function addTextToList(db: Db, text: string): number | null {
	const trimmed = text.trim().slice(0, 80);
	if (trimmed === '') return null;

	const known = db
		.select({ id: product.id })
		.from(product)
		.where(sql`lower(${product.name}) = ${normalize(trimmed)}`)
		.get();
	if (known) return addProductToList(db, known.id);

	const duplicate = db
		.select({ id: shoppingListItem.id, freeText: shoppingListItem.freeText })
		.from(shoppingListItem)
		.where(and(isNull(shoppingListItem.productId), eq(shoppingListItem.isDone, false)))
		.all()
		.find((row) => normalize(row.freeText ?? '') === normalize(trimmed));
	if (duplicate) return duplicate.id;

	return db
		.insert(shoppingListItem)
		.values({ freeText: trimmed, source: 'manual' })
		.returning({ id: shoppingListItem.id })
		.get().id;
}

/**
 * Abhaken und wieder aufmachen.
 *
 * Ein abgehakter Posten wird nicht gelöscht, sondern rutscht nach unten. Das
 * ist das Undo für den Fehlgriff im Laden — ohne Snackbar, ohne Timer: der
 * Posten steht noch da, ein Tap holt ihn zurück.
 */
export function setShoppingDone(db: Db, id: number, done: boolean): void {
	db.update(shoppingListItem).set({ isDone: done }).where(eq(shoppingListItem.id, id)).run();
}

/** Räumt das Erledigte weg. Die einzige Stelle, an der wirklich gelöscht wird. */
export function clearDoneShopping(db: Db): number {
	const rows = db
		.select({ id: shoppingListItem.id })
		.from(shoppingListItem)
		.where(eq(shoppingListItem.isDone, true))
		.all();
	if (rows.length === 0) return 0;

	db.delete(shoppingListItem).where(eq(shoppingListItem.isDone, true)).run();
	return rows.length;
}

/**
 * Was man öfter kauft und gerade nicht hat.
 *
 * Die ganze Auswertung von M7 in einer Abfrage: kein Verbrauchsmodell, keine
 * Vorhersage, nur die zwei Tatsachen, die zusammen etwas bedeuten — mindestens
 * zweimal gekauft (also nichts Einmaliges) und im Moment kein offener Posten
 * mehr da. Zuletzt Aufgebrauchtes steht vorn, denn das fehlt seit heute.
 *
 * Bewusst keine „typische Verbrauchsdauer": sie würde Dinge vorschlagen, die
 * noch da sind, und ein Vorschlag, den man wegwischen muss, ist teurer als
 * einer, der fehlt.
 */
export function shoppingSuggestions(
	db: Db,
	limit = 8
): Array<{ productId: number; name: string; emoji: string }> {
	const openStock = db
		.select({ productId: stockItem.productId })
		.from(stockItem)
		.where(isNull(stockItem.consumedAt));

	const candidates = db
		.select({
			productId: product.id,
			name: product.name,
			emoji: category.emoji
		})
		.from(product)
		.innerJoin(category, eq(product.categoryId, category.id))
		.innerJoin(stockItem, eq(stockItem.productId, product.id))
		.where(sql`${product.id} not in ${openStock}`)
		.groupBy(product.id)
		.having(sql`count(${stockItem.id}) >= 2`)
		.orderBy(desc(sql`max(${stockItem.consumedAt})`), desc(count(stockItem.id)))
		.limit(limit + LIST_HEADROOM)
		.all();

	// Was schon auf der Liste steht, fällt hier heraus — im Code statt als
	// zweite Unterabfrage: die offene Liste ist ein paar Zeilen lang, und ein
	// „not in (select …)" mit NULL-Produkt-IDs ist die Sorte SQL, die still
	// das Falsche tut.
	const onList = new Set(
		db
			.select({ productId: shoppingListItem.productId })
			.from(shoppingListItem)
			.where(eq(shoppingListItem.isDone, false))
			.all()
			.map((row) => row.productId)
	);

	return candidates.filter((row) => !onList.has(row.productId)).slice(0, limit);
}

/**
 * Hakt ab, was gerade eingekauft wurde.
 *
 * Läuft beim Bestätigen eines Bons mit: wer die Liste im Laden nicht Zeile für
 * Zeile abhakt, findet sie zu Hause trotzdem erledigt vor — der Bon weiß ja,
 * was im Wagen lag. Nimmt eine Transaktion entgegen, weil sie in `confirmReceipt`
 * zum selben Vorgang gehört. Rückgängig ist es wie jedes andere Häkchen: der
 * Posten steht unter „Erledigt" und kommt mit einem Tap zurück.
 */
export function markProductBought(db: DbOrTx, productId: number, name: string): void {
	db.update(shoppingListItem)
		.set({ isDone: true })
		.where(and(eq(shoppingListItem.productId, productId), eq(shoppingListItem.isDone, false)))
		.run();

	// Und der häufigere Fall: „Zahnpasta" stand als Freitext auf der Liste,
	// weil es das Produkt beim Aufschreiben noch gar nicht gab — angelegt wird
	// es erst durch diesen Bon. Über den Namen findet es trotzdem zusammen.
	db.update(shoppingListItem)
		.set({ isDone: true })
		.where(
			and(
				isNull(shoppingListItem.productId),
				eq(shoppingListItem.isDone, false),
				sql`lower(${shoppingListItem.freeText}) = ${normalize(name)}`
			)
		)
		.run();
}
