import { db } from '$lib/server/db';
import { countUrgent } from '$lib/server/db/queries';
import type { LayoutServerLoad } from './$types';

// Auf jeder Seite verfügbar, weil die Bottom-Nav auf jeder Seite steht.
// invalidateAll() nach jeder Bestandsänderung (siehe forms.ts) hält die Zahl
// aktuell, ohne dass die Ablauf-Seite dafür geöffnet werden müsste.
//
// `/nutzer` läuft ohne `locals.userId` durch den Hook (siehe hooks.server.ts) —
// genau dort ist ja noch kein Nutzer gewählt. Das Layout lädt trotzdem für
// jede Route, deshalb hier defensiv statt die Seite mit einem fehlenden
// Bind-Parameter abstürzen zu lassen.
export const load: LayoutServerLoad = ({ locals }) => {
	return { urgentCount: locals.userId ? countUrgent(db, locals.userId) : 0 };
};
