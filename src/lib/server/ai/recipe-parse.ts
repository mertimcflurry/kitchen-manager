/**
 * Alles am Rezeptvorschlag, was ohne Netz und ohne SvelteKit auskommt:
 * Schema, Prompt-Bausteine und die Prüfung der Modellantwort.
 *
 * Bewusst getrennt von `recipe.ts`: dort steckt der Anthropic-Aufruf und damit
 * `$env`, was in Tests nicht auflösbar wäre. Hier liegt der Teil, den Tests
 * anfassen können — und genau der, in dem Fehler wehtun.
 */

import { daysUntil } from '../../date';
import {
	isCountable,
	formatQuantity,
	remainingQuantity,
	LOCATION_LABELS,
	type Location,
	type Unit
} from '../../domain';

/** Drei Zustände statt eines `have`-Flags — Salz kommt weder aus dem Bestand noch fehlt es. */
export type RecipeIngredientSource = 'stock' | 'staple' | 'missing';

/** Zwei Chips statt eines Freitextfelds für den häufigsten Fall — der Rest ist `direction`. */
export type RecipeMood = 'herzhaft' | 'süß';

/**
 * Anders als `mood`: keine Tendenz, sondern ein Ausschluss. `vegan` schließt
 * `vegetarisch` schon ein, deshalb single-select statt einer Kombination.
 */
export type RecipeDiet = 'vegetarisch' | 'vegan';

/** Was der Vorschlag zusätzlich zum Bestand berücksichtigen soll, alles optional. */
export type RecipePreference = {
	mood?: RecipeMood;
	/** Freitext, z. B. „Lasagne" oder „keine Nudeln" — ungeprüft ins Prompt, nur längenbegrenzt. */
	direction?: string;
	diet?: RecipeDiet;
};

export type ParsedRecipeIngredient = {
	name: string;
	/** Menge in Alltagssprache, z. B. „250 g" — das zeigt der Screen an. */
	amountText: string;
	source: RecipeIngredientSource;
	/** Zeigt auf den Bestandsposten, aus dem die Zutat kommt. 0 sonst. */
	stockItemId: number;
	/** Menge in der Einheit des Postens, nur fürs Abbuchen — nicht angezeigt. */
	amountBase: number;
};

export type ParsedRecipe = {
	title: string;
	minutes: number;
	portions: number;
	ingredients: ParsedRecipeIngredient[];
	steps: string[];
};

/** Eine Bestandszeile, so wie sie für den Prompt gebraucht wird. */
export type StockLineInput = {
	id: number;
	name: string;
	quantity: number;
	unit: Unit;
	fillLevel: number | null;
	location: Location;
	bestBefore: Date | null;
};

/**
 * Das Schema für Structured Outputs.
 *
 * `stock_item_id` bekommt ein `enum` aus den echten Bestands-IDs plus 0 —
 * dieselbe Verteidigung wie `category`/`unit` beim Bon: das Modell kann keine
 * Zeile erfinden, die es beim Abbuchen nicht gibt.
 */
export function recipeSchema(stockItemIds: number[]): Record<string, unknown> {
	return {
		type: 'object',
		additionalProperties: false,
		required: ['title', 'minutes', 'portions', 'ingredients', 'steps'],
		properties: {
			title: { type: 'string', description: 'Name des Gerichts, deutsch' },
			minutes: { type: 'integer', description: 'Geschätzte Zubereitungszeit in Minuten' },
			portions: { type: 'integer', description: 'Für wie viele Portionen das Rezept reicht' },
			ingredients: {
				type: 'array',
				items: {
					type: 'object',
					additionalProperties: false,
					required: ['name', 'amount_text', 'source', 'stock_item_id', 'amount_base'],
					properties: {
						name: { type: 'string', description: 'Zutat, deutsch' },
						amount_text: {
							type: 'string',
							description: 'Menge in Alltagssprache, z.B. "250 g"'
						},
						source: {
							type: 'string',
							enum: ['stock', 'staple', 'missing'],
							description:
								'stock: aus dem Bestand. staple: Grundzutat wie Salz, weder Bestand noch Einkauf. missing: muss gekauft werden.'
						},
						stock_item_id: {
							type: 'integer',
							enum: [0, ...stockItemIds],
							description: 'Die #-Nummer des Bestandspostens, 0 wenn nicht "stock"'
						},
						amount_base: {
							type: 'number',
							description:
								'Menge in der Einheit des Postens, nur fürs Abbuchen. 0 wenn nicht "stock".'
						}
					}
				}
			},
			steps: {
				type: 'array',
				items: { type: 'string', description: 'Ein kurzer, im Stehen lesbarer Schritt' }
			}
		}
	};
}

