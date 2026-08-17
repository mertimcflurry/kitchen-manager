import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { listCategories, updateCategory } from '$lib/server/db/queries';
import { getUser } from '$lib/server/db/users';
import type { Actions, PageServerLoad } from './$types';

function parseId(data: FormData): number | null {
	const id = Number(data.get('id'));
	return Number.isInteger(id) && id > 0 ? id : null;
}

export const load: PageServerLoad = ({ locals }) => {
	return {
		categories: listCategories(db),
		currentUser: getUser(db, locals.userId)
	};
};

export const actions: Actions = {
	/**
	 * Speichert bei jedem `change`, kein eigener Sichern-Knopf. Ein leeres oder
	 * unlesbares Feld darf die Seite nicht zum Absturz bringen, aber auch nicht
	 * still "gespeichert" melden, obwohl nichts ankam — deshalb wird hier schon
	 * geprüft (Ganzzahl, Bereich) und mit `fail()` beantwortet.
	 * `openedShelfLifeDays` bleibt die Ausnahme: leer ist dort gültig und heißt
	 * „Öffnen ändert nichts", weil die Spalte nullbar ist.
	 */
	update: async ({ request }) => {
		const data = await request.formData();
		const id = parseId(data);
		if (!id) return fail(400, { message: 'Ungültig' });

		const rawDefault = data.get('defaultShelfLifeDays');
		if (typeof rawDefault !== 'string' || rawDefault === '') {
			// Anders als openedShelfLifeDays ist die Spalte nicht nullbar — ein
			// leeres Feld ist kein gültiger „nichts ändern"-Zustand, sondern ein
			// Fehler, sonst zeigt die UI „gespeichert" für etwas, das nie ankam.
			return fail(400, { message: 'Haltbarkeit darf nicht leer sein' });
		}
		const parsedDefault = Number(rawDefault.replace(',', '.'));
		if (
			!Number.isFinite(parsedDefault) ||
			!Number.isInteger(parsedDefault) ||
			parsedDefault <= 0 ||
			parsedDefault > 3650
		) {
			return fail(400, { message: 'Haltbarkeit muss eine ganze Zahl zwischen 1 und 3650 sein' });
		}
		const defaultShelfLifeDays = parsedDefault;

		const rawOpened = data.get('openedShelfLifeDays');
		let openedShelfLifeDays: number | null | undefined;
		if (typeof rawOpened === 'string') {
			if (rawOpened === '') {
				openedShelfLifeDays = null;
			} else {
				const parsed = Number(rawOpened.replace(',', '.'));
				if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0 || parsed > 3650) {
					return fail(400, {
						message: 'Haltbarkeit ab Öffnen muss eine ganze Zahl zwischen 1 und 3650 sein'
					});
				}
				openedShelfLifeDays = parsed;
			}
		}

		updateCategory(db, id, { defaultShelfLifeDays, openedShelfLifeDays });
		return { ok: true };
	}
};
