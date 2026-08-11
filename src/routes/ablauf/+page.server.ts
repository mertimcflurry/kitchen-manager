import { daysUntil, EXPIRY_HORIZON_DAYS } from '$lib/date';
import { db } from '$lib/server/db';
import { listStock } from '$lib/server/db/queries';
import { stockActions } from '$lib/server/stock-actions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	// Ohne Ort-Argument liefert listStock den gesamten offenen Bestand, bereits
	// nach Ablauf sortiert (NULL hinten). Das ist genau die Dringlichkeits-
	// reihenfolge, die dieser Screen braucht — keine zweite Abfrage nötig.
	const all = listStock(db);
	const items = all.filter(
		(i) => i.bestBefore !== null && daysUntil(i.bestBefore) <= EXPIRY_HORIZON_DAYS
	);

	return {
		items,
		// „Der Rest hält länger" ist die beruhigende Auskunft, wenn die Liste leer
		// oder kurz ist — sonst wirkt der Screen kaputt statt entspannt.
		laterCount: all.length - items.length,
		horizonDays: EXPIRY_HORIZON_DAYS
	};
};

// Dieselben Mutationen wie im Bestand — dieselbe Zeile, dasselbe Verhalten.
export const actions: Actions = stockActions;
