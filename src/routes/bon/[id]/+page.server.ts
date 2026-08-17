import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { LOCATIONS, UNITS, type Location, type Unit } from '$lib/domain';
import { confirmReceipt, discardReceipt, loadReceiptReview } from '$lib/server/db/receipts';
import { listCategories } from '$lib/server/db/queries';
import type { Actions, PageServerLoad } from './$types';

function parseId(value: string): number {
	const id = Number(value);
	if (!Number.isInteger(id) || id <= 0) error(404, 'Kein solcher Bon');
	return id;
}

export const load: PageServerLoad = ({ params, locals }) => {
	const review = loadReceiptReview(db, locals.userId, parseId(params.id));
	if (!review) error(404, 'Kein solcher Bon');
	if (review.status !== 'pending') redirect(303, '/');

	return {
		receipt: review,
		// Nur Name und Emoji: die Karte braucht den visuellen Anker, sonst nichts.
		categories: listCategories(db).map((c) => ({ name: c.name, emoji: c.emoji }))
	};
};

/**
 * Der Prüf-Screen schickt seine Entscheidungen in einem Rutsch.
 *
 * Deshalb kommt hier JSON statt einzelner Formularfelder — und deshalb wird
 * hier auch alles geprüft: der Client hat die Werte in der Hand gehabt.
 */
function parseDecisions(raw: FormDataEntryValue | null) {
	if (typeof raw !== 'string') return null;

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!Array.isArray(parsed)) return null;

	const decisions = [];
	for (const entry of parsed) {
		if (typeof entry !== 'object' || entry === null) return null;
		const line = entry as Record<string, unknown>;

		const id = Number(line.id);
		const name = String(line.name ?? '').trim();
		const quantity = Number(line.quantity);

		if (!Number.isInteger(id) || id <= 0) return null;
		if (name === '' || name.length > 80) return null;
		if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100_000) return null;
		if (!UNITS.includes(line.unit as Unit)) return null;
		if (!LOCATIONS.includes(line.location as Location)) return null;

		decisions.push({
			id,
			name,
			quantity,
			unit: line.unit as Unit,
			location: line.location as Location,
			keep: line.keep !== false
		});
	}
	return decisions;
}

export const actions: Actions = {
	confirm: async ({ request, params, locals }) => {
		const data = await request.formData();
		const decisions = parseDecisions(data.get('lines'));
		if (!decisions) return fail(400, { message: 'Die Zeilen kamen unvollständig an.' });

		const { added } = confirmReceipt(db, locals.userId, parseId(params.id), decisions);
		redirect(303, added > 0 ? `/?eingelagert=${added}` : '/');
	},

	/** Der ganze Bon war nichts — kein Dialog davor, der Bon bleibt in der DB. */
	discard: async ({ params, locals }) => {
		discardReceipt(db, locals.userId, parseId(params.id));
		redirect(303, '/bon');
	}
};
