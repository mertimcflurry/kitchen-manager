/**
 * Fehlerübersetzung für Anthropic-Aufrufe.
 *
 * Gemeinsam für Bon-Parsing und Rezeptvorschlag: beide sprechen dasselbe SDK
 * und derselbe Katalog an Fehlerfällen (Guthaben, Zeitüberschreitung, kein
 * Schlüssel, Verweigerung) trifft beide. Eine zweite Kopie liefe auseinander.
 */

import Anthropic from '@anthropic-ai/sdk';

/**
 * Ein Fehler, dessen Text man dem Nutzer zeigen kann.
 *
 * Die Unterscheidung ist nicht kosmetisch: „kein Guthaben" behebt man am
 * Rechner, „Zeitüberschreitung" durch nochmal antippen. Wer beides als
 * „Fehler beim Auswerten" sieht, probiert das Falsche.
 */
export class AiError extends Error {
	constructor(
		message: string,
		readonly retryable: boolean
	) {
		super(message);
		this.name = 'AiError';
	}
}

/**
 * Übersetzt SDK-Fehler in etwas, das vor dem Kühlschrank weiterhilft.
 *
 * Die deutsche Nutzermeldung ist bewusst knapp — der Originalfehler (SDK-Typ,
 * Statuscode, bei `BadRequestError` z. B. welches Feld dem Schema
 * widersprach) geht dabei sonst verloren. Deshalb hier zentral loggen, bevor
 * übersetzt wird, statt an jeder Aufrufstelle einzeln — sonst vergisst man es
 * an der einen Stelle, an der es einmal zählt. Der API-Key steht in keinem
 * SDK-Fehlertext, das bleibt trotzdem geprüft: nie mitloggen, was nicht
 * sicher keyfrei ist.
 */
export function toUserError(error: unknown): AiError {
	if (error instanceof AiError) return error;

	console.error('[ai] Anthropic-Aufruf fehlgeschlagen:', error);

	if (error instanceof Anthropic.AuthenticationError) {
		return new AiError('API-Schlüssel wird abgelehnt — bitte in .env prüfen.', false);
	}
	if (error instanceof Anthropic.RateLimitError) {
		return new AiError('Zu viele Anfragen. Gleich noch einmal versuchen.', true);
	}
	if (error instanceof Anthropic.APIConnectionTimeoutError) {
		return new AiError('Zeitüberschreitung beim Lesen. Noch einmal versuchen.', true);
	}
	if (error instanceof Anthropic.APIConnectionError) {
		return new AiError('Keine Verbindung zur API. Läuft das Netz?', true);
	}
	if (error instanceof Anthropic.BadRequestError) {
		// Aufgebrauchtes Prepaid-Guthaben kommt als 400 mit Hinweis auf die
		// Kontostand-Meldung — der häufigste Fall, der nicht am Bild liegt.
		const message = String(error.message ?? '');
		if (/credit balance|insufficient|billing/i.test(message)) {
			return new AiError('Kein Guthaben mehr auf dem API-Konto.', false);
		}
		return new AiError(
			'Die Anfrage wurde abgelehnt. Eingaben prüfen und noch einmal versuchen.',
			false
		);
	}
	if (error instanceof Anthropic.APIError) {
		return new AiError('Die API antwortet gerade nicht. Später noch einmal.', true);
	}
	return new AiError('Beim Auswerten ist etwas schiefgegangen.', true);
}
