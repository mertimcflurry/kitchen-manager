/**
 * Gemeinsames Vokabular für Server und Browser.
 *
 * Bewusst NICHT unter `server/`: Orte, Einheiten und Füllstufen sind nichts
 * Geheimes, die Oberfläche braucht sie genauso wie das Schema. Lagen sie in
 * `$lib/server/`, zöge jede Komponente, die sie importiert, die Datenbank mit
 * in den Browser-Bundle — was SvelteKit zu Recht erst beim Build abbricht.
 */

export const LOCATIONS = ['fridge', 'freezer', 'pantry'] as const;
export const UNITS = ['piece', 'pack', 'g', 'ml'] as const;

/**
 * Füllstand angebrochener Ware, in Prozent.
 *
 * Vier Stufen statt eines Reglers: einen Schieber im Stehen genau zu treffen
 * ist die fummeligste Geste am Handy, und „ist die Milch bei 40 oder 55
 * Prozent?" kann ohnehin niemand beantworten. Gespeichert wird trotzdem eine
 * Zahl, damit feinere Eingabe später ohne Migration möglich bliebe.
 */
export const FILL_LEVELS = [100, 75, 50, 25] as const;

export type Location = (typeof LOCATIONS)[number];
export type Unit = (typeof UNITS)[number];
export type FillLevel = (typeof FILL_LEVELS)[number];

/* ---------- Beschriftungen ---------- */

export const LOCATION_LABELS: Record<Location, string> = {
	fridge: 'Kühlschrank',
	freezer: 'Gefrier',
	pantry: 'Vorrat'
};

/** Kurzform für die Liste, wo jedes Zeichen Platz kostet. */
export const UNIT_LABELS: Record<Unit, string> = {
	piece: 'Stk',
	pack: 'Pck',
	g: 'g',
	ml: 'ml'
};

export const FILL_LABELS: Record<FillLevel, string> = {
	100: 'voll',
	75: '¾',
	50: '½',
	25: '¼'
};

/** Zählbares bekommt +/-, Fortlaufendes den Füllstand. */
export function isCountable(unit: Unit): boolean {
	return unit === 'piece' || unit === 'pack';
}

/* ---------- Eingabe und Anzeige von Mengen ---------- */

/**
 * Einheiten zur Eingabe, inklusive der großen Varianten.
 *
 * Gespeichert wird immer in der Basis (g, ml) — sonst müsste jede Abfrage
 * umrechnen und „1 kg" wäre nicht mit „500 g" vergleichbar. Eingegeben und
 * angezeigt wird, was sich natürlich liest.
 */
export const INPUT_UNITS = ['piece', 'pack', 'g', 'kg', 'ml', 'l'] as const;
export type InputUnit = (typeof INPUT_UNITS)[number];

export const INPUT_UNIT_LABELS: Record<InputUnit, string> = {
	piece: 'Stück',
	pack: 'Pck',
	g: 'g',
	kg: 'kg',
	ml: 'ml',
	l: 'l'
};

/** Rechnet eine Eingabe auf die Basiseinheit um. */
export function toBaseUnit(quantity: number, unit: InputUnit): { quantity: number; unit: Unit } {
	if (unit === 'kg') return { quantity: quantity * 1000, unit: 'g' };
	if (unit === 'l') return { quantity: quantity * 1000, unit: 'ml' };
	return { quantity, unit };
}

/** Die Eingabeeinheit, in der ein gespeicherter Wert am besten aussieht. */
export function toInputUnit(quantity: number, unit: Unit): { quantity: number; unit: InputUnit } {
	if (unit === 'g' && quantity >= 1000) return { quantity: quantity / 1000, unit: 'kg' };
	if (unit === 'ml' && quantity >= 1000) return { quantity: quantity / 1000, unit: 'l' };
	return { quantity, unit };
}

/**
 * Die tatsächlich noch vorhandene Menge eines angebrochenen Postens.
 *
 * `quantity` bleibt nach dem Öffnen die ursprünglich gekaufte Menge (200 g
 * Gouda), `fillLevel` der Anteil davon, der noch da ist. Ohne Verrechnung
 * stünden in der Liste zwei Zahlen nebeneinander, die sich zu widersprechen
 * scheinen: „200 g" neben „50 %". Nur für Fortlaufendes (g/ml) — ein
 * angebrochenes Stück oder eine angebrochene Packung bleibt im Bestand
 * weiterhin ein ganzes Stück, „0,5 Stück" wäre keine ehrliche Angabe.
 */
export function remainingQuantity(quantity: number, unit: Unit, fillLevel: number | null): number {
	if (fillLevel === null || isCountable(unit)) return quantity;
	return (quantity * fillLevel) / 100;
}

const NUMBER = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

/**
 * Menge, wie ein Mensch sie sagen würde: 1500 g werden zu „1,5 kg".
 * Deutsches Dezimalkomma, keine Nachkommastellen bei glatten Zahlen.
 */
export function formatQuantity(quantity: number, unit: Unit): string {
	const display = toInputUnit(quantity, unit);
	return `${NUMBER.format(display.quantity)} ${INPUT_UNIT_LABELS[display.unit]}`;
}
