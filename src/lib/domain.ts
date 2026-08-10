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
