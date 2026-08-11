import { beforeEach, describe, expect, it, vi } from 'vitest';

const deserializeMock = vi.fn();
const invalidateAllMock = vi.fn();

vi.mock('$app/forms', () => ({
	get deserialize() {
		return deserializeMock;
	}
}));

vi.mock('$app/navigation', () => ({
	get invalidateAll() {
		return invalidateAllMock;
	}
}));

import { post } from './forms';

/**
 * `post()` ist der einzige Weg für Gesten ohne sichtbares Formular (+/-,
 * Wischen, Undo), Netz weg oder Server-Absturz dürfen die optimistisch
 * geänderte Liste nicht auf dem falschen Stand belassen — deshalb muss
 * `invalidateAll` in jedem Fehlerfall laufen, nicht nur bei einer erwarteten
 * `failure`-Antwort.
 */
describe('post', () => {
	beforeEach(() => {
		deserializeMock.mockReset();
		invalidateAllMock.mockReset();
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('irrelevant, deserialize ist gemockt'))
		);
	});

	it('lädt bei Erfolg neu und gibt das Ergebnis zurück', async () => {
		const result = { type: 'success', status: 200 };
		deserializeMock.mockReturnValue(result);

		const returned = await post('adjust', { id: '1' });

		expect(returned).toBe(result);
		expect(invalidateAllMock).toHaveBeenCalledOnce();
	});

	it('lädt auch bei einer abgelehnten Action (failure) neu', async () => {
		const result = { type: 'failure', status: 400 };
		deserializeMock.mockReturnValue(result);

		await post('adjust', { id: '1' });

		expect(invalidateAllMock).toHaveBeenCalledOnce();
	});

	it('lädt auch bei einer Server-Exception (error) neu', async () => {
		const result = { type: 'error', error: new Error('kaputt') };
		deserializeMock.mockReturnValue(result);

		await post('adjust', { id: '1' });

		expect(invalidateAllMock).toHaveBeenCalledOnce();
	});

	it('fängt einen Netzabbruch ab, lädt neu und liefert trotzdem ein Ergebnis', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('Failed to fetch');
			})
		);

		const returned = await post('adjust', { id: '1' });

		expect(invalidateAllMock).toHaveBeenCalledOnce();
		expect(returned.type).toBe('error');
	});
});