/**
 * Der Systemprompt.
 *
 * Bestand hat Vorrang, höchstens zwei fehlende Zutaten — sonst wird aus der
 * Einkaufsliste (die kurz bleiben muss, damit man sie im Laden noch überblickt)
 * wieder ein zweiter Wocheneinkauf.
 */
export const RECIPE_SYSTEM_PROMPT = `Du schlägst ein einziges Gericht zum Kochen vor, auf Basis eines Kühlschrank- und Vorratsbestands.

Regeln:
- Genau EIN Gericht. Kein Auswahlmenü, keine Alternativen.
- Deutsch, alltagstauglich — etwas, das an einem gewöhnlichen Abend wirklich
  gekocht wird. Keine Sterneküche, keine Zutatenliste mit zwölf Positionen.
- Der Bestand hat Vorrang vor dem, was fehlt. Bevorzuge Zutaten, die bald
  ablaufen — die Tage-Angabe je Posten zeigt das als Zahl, nicht als Bitte.
- Höchstens ZWEI fehlende Zutaten (source "missing"), und jede davon muss in
  jedem gewöhnlichen Supermarkt zu bekommen sein. Passt das Gericht nicht in
  diese Grenze, ein anderes wählen, bei dem es passt.
- Grundzutaten, die praktisch immer da sind, aber nicht einzeln im Bestand
  geführt werden — Salz, Pfeffer, Öl, Zucker, Mehl, Essig — bekommen source
  "staple". Sie gehören weder auf die Einkaufsliste noch zum Bestand.
- Zutaten mit source "stock" tragen die #-Nummer des Postens als
  stock_item_id und die abzuziehende Menge als amount_base, in der Einheit
  dieses Postens — nicht der Rezepteinheit. "staple" und "missing" haben
  stock_item_id 0 und amount_base 0.
- „1 Pck" ist eine ungeöffnete Packung unbekannten Inhalts. Normale
  Packungsgrößen annehmen — ein Karton Milch ist etwa ein Liter, eine Tüte
  Mehl etwa ein Kilo.
- Packungen (Einheit „Pck") werden beim Kochen nicht angebrochen und bleiben
  im Bestand stehen — dafür immer amount_base 0 angeben, unabhängig von der
  im Rezept tatsächlich verwendeten Teilmenge.
- Schritte kurz und im Stehen lesbar: je ein Satz, keine Fließtext-Absätze.
- Keine Nährwerte, keine Kalorien.
- Steht ein abgelehnter Titel dabei ("nicht schon wieder"), ein anderes
  Gericht vorschlagen.
- Steht eine Tendenz oder ein Wunsch dabei, diese/n bevorzugt erfüllen —
  soweit der Bestand das hergibt. Ein Wunsch wie "keine Nudeln" ist ein
  Ausschluss, kein Vorschlag zum Umgehen.
- Steht eine Diät dabei, ist das anders als Tendenz und Wunsch eine harte
  Vorgabe, kein Kompromiss: "vegetarisch" schließt Fleisch und Fisch aus,
  "vegan" zusätzlich Eier, Milchprodukte und Honig. Lieber ein Gericht mit
  mehr fehlenden Zutaten wählen, als die Diät zu verletzen.`;

/** Kurztext für die Tage bis MHD — die Zahl trägt „bald ablaufen bevorzugen", keine Bitte. */
function bestBeforeText(bestBefore: Date | null, now: Date): string {
	if (bestBefore === null) return 'ohne MHD';
	const days = daysUntil(bestBefore, now);
	if (days < 0) return 'abgelaufen';
	if (days === 0) return 'läuft heute ab';
	if (days === 1) return 'läuft morgen ab';
	return `${days} Tage`;
}

/**
 * Eine Bestandszeile als Prompt-Text: `#<id> <Name> · <Menge> · <Ort> · <MHD>`.
 *
 * Bei Zählbarem kommt noch dazu, ob der Posten schon angebrochen ist — das
 * entscheidet, ob „1 Pck" wirklich eine volle Packung ist oder ein Rest.
 */
export function formatStockLine(row: StockLineInput, now: Date = new Date()): string {
	const amount = formatQuantity(remainingQuantity(row.quantity, row.unit, row.fillLevel), row.unit);
	const parts = [
		`#${row.id} ${row.name}`,
		amount,
		LOCATION_LABELS[row.location],
		bestBeforeText(row.bestBefore, now)
	];
	if (isCountable(row.unit)) parts.push(row.fillLevel === null ? 'ungeöffnet' : 'angebrochen');
	return parts.join(' · ');
}

export function formatStockForPrompt(rows: StockLineInput[], now: Date = new Date()): string {
	if (rows.length === 0) return '(Bestand ist leer)';
	return rows.map((row) => formatStockLine(row, now)).join('\n');
}

