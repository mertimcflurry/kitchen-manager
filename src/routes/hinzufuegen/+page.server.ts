import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { stockItem } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { formatQuantity } from '$lib/domain';
import { INPUT_UNITS, LOCATIONS, toBaseUnit, type InputUnit, type Location } from '$lib/domain';
import {
	addStock,
	findOrCreateProduct,
	frequentProducts,
	searchProducts
} from '$lib/server/db/queries';
import type { Actions, PageServerLoad } from './$types';

function parseLocation(value: FormDataEntryValue | null): Location {
	return LOCATIONS.includes(value as Location) ? (value as Location) : 'fridge';
}

/** Menge und Einheit aus dem Formular, auf die Basiseinheit gebracht. */
function parseAmount(data: FormData): { quantity?: number; unit?: 'piece' | 'pack' | 'g' | 'ml' } {
	const rawQuantity = data.get('quantity');
	const rawUnit = data.get('unit');
	if (typeof rawQuantity !== 'string' || rawQuantity === '') return {};
	if (!INPUT_UNITS.includes(rawUnit as InputUnit)) return {};

	const parsed = Number(rawQuantity.replace(',', '.'));
	if (!Number.isFinite(parsed) || parsed <= 0) return {};
	return toBaseUnit(parsed, rawUnit as InputUnit);
}

/**
 * Was tatsächlich eingelagert wurde, in Worten.
 *
 * Ohne Mengenangabe entscheidet der letzte Kauf — dann soll die Rückmeldung
 * zeigen, worauf das hinauslief, statt es raten zu lassen.
 */
function describe(id: number): string {
	const row = db.select().from(stockItem).where(eq(stockItem.id, id)).get();
	return row ? formatQuantity(row.quantity, row.unit) : '';
}

export const load: PageServerLoad = () => {
	return {
		// Die Chips: was am häufigsten gekauft wurde, steht vorn. Das meiste,
		// was nachgetragen wird, ist Nachkauf von immer demselben.
		frequent: frequentProducts(db, 12),
		// Der ganze Katalog wandert mit, damit die Suche ohne Roundtrip filtert.
		// Bei einem Haushalt bleibt die Liste klein genug dafür.
		all: searchProducts(db, '', 500)
	};
};

export const actions: Actions = {
	/** Bekanntes Produkt in den Bestand legen. */
	add: async ({ request }) => {
		const data = await request.formData();
		const productId = Number(data.get('productId'));
		if (!Number.isInteger(productId) || productId <= 0) return fail(400, { message: 'Ungültig' });

		// Ohne Angabe entscheidet der letzte Kauf dieses Produkts.
		const id = addStock(db, {
			productId,
			location: parseLocation(data.get('location')),
			...parseAmount(data)
		});
		return { ok: true, added: String(data.get('name') ?? ''), amount: describe(id) };
	},

	/** Neues Produkt anlegen und gleich einlagern. */
	create: async ({ request }) => {
		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		if (name.length === 0) return fail(400, { message: 'Name fehlt' });
		if (name.length > 80) return fail(400, { message: 'Name zu lang' });

		const productId = findOrCreateProduct(db, name);
		addStock(db, {
			productId,
			location: parseLocation(data.get('location')),
			...parseAmount(data)
		});
		return { ok: true, added: name };
	}
};
