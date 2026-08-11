/**
 * Alles am Bon-Parsen, was ohne Netz und ohne SvelteKit auskommt:
 * Schema, Prompt und die Prüfung der Modellantwort.
 *
 * Bewusst getrennt von `receipt.ts`: dort steckt der Anthropic-Aufruf und damit
 * `$env`, was in Tests nicht auflösbar wäre. Hier liegt der Teil, den Tests
 * anfassen können — und genau der, in dem Fehler wehtun.
 */

import { UNITS, type Unit } from '../../domain';

/** Eine Zeile so, wie das Modell sie gelesen hat. */
export type ParsedLine = {
	/** Wortlaut vom Bon, unverändert. Schlüssel für die Alias-Tabelle. */
	rawText: string;
	/** Alltagsname ohne Marke und Größe: „BIO-TOFU NAT 400G" → „Tofu natur". */
	name: string;
	/** Muss ein Kategoriename aus der Datenbank sein. */
	category: string;
	quantity: number;
	unit: Unit;
	/** 0 heißt: kein Preis erkannt. Preise werden gespeichert, aber nicht ausgewertet. */
	priceCents: number;
	confidence: 'high' | 'low';
};

export type ParsedReceipt = {
	/** Leerer String heißt: nicht erkannt. */
	store: string;
	/** `YYYY-MM-DD` oder leer. */
	purchasedAt: string;
	totalCents: number;
	lines: ParsedLine[];
};

/**
 * Das Schema für Structured Outputs.
 *
 * Nichts ist nullable und alles ist Pflicht: „" und 0 stehen für „nicht
 * erkannt". Ein `anyOf` mit `null` wäre ausdrucksstärker, aber die
 * Schema-Unterstützung ist eng umrissen — und eine Antwort, die am Schema
 * scheitert, kostet einen kompletten Bildaufruf.
 */
export function receiptSchema(categoryNames: string[]): Record<string, unknown> {
	return {
		type: 'object',
		additionalProperties: false,
		required: ['store', 'purchased_at', 'total_cents', 'lines'],
		properties: {
			store: { type: 'string', description: 'Name des Marktes, sonst leerer String' },
			purchased_at: { type: 'string', description: 'Kaufdatum als YYYY-MM-DD, sonst leer' },
			total_cents: { type: 'integer', description: 'Endsumme in Cent, sonst 0' },
			lines: {
				type: 'array',
				items: {
					type: 'object',
					additionalProperties: false,
					required: [
						'raw_text',
						'name',
						'category',
						'quantity',
						'unit',
						'price_cents',
						'confidence'
					],
					properties: {
						raw_text: { type: 'string', description: 'Zeile wörtlich wie gedruckt' },
						name: { type: 'string', description: 'Alltagsname, deutsch, ohne Marke und Größe' },
						category: { type: 'string', enum: categoryNames },
						quantity: { type: 'number', description: 'Zähleinheit, nicht Inhaltsmenge' },
						unit: { type: 'string', enum: [...UNITS] },
						price_cents: { type: 'integer', description: 'Zeilenpreis in Cent, sonst 0' },
						confidence: { type: 'string', enum: ['high', 'low'] }
					}
				}
			}
		}
	};
}

/**
 * Der Prompt.
 *
 * Die beiden Punkte, an denen es sonst schiefgeht, stehen bewusst vorn:
 * was **keine** Warenzeile ist (Pfand, Rabatt, Summe), und dass `unit` die
 * Zähleinheit ist — vier Packungen, nicht 4000 ml. Ohne den zweiten Punkt
 * landet „2 x MILCH 1L" als 2000 ml im Bestand und jede Mengenanzeige lügt.
 */
