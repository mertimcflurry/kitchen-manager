import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { FILL_LEVELS, LOCATIONS, type FillLevel, type Location } from '$lib/domain';
import {
	adjustQuantity,
	consume,
	countByLocation,
	listStock,
	setFillLevel,
	undoConsume,
	updateStockItem
} from '$lib/server/db/queries';
import type { Actions, PageServerLoad } from './$types';

function parseLocation(value: string | null): Location | undefined {
	return LOCATIONS.includes(value as Location) ? (value as Location) : undefined;
}

function parseId(data: FormData): number | null {
	const id = Number(data.get('id'));
	return Number.isInteger(id) && id > 0 ? id : null;
}

export const load: PageServerLoad = ({ url }) => {
	// Der Ort steht in der URL, nicht in einem Store: dann bleibt die Auswahl
	// beim Zurück-Wischen erhalten und ein Reload landet nicht wieder auf „Alle".
	const location = parseLocation(url.searchParams.get('ort'));
	return {
		location: location ?? null,
		items: listStock(db, location),
		counts: countByLocation(db)
	};
};

export const actions: Actions = {
	/** Menge um delta ändern. Bei null gilt der Posten als aufgebraucht. */
	adjust: async ({ request }) => {
		const data = await request.formData();
		const id = parseId(data);
		const delta = Number(data.get('delta'));
		if (!id || !Number.isFinite(delta) || delta === 0) return fail(400, { message: 'Ungültig' });

		adjustQuantity(db, id, delta);
		return { ok: true };
	},

	/** Aufgebraucht. Gibt den vorherigen Zustand zurück, damit Undo ihn kennt. */
	consume: async ({ request }) => {
		const data = await request.formData();
		const id = parseId(data);
		if (!id) return fail(400, { message: 'Ungültig' });

		const snapshot = consume(db, id);
		if (!snapshot) return fail(404, { message: 'Nicht gefunden' });
		return { ok: true, undo: snapshot };
	},

	undo: async ({ request }) => {
		const data = await request.formData();
		const id = parseId(data);
		const quantity = Number(data.get('quantity'));
		const rawFill = data.get('fillLevel');
		if (!id || !Number.isFinite(quantity)) return fail(400, { message: 'Ungültig' });

		undoConsume(db, {
			id,
			quantity,
			fillLevel: rawFill === null || rawFill === '' ? null : Number(rawFill)
		});
		return { ok: true };
	},

	fill: async ({ request }) => {
		const data = await request.formData();
		const id = parseId(data);
		const raw = data.get('level');
		if (!id) return fail(400, { message: 'Ungültig' });

		if (raw === null || raw === '') {
			setFillLevel(db, id, null);
			return { ok: true };
		}
		const level = Number(raw);
		if (!FILL_LEVELS.includes(level as FillLevel)) return fail(400, { message: 'Ungültige Stufe' });

		setFillLevel(db, id, level as FillLevel);
		return { ok: true };
	},

	update: async ({ request }) => {
		const data = await request.formData();
		const id = parseId(data);
		if (!id) return fail(400, { message: 'Ungültig' });

		const location = parseLocation(data.get('location') as string | null);
		const rawDate = data.get('bestBefore');

		let bestBefore: Date | null | undefined;
		if (typeof rawDate === 'string') {
			if (rawDate === '') {
				bestBefore = null;
			} else {
				// <input type="date"> liefert YYYY-MM-DD. Als lokales Datum lesen,
				// sonst verschiebt die Zeitzone das MHD um einen Tag.
				const [y, m, d] = rawDate.split('-').map(Number);
				if (!y || !m || !d) return fail(400, { message: 'Datum unlesbar' });
				bestBefore = new Date(y, m - 1, d);
			}
		}

		updateStockItem(db, id, { location, bestBefore });
		return { ok: true };
	}
};
