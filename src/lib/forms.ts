import { deserialize } from '$app/forms';
import { invalidateAll } from '$app/navigation';
import type { ActionResult } from '@sveltejs/kit';

/**
 * Ruft eine Form Action auf, ohne dass ein sichtbares Formular nötig ist.
 *
 * Für Gesten und Knöpfe, die kein Feld haben: Wischen, +/-, Undo. Danach
 * `invalidateAll`, damit der Server das Wort behält — die Liste hat den
 * Vorgang optimistisch schon vorweggenommen.
 *
 * Läuft die Anfrage schief — Netzabbruch, Server-Exception, abgelehnte
 * Action —, muss `invalidateAll` trotzdem laufen: sonst zeigt die Liste
 * weiter den optimistischen Stand, obwohl der Server nichts gespeichert hat,
 * und man glaubt, es sei erledigt.
 */
export async function post(action: string, fields: Record<string, string>): Promise<ActionResult> {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.append(key, value);

	try {
		const response = await fetch(`?/${action}`, { method: 'POST', body });
		const result: ActionResult = deserialize(await response.text());
		if (result.type === 'success' || result.type === 'failure' || result.type === 'error') {
			await invalidateAll();
		}
		return result;
	} catch (error) {
		// Netz weg oder Antwort nicht deserialisierbar — der Server hat den
		// optimistischen Stand so oder so nicht bestätigt.
		await invalidateAll();
		return { type: 'error', error };
	}
}