export const RECEIPT_SYSTEM_PROMPT = `Du liest deutsche Kassenbons und gibst die gekauften Waren als JSON zurück.

Was eine Warenzeile ist:
- Nur tatsächlich gekaufte Lebensmittel, Getränke und Haushaltsware.
- KEINE Zeilen für Pfand, Leergut, Rabatt, Coupon, Treuepunkte, Zwischensumme,
  Summe, MwSt, Zahlart, Rückgeld, Adresse oder Kassennummer.
- Eine Zeile pro Artikel. Steht eine Mengenzeile darüber ("2 x 1,49"), gehört
  sie zum Artikel darunter und wird nicht eigenständig ausgegeben.

Felder:
- raw_text: die Artikelzeile wörtlich wie gedruckt, inklusive Abkürzungen.
- name: der Alltagsname auf Deutsch, ohne Marke, ohne Größenangabe, ohne
  Großschreibung. "BIO-TOFU NAT 400G" wird zu "Tofu natur",
  "G&G H-MILCH 3,5%" wird zu "H-Milch".
- quantity und unit: die ZÄHLEINHEIT, nicht die Inhaltsmenge.
  "2 x MILCH 1L" ist quantity 2, unit "pack" — nicht 2000 ml.
  Einzelne Stücke (Gurke, Brot) sind "piece", verpackte Ware ist "pack".
  Nur lose gewogene Ware bekommt "g" oder "ml" mit dem gewogenen Wert:
  "TOMATEN 0,412 kg" ist quantity 412, unit "g".
  Ohne erkennbare Menge: quantity 1.
- category: genau einer der vorgegebenen Werte. Im Zweifel "Sonstiges".
- price_cents: der Zeilenpreis in Cent, 0 wenn unlesbar.
- confidence: "high", wenn Name und Menge sicher lesbar sind. "low" bei
  geratener Schrift, unklarer Abkürzung oder geschätzter Menge.

Mehrere Bilder sind Ausschnitte DESSELBEN Bons, von oben nach unten. Zeilen,
die auf zwei Bildern auftauchen, nur einmal ausgeben.

Ist keine Zeile lesbar, gib eine leere Liste zurück. Rate nichts hinzu, was
nicht auf dem Bon steht.`;

/** Fehlt der Wert oder passt er nicht, gilt er als „nicht erkannt". */
function asString(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function asCents(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/**
 * Prüft die Modellantwort, statt ihr zu glauben.
 *
 * Structured Outputs garantieren das Schema — aber nicht, dass das Modell
 * überhaupt geantwortet hat (Abbruch, Verweigerung, abgeschnittene Ausgabe).
 * Was hier durchkommt, darf ohne weitere Prüfung in die Datenbank.
 */
export function coerceReceipt(raw: unknown, knownCategories: string[]): ParsedReceipt {
	const source = (raw ?? {}) as Record<string, unknown>;
	const rawLines = Array.isArray(source.lines) ? source.lines : [];

	const lines: ParsedLine[] = [];
	for (const entry of rawLines) {
		if (typeof entry !== 'object' || entry === null) continue;
		const line = entry as Record<string, unknown>;

		const rawText = asString(line.raw_text);
		const name = asString(line.name) || rawText;
		if (name === '') continue;

		const unit = UNITS.includes(line.unit as Unit) ? (line.unit as Unit) : 'piece';
		const quantityValue = typeof line.quantity === 'number' ? line.quantity : 1;
		const quantity =
			Number.isFinite(quantityValue) && quantityValue > 0 ? Math.min(quantityValue, 100_000) : 1;

		const category = asString(line.category);

		lines.push({
			rawText: rawText || name,
			// Ein zu langer Name sprengt die Zeile in der Liste, nicht die Datenbank.
			name: name.slice(0, 80),
			category: knownCategories.includes(category) ? category : 'Sonstiges',
			quantity,
			unit,
			priceCents: asCents(line.price_cents),
			confidence: line.confidence === 'high' ? 'high' : 'low'
		});
	}

	return {
		store: asString(source.store).slice(0, 60),
		purchasedAt: /^\d{4}-\d{2}-\d{2}$/.test(asString(source.purchased_at))
			? asString(source.purchased_at)
			: '',
		totalCents: asCents(source.total_cents),
		lines
	};
}

/**
 * Der Schlüssel der Alias-Tabelle.
 *
 * „BIO-TOFU NAT 400G" und „BIO TOFU NAT.400 G" sollen derselbe Eintrag sein:
 * Groß-/Kleinschreibung, Leerzeichen und Satzzeichen tragen auf einem Bon
 * keine Bedeutung, die wir bräuchten.
 */
export function normalizeRawText(text: string): string {
	return text.toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
}
