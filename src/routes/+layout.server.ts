import { db } from '$lib/server/db';
import { countUrgent } from '$lib/server/db/queries';
import type { LayoutServerLoad } from './$types';

// Auf jeder Seite verfügbar, weil die Bottom-Nav auf jeder Seite steht.
// invalidateAll() nach jeder Bestandsänderung (siehe forms.ts) hält die Zahl
// aktuell, ohne dass die Ablauf-Seite dafür geöffnet werden müsste.
export const load: LayoutServerLoad = () => {
	return { urgentCount: countUrgent(db) };
};
