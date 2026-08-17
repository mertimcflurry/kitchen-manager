import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	addProductToList,
	addTextToList,
	clearDoneShopping,
	listShopping,
	setShoppingDone,
	shoppingSuggestions
} from '$lib/server/db/shopping';
import type { Actions, PageServerLoad } from './$types';

function parseId(data: FormData, key = 'id'): number | null {
	const id = Number(data.get(key));
	return Number.isInteger(id) && id > 0 ? id : null;
}

export const load: PageServerLoad = ({ locals }) => {
	const { open, done } = listShopping(db, locals.userId);
	return { open, done, suggestions: shoppingSuggestions(db, locals.userId) };
};

export const actions: Actions = {
	/** Abhaken und wieder aufmachen — dieselbe Action, der Zustand kommt mit. */
	toggle: async ({ request, locals }) => {
		const data = await request.formData();
		const id = parseId(data);
		if (!id) return fail(400, { message: 'Ungültig' });

		setShoppingDone(db, locals.userId, id, data.get('done') === 'true');
		return { ok: true };
	},

	/** Ein Vorschlag oder ein Chip: Produkt-ID statt Text. */
	addProduct: async ({ request, locals }) => {
		const data = await request.formData();
		const productId = parseId(data, 'productId');
		if (!productId) return fail(400, { message: 'Ungültig' });

		addProductToList(
			db,
			locals.userId,
			productId,
			data.get('source') === 'suggested' ? 'suggested' : 'manual'
		);
		return { ok: true };
	},

	/** Freitext aus dem Feld. Leeres bleibt folgenlos statt zu meckern. */
	addText: async ({ request, locals }) => {
		const data = await request.formData();
		const text = String(data.get('text') ?? '');
		addTextToList(db, locals.userId, text);
		return { ok: true };
	},

	clearDone: async ({ locals }) => {
		clearDoneShopping(db, locals.userId);
		return { ok: true };
	}
};
