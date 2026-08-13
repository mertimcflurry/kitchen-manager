/**
 * Portionen nachträglich ändern, ohne den Vorschlag zu verlieren.
 *
 * `+page.svelte` warf das ganze Rezept weg, sobald `data.portions` nicht mehr
 * zu `recipe.portions` passte — jeder Tap auf einen anderen Portionen-Reiter
 * hat den gerade erst geholten Vorschlag gelöscht. Hier wird stattdessen
 * hochgerechnet: Mengen mal Verhältnis, kein neuer KI-Aufruf.
 */

import type { ParsedRecipe } from './server/ai/recipe-parse';

const LEADING_NUMBER = /^(\d+(?:[.,]\d+)?)(.*)$/;

/**
 * Skaliert die Zahl am Anfang eines Mengentexts, lässt den Rest stehen.
 *
 * `amountText` ist Freitext vom Modell („250 g", „2 Eier", „etwas Salz") —
 * kein Format zum Zurückrechnen, nur eine Zahl am Anfang zum Hochrechnen. Texte
 * ohne führende Zahl (Grundzutaten wie „Salz nach Geschmack") bleiben
 * unverändert, da lässt sich nichts skalieren.
 */
export function scaleAmountText(text: string, ratio: number): string {
	const match = LEADING_NUMBER.exec(text.trim());
	if (!match) return text;

	const [, numberPart, rest] = match;
	const value = Number(numberPart.replace(',', '.'));
	if (!Number.isFinite(value)) return text;

	// Eine Nachkommastelle reicht für „1,5 EL" — mehr täuscht Genauigkeit vor,
	// die weder das Modell noch der Kochlöffel hergibt.
	const scaled = Math.round(value * ratio * 10) / 10;
	const display = Number.isInteger(scaled) ? String(scaled) : String(scaled).replace('.', ',');
	return `${display}${rest}`;
}

/**
 * Rechnet ein Rezept auf eine andere Portionenzahl um.
 *
 * `amountBase` (fürs Abbuchen) wird glatt mit dem Verhältnis multipliziert —
 * `cookIngredients` rundet Zählbares ohnehin, lose Ware verträgt Kommazahlen.
 * Packungen tragen laut `RECIPE_SYSTEM_PROMPT` immer `amountBase: 0` und
 * bleiben damit unverändert bei 0.
 */
export function scaleRecipe(recipe: ParsedRecipe, newPortions: number): ParsedRecipe {
	if (newPortions === recipe.portions) return recipe;
	const ratio = newPortions / recipe.portions;

	return {
		...recipe,
		portions: newPortions,
		ingredients: recipe.ingredients.map((ingredient) => ({
			...ingredient,
			amountText: scaleAmountText(ingredient.amountText, ratio),
			amountBase: ingredient.amountBase > 0 ? ingredient.amountBase * ratio : ingredient.amountBase
		}))
	};
}
