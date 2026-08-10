import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { LOCATIONS, type Location } from '$lib/domain';
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

		const quantity = Number(data.get('quantity')) || 1;
		addStock(db, { productId, quantity, location: parseLocation(data.get('location')) });
		return { ok: true, added: String(data.get('name') ?? '') };
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
			quantity: Number(data.get('quantity')) || 1,
			location: parseLocation(data.get('location'))
		});
		return { ok: true, added: name };
	}
};
