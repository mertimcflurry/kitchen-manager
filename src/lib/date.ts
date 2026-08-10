/**
 * Datumslogik rund ums Mindesthaltbarkeitsdatum.
 *
 * Bewusst kalendertagbasiert, nicht auf Millisekunden: „läuft morgen ab" soll
 * nicht davon abhängen, ob gerade Sommerzeit beginnt oder wie spät es ist.
 */

/** Schwellen in Tagen, ab denen die Ampel umschlägt. */
export const FRESHNESS_THRESHOLDS = { critical: 1, soon: 3 } as const;

export type Freshness = 'expired' | 'critical' | 'soon' | 'fine';

function startOfDay(date: Date): Date {
	const copy = new Date(date);
	copy.setHours(0, 0, 0, 0);
	return copy;
}

/**
 * Schätzt das MHD aus Kaufdatum und Haltbarkeit in Tagen.
 * `setDate` rechnet über Zeitumstellungen hinweg in Kalendertagen.
 */
export function estimateBestBefore(purchasedAt: Date, shelfLifeDays: number): Date {
	const result = startOfDay(purchasedAt);
	result.setDate(result.getDate() + shelfLifeDays);
	return result;
}

/** Volle Kalendertage bis zum Zieldatum. Negativ, wenn es vorbei ist. */
export function daysUntil(target: Date, now: Date = new Date()): number {
	const diff = startOfDay(target).getTime() - startOfDay(now).getTime();
	// Runden faengt die Stunde ab, die bei der Zeitumstellung fehlt oder doppelt ist.
	return Math.round(diff / 86_400_000);
}

/** Ampelstufe für die Bestandsliste. */
export function freshness(bestBefore: Date, now: Date = new Date()): Freshness {
	const days = daysUntil(bestBefore, now);
	if (days < 0) return 'expired';
	if (days <= FRESHNESS_THRESHOLDS.critical) return 'critical';
	if (days <= FRESHNESS_THRESHOLDS.soon) return 'soon';
	return 'fine';
}
