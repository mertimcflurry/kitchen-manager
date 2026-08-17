import { db } from '$lib/server/db';
import { countUrgent } from '$lib/server/db/queries';
import { getUser } from '$lib/server/db/users';
import type { LayoutServerLoad } from './$types';

// Auf jeder Seite verfügbar, weil die Bottom-Nav auf jeder Seite steht.
// invalidateAll() nach jeder Bestandsänderung (siehe forms.ts) hält die Zahl
// aktuell, ohne dass die Ablauf-Seite dafür geöffnet werden müsste.
//
// `/nutzer` läuft ohne `locals.userId` durch den Hook (siehe hooks.server.ts) —
// genau dort ist ja noch kein Nutzer gewählt. Das Layout lädt trotzdem für
// jede Route, deshalb hier defensiv statt die Seite mit einem fehlenden
// Bind-Parameter abstürzen zu lassen.
//
// `currentUser` geht an `PageHeader` für den Avatar-Kreis oben rechts (siehe
// dort) — auf jeder Seite geladen statt in jeder Route einzeln, damit keine
// Seite den Avatar vergisst.
export const load: LayoutServerLoad = ({ locals }) => {
	return {
		urgentCount: locals.userId ? countUrgent(db, locals.userId) : 0,
		currentUser: locals.userId ? getUser(db, locals.userId) : null
	};
};
