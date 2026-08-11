/**
 * Abfragen und Mutationen rund um den Bon-Import.
 *
 * Eigene Datei statt Anbau an `queries.ts`: der Bestand wird bei jedem Blick in
 * den Kühlschrank angefasst, ein Bon ein paar Mal pro Woche. Die beiden teilen
 * sich keinen Zustand, und `queries.ts` ist schon lang genug. Dieselbe Regel
 * wie dort: keine SvelteKit-Importe, damit es ohne Kit testbar bleibt.
 */

import { and, asc, eq, sql } from 'drizzle-orm';
import type { ParsedReceipt } from '../ai/receipt-parse';
import { normalizeRawText } from '../ai/receipt-parse';
import type { Location, Unit } from '../../domain';
import type { Db, DbOrTx } from './client';
import { addStock, findOrCreateProduct } from './queries';
import { category, product, productAlias, receipt, receiptImage, receiptLine } from './schema';

/** Kaufdatum vom Bon, sonst heute. */
function parsePurchasedAt(value: string): Date {
	if (value === '') return new Date();
	const parsed = new Date(`${value}T12:00:00`);
	return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Legt den Bon an, bevor überhaupt ein Modell gefragt wurde.
 *
 * Absicht: scheitert die Auswertung, bleiben Bilder und Rohantwort trotzdem
 * unter `status: 'discarded'` liegen. Genau die Fälle will man später ansehen,
 * um den Prompt zu verbessern — und genau die wären weg, wenn der Bon erst
 * nach Erfolg entstünde.
 */
export function createPendingReceipt(db: Db): number {
	return db.insert(receipt).values({ status: 'pending' }).returning({ id: receipt.id }).get().id;
}

export function addReceiptImage(db: Db, receiptId: number, path: string, sortOrder: number): void {
	db.insert(receiptImage).values({ receiptId, path, sortOrder }).run();
}

export function discardReceipt(db: Db, receiptId: number, rawResponse?: string): void {
	db.update(receipt)
		.set({ status: 'discarded', ...(rawResponse === undefined ? {} : { rawResponse }) })
		.where(eq(receipt.id, receiptId))
		.run();
}

/**
 * Schreibt die Modellantwort als Bon-Zeilen weg — und fragt dabei zuerst die
 * Alias-Tabelle.
 *
 * Wo ein Alias greift, gewinnt das früher bestätigte Produkt gegen den
 * Vorschlag des Modells: „BIO-TOFU NAT 400G" ist beim zweiten Einkauf wieder
 * „Tofu natur" und nicht „Bio-Tofu natur". Das spart keinen Bildaufruf — das
 * Foto muss so oder so gelesen werden —, aber es spart das Nachkorrigieren,
 * und darum geht es im Prüf-Screen.
 */
export function saveParsedLines(db: Db, receiptId: number, parsed: ParsedReceipt): number {
	db.update(receipt)
		.set({
			store: parsed.store || null,
			purchasedAt: parsePurchasedAt(parsed.purchasedAt),
			totalCents: parsed.totalCents || null
		})
		.where(eq(receipt.id, receiptId))
		.run();

	for (const line of parsed.lines) {
		const known = findAlias(db, line.rawText);
		db.insert(receiptLine)
			.values({
				receiptId,
				rawText: line.rawText,
				parsedName: known?.name ?? line.name,
				parsedCategory: line.category,
				quantity: line.quantity,
				unit: line.unit,
				priceCents: line.priceCents || null,
				// Was schon einmal bestätigt wurde, ist keine Vermutung mehr.
				confidence: known ? 'high' : line.confidence,
				productId: known?.id ?? null
			})
			.run();
	}

	return parsed.lines.length;
}

/** Bekannte Bon-Bezeichnung → früher bestätigtes Produkt. */
export function findAlias(db: Db, rawText: string): { id: number; name: string } | null {
	const key = normalizeRawText(rawText);
	if (key === '') return null;

	const row = db
		.select({ id: product.id, name: product.name })
		.from(productAlias)
		.innerJoin(product, eq(productAlias.productId, product.id))
		.where(eq(productAlias.rawTextNormalized, key))
		.get();
	return row ?? null;
}

/** Merkt sich, welches Produkt hinter einer Bon-Bezeichnung steckt. */
export function rememberAlias(
	db: DbOrTx,
	rawText: string,
	productId: number,
	store?: string
): void {
	const key = normalizeRawText(rawText);
	if (key === '') return;

	db.insert(productAlias)
		.values({ rawTextNormalized: key, productId, store: store ?? null, hitCount: 1 })
		.onConflictDoUpdate({
			target: productAlias.rawTextNormalized,
			set: { productId, hitCount: sql`${productAlias.hitCount} + 1` }
		})
		.run();
}

export type ReviewLine = {
	id: number;
	rawText: string;
	name: string;
	category: string;
	quantity: number;
	unit: Unit;
	priceCents: number | null;
	confidence: 'high' | 'low';
	/** Gesetzt heißt: kam über die Alias-Tabelle, nicht über eine Vermutung. */
	known: boolean;
};

export type ReceiptReview = {
	id: number;
	store: string | null;
	status: 'pending' | 'confirmed' | 'discarded';
	purchasedAt: Date | null;
	totalCents: number | null;
	lines: ReviewLine[];
};

/** Alles, was der Prüf-Screen braucht — ein Bon mit seinen offenen Zeilen. */
export function loadReceiptReview(db: Db, receiptId: number): ReceiptReview | null {
	const head = db.select().from(receipt).where(eq(receipt.id, receiptId)).get();
	if (!head) return null;

	const rows = db
		.select()
		.from(receiptLine)
		.where(and(eq(receiptLine.receiptId, receiptId), eq(receiptLine.status, 'pending')))
		.orderBy(asc(receiptLine.id))
		.all();

	return {
		id: head.id,
		store: head.store,
		status: head.status,
		purchasedAt: head.purchasedAt,
		totalCents: head.totalCents,
		lines: rows.map((row) => ({
			id: row.id,
			rawText: row.rawText,
			name: row.parsedName ?? row.rawText,
			category: row.parsedCategory ?? 'Sonstiges',
			quantity: row.quantity ?? 1,
			unit: (row.unit ?? 'piece') as Unit,
			priceCents: row.priceCents,
			confidence: row.confidence,
			known: row.productId !== null
		}))
	};
}

/** Wie viele Bons noch auf Prüfung warten — für den Hinweis auf der Bon-Seite. */
export function pendingReceipts(
	db: Db
): Array<{ id: number; store: string | null; lines: number }> {
	return db
		.select({
			id: receipt.id,
			store: receipt.store,
			lines: sql<number>`count(${receiptLine.id})`
		})
		.from(receipt)
		.leftJoin(receiptLine, eq(receiptLine.receiptId, receipt.id))
		.where(eq(receipt.status, 'pending'))
		.groupBy(receipt.id)
		.having(sql`count(${receiptLine.id}) > 0`)
		.orderBy(asc(receipt.id))
		.all();
}

/** Eine geprüfte Zeile, so wie sie der Prüf-Screen zurückgibt. */
export type LineDecision = {
	id: number;
	name: string;
	quantity: number;
	unit: Unit;
	location: Location;
	/** Falsch heißt: nicht übernehmen (Pfandzeile, Fehllesung, doch nicht gekauft). */
	keep: boolean;
};

/**
 * Übernimmt den geprüften Bon in einer Transaktion in den Bestand.
 *
 * Alles oder nichts: ein halb eingebuchter Bon wäre schlimmer als gar keiner,
 * weil man ihm nicht ansieht, wo er aufgehört hat. Nebenbei lernt die
 * Alias-Tabelle jede bestätigte Zeile — beim nächsten Einkauf im selben Laden
 * steht der richtige Name schon da.
 */
export function confirmReceipt(
	db: Db,
	receiptId: number,
	decisions: LineDecision[]
): { added: number; rejected: number } {
	return db.transaction((tx) => {
		const head = tx.select().from(receipt).where(eq(receipt.id, receiptId)).get();
		if (!head || head.status !== 'pending') return { added: 0, rejected: 0 };

		const stored = new Map(
			tx
				.select()
				.from(receiptLine)
				.where(and(eq(receiptLine.receiptId, receiptId), eq(receiptLine.status, 'pending')))
				.all()
				.map((row) => [row.id, row])
		);

		let added = 0;
		let rejected = 0;

		for (const decision of decisions) {
			const row = stored.get(decision.id);
			if (!row) continue;

			if (!decision.keep) {
				tx.update(receiptLine)
					.set({ status: 'rejected' })
					.where(eq(receiptLine.id, decision.id))
					.run();
				rejected++;
				continue;
			}

			const productId =
				row.productId ?? findOrCreateProduct(tx, decision.name, row.parsedCategory ?? undefined);

			addStock(tx, {
				productId,
				quantity: decision.quantity,
				unit: decision.unit,
				location: decision.location,
				receiptId
			});

			tx.update(receiptLine)
				.set({ status: 'accepted', productId, parsedName: decision.name })
				.where(eq(receiptLine.id, decision.id))
				.run();

			rememberAlias(tx, row.rawText, productId, head.store ?? undefined);
			added++;
		}

		// Zeilen, über die niemand entschieden hat, gelten als abgelehnt — sonst
		// bliebe der Bon ewig „pending" und meldete sich immer wieder.
		tx.update(receiptLine)
			.set({ status: 'rejected' })
			.where(and(eq(receiptLine.receiptId, receiptId), eq(receiptLine.status, 'pending')))
			.run();

		tx.update(receipt).set({ status: 'confirmed' }).where(eq(receipt.id, receiptId)).run();

		return { added, rejected };
	});
}

/** Namen aller Kategorien — die Auswahlliste für das Modell. */
export function categoryNames(db: Db): string[] {
	return db
		.select({ name: category.name })
		.from(category)
		.orderBy(asc(category.sortOrder))
		.all()
		.map((row) => row.name);
}
