/**
 * Der Vision-Aufruf für den Bon-Import.
 *
 * Liegt unter `src/lib/server/`, damit SvelteKit garantiert, dass weder Key
 * noch Prompt je im Browser-Bundle landen. Aufrufbar ausschließlich aus
 * `+page.server.ts`.
 */

import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';
import {
	coerceReceipt,
	receiptSchema,
	RECEIPT_SYSTEM_PROMPT,
	type ParsedReceipt
} from './receipt-parse';

/** Sonnet 5 liest Bilder bis 2576 px Kante — bei Bonschrift entscheidet das. */
const DEFAULT_MODEL = 'claude-sonnet-5';

/** Ein Bon mit drei Aufnahmen darf dauern; abbrechen soll es trotzdem irgendwann. */
const REQUEST_TIMEOUT_MS = 120_000;

export type ReceiptImage = { data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' };

/**
 * Ein Fehler, dessen Text man dem Nutzer zeigen kann.
 *
 * Die Unterscheidung ist nicht kosmetisch: „kein Guthaben" behebt man am
 * Rechner, „Zeitüberschreitung" durch nochmal antippen. Wer beides als
 * „Fehler beim Auswerten" sieht, probiert das Falsche.
 */
export class ReceiptAiError extends Error {
	constructor(
		message: string,
		readonly retryable: boolean
	) {
		super(message);
		this.name = 'ReceiptAiError';
	}
}

export type ReceiptAnalysis = {
	receipt: ParsedReceipt;
	/** Rohantwort für Fehlersuche und Prompt-Tuning — landet in `receipt.raw_response`. */
	raw: string;
};

function createClient(): Anthropic {
	const apiKey = env.ANTHROPIC_API_KEY?.trim();
	if (!apiKey) {
		throw new ReceiptAiError('Kein API-Schlüssel hinterlegt (ANTHROPIC_API_KEY in .env).', false);
	}
	return new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
}

/** Übersetzt SDK-Fehler in etwas, das vor dem Kühlschrank weiterhilft. */
function toUserError(error: unknown): ReceiptAiError {
	if (error instanceof ReceiptAiError) return error;

	if (error instanceof Anthropic.AuthenticationError) {
		return new ReceiptAiError('API-Schlüssel wird abgelehnt — bitte in .env prüfen.', false);
	}
	if (error instanceof Anthropic.RateLimitError) {
		return new ReceiptAiError('Zu viele Anfragen. Gleich noch einmal versuchen.', true);
	}
	if (error instanceof Anthropic.APIConnectionTimeoutError) {
		return new ReceiptAiError('Zeitüberschreitung beim Lesen. Noch einmal versuchen.', true);
	}
	if (error instanceof Anthropic.APIConnectionError) {
		return new ReceiptAiError('Keine Verbindung zur API. Läuft das Netz?', true);
	}
	if (error instanceof Anthropic.BadRequestError) {
		// Aufgebrauchtes Prepaid-Guthaben kommt als 400 mit Hinweis auf die
		// Kontostand-Meldung — der häufigste Fall, der nicht am Bild liegt.
		const message = String(error.message ?? '');
		if (/credit balance|insufficient|billing/i.test(message)) {
			return new ReceiptAiError('Kein Guthaben mehr auf dem API-Konto.', false);
		}
		return new ReceiptAiError('Die Anfrage wurde abgelehnt. Andere Aufnahme versuchen.', false);
	}
	if (error instanceof Anthropic.APIError) {
		return new ReceiptAiError('Die API antwortet gerade nicht. Später noch einmal.', true);
	}
	return new ReceiptAiError('Beim Auswerten ist etwas schiefgegangen.', true);
}

/**
 * Schickt die Aufnahmen an das Modell und gibt geprüfte Zeilen zurück.
 *
 * `categoryNames` kommt aus der Datenbank statt aus einer Konstante: das
 * Modell darf nur aus den Kategorien wählen, die es hier wirklich gibt —
 * sonst landet die halbe Einkaufstüte in „Sonstiges" mit dessen 30-Tage-MHD.
 */
export async function analyzeReceipt(
	images: ReceiptImage[],
	categoryNames: string[]
): Promise<ReceiptAnalysis> {
	if (images.length === 0) throw new ReceiptAiError('Keine Aufnahme dabei.', false);

	const client = createClient();
	const model = env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;

	try {
		const response = await client.messages.create({
			model,
			max_tokens: 8000,
			// Bonposten zu lesen ist Abtippen, kein Nachdenken. Ohne Thinking
			// bleibt der Aufruf schnell und billig. Falls die Trefferquote an
			// echten Bons nicht reicht, ist das der erste Hebel zum Umlegen.
			thinking: { type: 'disabled' },
			system: RECEIPT_SYSTEM_PROMPT,
			output_config: { format: { type: 'json_schema', schema: receiptSchema(categoryNames) } },
			messages: [
				{
					role: 'user',
					content: [
						...images.map(
							(image) =>
								({
									type: 'image' as const,
									source: {
										type: 'base64' as const,
										media_type: image.mediaType,
										data: image.data
									}
								}) satisfies Anthropic.ImageBlockParam
						),
						{
							type: 'text',
							text:
								images.length > 1
									? `${images.length} Ausschnitte eines Kassenbons, von oben nach unten. Gib die gekauften Waren zurück.`
									: 'Ein Kassenbon. Gib die gekauften Waren zurück.'
						}
					]
				}
			]
		});

		if (response.stop_reason === 'refusal') {
			throw new ReceiptAiError('Das Modell hat die Auswertung abgelehnt.', false);
		}

		const text = response.content.find((block) => block.type === 'text')?.text ?? '';
		if (text.trim() === '') throw new ReceiptAiError('Das Modell hat nichts zurückgegeben.', true);

		// Sichtbar machen, was ein Bon kostet — der Key steht hier nirgends drin.
		console.log(
			`[bon] ${model}: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out`
		);

		let json: unknown;
		try {
			json = JSON.parse(text);
		} catch {
			throw new ReceiptAiError('Die Antwort war unlesbar. Noch einmal versuchen.', true);
		}

		return { receipt: coerceReceipt(json, categoryNames), raw: text };
	} catch (error) {
		throw toUserError(error);
	}
}
