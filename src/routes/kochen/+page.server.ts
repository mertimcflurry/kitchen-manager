import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { listStock } from '$lib/server/db/queries';
import {
	cookIngredients,
	recipeStock,
	undoCookIngredients,
	type CookedSnapshot
} from '$lib/server/db/cooking';
import { suggestRecipe } from '$lib/server/ai/recipe';
import type { RecipeDiet, RecipeMood } from '$lib/server/ai/recipe-parse';
import { toUserError } from '$lib/server/ai/errors';
import { RECIPE_PORTIONS, type RecipePortions } from '$lib/domain';
import type { Actions, PageServerLoad } from './$types';

/** Wie viele der dringendsten Posten die Wartezeit füllen — mehr wäre schon wieder eine Liste. */
const WAITING_PREVIEW_COUNT = 3;

function parsePortions(value: string | null): RecipePortions {
	const parsed = Number(value);
	return (RECIPE_PORTIONS as readonly number[]).includes(parsed) ? (parsed as RecipePortions) : 1;
}

export const load: PageServerLoad = ({ url }) => {
	return {
		portions: parsePortions(url.searchParams.get('portionen')),
		// Ohne Modell bekannt: was ohnehin bald weg muss — trägt die Wartezeit
		// des Vorschlags mit Inhalt statt mit einem Spinner.
		urgent: listStock(db).slice(0, WAITING_PREVIEW_COUNT)
	};
};

export const actions: Actions = {
	/**
	 * Ein Vorschlag aus dem aktuellen Bestand. `rejectedTitle` gesetzt heißt
	 * „Anderer Vorschlag" — derselbe Aufruf, nur mit einer Zeile mehr im Prompt.
	 */
	vorschlag: async ({ request, url }) => {
		const data = await request.formData();
		const portions = parsePortions(
			(data.get('portions') as string | null) ?? url.searchParams.get('portionen')
		);
		const rejectedTitle = String(data.get('rejectedTitle') ?? '').trim() || undefined;
		const rawMood = String(data.get('mood') ?? '').trim();
		const mood: RecipeMood | undefined =
			rawMood === 'herzhaft' || rawMood === 'süß' ? rawMood : undefined;
		const direction = String(data.get('direction') ?? '').trim() || undefined;
		const rawDiet = String(data.get('diet') ?? '').trim();
		const diet: RecipeDiet | undefined =
			rawDiet === 'vegetarisch' || rawDiet === 'vegan' ? rawDiet : undefined;

		try {
			const { recipe } = await suggestRecipe(recipeStock(db), portions, rejectedTitle, {
				mood,
				direction,
				diet
			});
			return { ok: true, recipe };
		} catch (error) {
			// `suggestRecipe` übersetzt schon über `toUserError`; hier trotzdem
			// noch einmal durchreichen statt auf `AiError` zu vertrauen — trifft
			// den auch, falls z. B. `recipeStock(db)` selbst wirft. Den
			// Originalfehler loggt `toUserError` zentral, nicht hier einzeln.
			const aiError = toUserError(error);
			return fail(aiError.retryable ? 503 : 502, { message: aiError.message });
		}
	},

	/**
	 * Bucht ab, was sich abbuchen lässt — ein Tap, keine Zeile für Zeile.
	 * `ingredients` ist die vom Client mitgeschickte `source: "stock"`-Auswahl
	 * des zuletzt angezeigten Rezepts, als JSON: `{stockItemId, amountBase}[]`.
	 */
	gekocht: async ({ request }) => {
		const data = await request.formData();
		const raw = data.get('ingredients');
		if (typeof raw !== 'string') return fail(400, { message: 'Ungültig' });

		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			return fail(400, { message: 'Ungültig' });
		}
		if (!Array.isArray(parsed)) return fail(400, { message: 'Ungültig' });

		const ingredients = parsed.filter(
			(entry): entry is { stockItemId: number; amountBase: number } =>
				typeof entry === 'object' &&
				entry !== null &&
				Number.isInteger((entry as Record<string, unknown>).stockItemId) &&
				typeof (entry as Record<string, unknown>).amountBase === 'number'
		);

		const snapshots = cookIngredients(db, ingredients);
		return { ok: true, undo: snapshots };
	},

	/** Macht das Abbuchen rückgängig — Snapshot-Restore wie beim „Aufgebraucht"-Undo. */
	undo: async ({ request }) => {
		const data = await request.formData();
		const raw = data.get('snapshots');
		if (typeof raw !== 'string') return fail(400, { message: 'Ungültig' });

		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			return fail(400, { message: 'Ungültig' });
		}
		if (!Array.isArray(parsed)) return fail(400, { message: 'Ungültig' });

		const snapshots = parsed.filter((entry): entry is CookedSnapshot => {
			if (typeof entry !== 'object' || entry === null) return false;
			const row = entry as Record<string, unknown>;
			const fillLevelBefore = row.fillLevelBefore;
			return (
				Number.isInteger(row.id) &&
				typeof row.quantityBefore === 'number' &&
				(fillLevelBefore === null || typeof fillLevelBefore === 'number')
			);
		});

		undoCookIngredients(db, snapshots);
		return { ok: true };
	}
};