/** Längenbegrenzung für `direction` — ein Wunsch ist ein Stichwort, kein Absatz. */
const MAX_DIRECTION_LENGTH = 80;

/**
 * Der Nutzerteil: Bestand als Zeilen (nicht als JSON — das liest sich für das
 * Modell wie ein Kühlschrank, nicht wie eine Tabelle), Portionenzahl, beim
 * Nachschlag der abgelehnte Titel, und optional Tendenz/Wunsch.
 */
export function buildRecipeUserPrompt(
	stockLines: StockLineInput[],
	portions: number,
	rejectedTitle?: string,
	preference?: RecipePreference,
	now: Date = new Date()
): string {
	const lines = [
		'Aktueller Bestand:',
		formatStockForPrompt(stockLines, now),
		'',
		`Portionen: ${portions}`
	];
	if (rejectedTitle && rejectedTitle.trim() !== '') {
		lines.push(`Nicht schon wieder: ${rejectedTitle.trim()}`);
	}
	if (preference?.diet) {
		lines.push(`Diät: ${preference.diet}`);
	}
	if (preference?.mood) {
		lines.push(`Tendenz: ${preference.mood}`);
	}
	const direction = preference?.direction?.trim();
	if (direction) {
		lines.push(`Wunsch: ${direction.slice(0, MAX_DIRECTION_LENGTH)}`);
	}
	return lines.join('\n');
}

function asString(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

/** Großzügige Obergrenze — fängt Unsinn ab, ohne plausible Rezepte zu deckeln. */
const MAX_MINUTES = 240;
const MAX_PORTIONS = 12;
const MAX_STEPS = 12;
const MAX_INGREDIENTS = 20;
const MAX_AMOUNT_BASE = 20_000;

function asBoundedInt(value: unknown, fallback: number, max: number): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max
		? Math.round(value)
		: fallback;
}

/**
 * Prüft die Modellantwort, statt ihr zu glauben.
 *
 * Structured Outputs garantieren das Schema, nicht dass geantwortet wurde
 * (Abbruch, abgeschnittene Ausgabe) oder dass `stock_item_id` wirklich zu
 * `source: "stock"` passt — deshalb hier noch einmal gegen die echten
 * Bestands-IDs geprüft, nicht nur gegen das Schema-Enum.
 *
 * Gibt `null` zurück, wenn nichts Brauchbares dabei ist (leerer Titel oder
 * keine Schritte) — der Aufrufer behandelt das wie „nichts zurückgegeben".
 */
export function coerceRecipe(raw: unknown, knownStockIds: Set<number>): ParsedRecipe | null {
	const source = (raw ?? {}) as Record<string, unknown>;

	const title = asString(source.title).slice(0, 80);
	if (title === '') return null;

	const minutes = asBoundedInt(source.minutes, 30, MAX_MINUTES);
	const portions = asBoundedInt(source.portions, 1, MAX_PORTIONS);

	const rawIngredients = Array.isArray(source.ingredients) ? source.ingredients : [];
	const ingredients: ParsedRecipeIngredient[] = [];
	for (const entry of rawIngredients.slice(0, MAX_INGREDIENTS)) {
		if (typeof entry !== 'object' || entry === null) continue;
		const line = entry as Record<string, unknown>;

		const name = asString(line.name).slice(0, 80);
		if (name === '') continue;

		const claimedSource =
			line.source === 'stock' || line.source === 'staple' || line.source === 'missing'
				? line.source
				: 'missing';

		const rawId = typeof line.stock_item_id === 'number' ? Math.trunc(line.stock_item_id) : 0;
		const stockItemId = claimedSource === 'stock' && knownStockIds.has(rawId) ? rawId : 0;

		const rawAmount =
			typeof line.amount_base === 'number' && Number.isFinite(line.amount_base)
				? line.amount_base
				: 0;
		const amountBase = stockItemId > 0 && rawAmount > 0 ? Math.min(rawAmount, MAX_AMOUNT_BASE) : 0;

		// Behauptete "stock"-Zutat ohne gültigen Posten ist keine — sonst zeigt
		// der Screen "aus dem Bestand" für etwas, das beim Abbuchen nichts tut.
		const resolvedSource: RecipeIngredientSource =
			stockItemId > 0 ? 'stock' : claimedSource === 'stock' ? 'missing' : claimedSource;

		ingredients.push({
			name,
			amountText: asString(line.amount_text).slice(0, 40),
			source: resolvedSource,
			stockItemId,
			amountBase
		});
	}

	const rawSteps = Array.isArray(source.steps) ? source.steps : [];
	const steps = rawSteps
		.map((step) => asString(step).slice(0, 200))
		.filter((step) => step !== '')
		.slice(0, MAX_STEPS);
	if (steps.length === 0) return null;

	return { title, minutes, portions, ingredients, steps };
}
