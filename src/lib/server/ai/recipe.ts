/**
 * Der Aufruf für den Rezeptvorschlag.
 *
 * Liegt unter `src/lib/server/`, damit SvelteKit garantiert, dass weder Key
 * noch Prompt je im Browser-Bundle landen. Aufrufbar ausschließlich aus
 * `+page.server.ts`.
 */

import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';
import {
	coerceRecipe,
	recipeSchema,
	buildRecipeUserPrompt,
	RECIPE_SYSTEM_PROMPT,
	type ParsedRecipe,
	type RecipePreference,
	type StockLineInput
} from './recipe-parse';
import { AiError, toUserError } from './errors';

/**
 * Opus statt Sonnet: „was geht aus diesen 23 Sachen, bevorzugt mit dem, was
 * Freitag abläuft" ist ein Randbedingungsproblem, kein Abtippen wie beim Bon.
 */
const DEFAULT_MODEL = 'claude-opus-5';

/** Opus mit Denken braucht 10–20 Sekunden; großzügiger als der Bon-Timeout. */
const REQUEST_TIMEOUT_MS = 120_000;

export type RecipeSuggestion = {
	recipe: ParsedRecipe;
	/** Rohantwort für Fehlersuche und Prompt-Tuning. */
	raw: string;
};

function createClient(): Anthropic {
	const apiKey = env.ANTHROPIC_API_KEY?.trim();
	if (!apiKey) {
		throw new AiError('Kein API-Schlüssel hinterlegt (ANTHROPIC_API_KEY in .env).', false);
	}
	return new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
}

/**
 * Fragt das Modell nach einem Rezeptvorschlag aus dem aktuellen Bestand.
 *
 * `stock` kommt roh aus der Datenbank (siehe `cooking.ts`), der Prompt-Text
 * entsteht erst hier — Trennung von DB-Zugriff und Textbau. Kein
 * Prompt-Caching: der Bestand ändert sich bei jeder Mengenänderung, und der
 * Prompt liegt unter der Mindestgröße.
 */
export async function suggestRecipe(
	stock: StockLineInput[],
	portions: number,
	rejectedTitle?: string,
	preference?: RecipePreference
): Promise<RecipeSuggestion> {
	const client = createClient();
	const model = env.ANTHROPIC_RECIPE_MODEL?.trim() || DEFAULT_MODEL;
	const stockIds = stock.map((row) => row.id);

	try {
		const response = await client.messages.create({
			model,
			// Denken und Text teilen sich dieses Budget — knapp bemessen bräche
			// das Rezept mitten im dritten Schritt ab.
			max_tokens: 4000,
			// Kein `thinking`-Objekt: Opus 5 denkt standardmäßig, explizit
			// abschalten würde bei diesem Aufruf gegen den Sinn arbeiten.
			output_config: {
				effort: 'medium',
				format: { type: 'json_schema', schema: recipeSchema(stockIds) }
			},
			system: RECIPE_SYSTEM_PROMPT,
			messages: [
				{
					role: 'user',
					content: buildRecipeUserPrompt(stock, portions, rejectedTitle, preference)
				}
			]
		});

		if (response.stop_reason === 'refusal') {
			throw new AiError('Das Modell hat den Vorschlag abgelehnt.', false);
		}
		// Denken und Text teilen sich `max_tokens` — reißt das Budget, kommt
		// abgeschnittenes JSON. Ein Retry bei gleichem Bestand liefe wieder ins
		// selbe Limit, „unlesbar" wäre also falsch und irreführend.
		if (response.stop_reason === 'max_tokens') {
			throw new AiError(
				'Die Antwort wurde zu lang und wurde abgeschnitten. Mit weniger Bestand oder einer engeren Auswahl noch einmal versuchen.',
				false
			);
		}

		const text = response.content.find((block) => block.type === 'text')?.text ?? '';
		if (text.trim() === '') throw new AiError('Das Modell hat nichts zurückgegeben.', true);

		console.log(
			`[kochen] ${model}: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out`
		);

		let json: unknown;
		try {
			json = JSON.parse(text);
		} catch {
			throw new AiError('Die Antwort war unlesbar. Noch einmal versuchen.', true);
		}

		const recipe = coerceRecipe(json, new Set(stockIds));
		if (recipe === null) {
			throw new AiError('Kein brauchbarer Vorschlag dabei. Noch einmal versuchen.', true);
		}

		return { recipe, raw: text };
	} catch (error) {
		throw toUserError(error);
	}
}
