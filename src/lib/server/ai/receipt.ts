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
import { AiError, toUserError } from './errors';

/** Sonnet 5 liest Bilder bis 2576 px Kante — bei Bonschrift entscheidet das. */
const DEFAULT_MODEL = 'claude-sonnet-5';

/** Ein Bon mit drei Aufnahmen darf dauern; abbrechen soll es trotzdem irgendwann. */
const REQUEST_TIMEOUT_MS = 120_000;

export type ReceiptImage = { data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' };

/** Alter Name, hier nur als Alias — die Fehlerklasse gilt jetzt für beide KI-Aufrufe. */
export { AiError as ReceiptAiError };

export type ReceiptAnalysis = {
	receipt: ParsedReceipt;
	/** Rohantwort für Fehlersuche und Prompt-Tuning — landet in `receipt.raw_response`. */
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
	if (images.length === 0) throw new AiError('Keine Aufnahme dabei.', false);

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
			throw new AiError('Das Modell hat die Auswertung abgelehnt.', false);
		}

		const text = response.content.find((block) => block.type === 'text')?.text ?? '';
		if (text.trim() === '') throw new AiError('Das Modell hat nichts zurückgegeben.', true);

		// Sichtbar machen, was ein Bon kostet — der Key steht hier nirgends drin.
		console.log(
			`[bon] ${model}: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out`
		);

		let json: unknown;
		try {
			json = JSON.parse(text);
		} catch {
			throw new AiError('Die Antwort war unlesbar. Noch einmal versuchen.', true);
		}

		return { receipt: coerceReceipt(json, categoryNames), raw: text };
	} catch (error) {
		throw toUserError(error);
	}
}
