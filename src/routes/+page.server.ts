import { db } from '$lib/server/db';
import { countByLocation, listStock } from '$lib/server/db/queries';
import { parseLocation, stockActions } from '$lib/server/stock-actions';
import type { Actions, PageServerLoad } from './$types';

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

// Dieselben Mutationen wie auf „Bald schlecht" — eine Zeile, ein Verhalten.
export const actions: Actions = stockActions;
