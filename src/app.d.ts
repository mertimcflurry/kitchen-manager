// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/**
			 * Wer gerade an diesem Gerät unterwegs ist — aus dem Cookie gelesen
			 * und gegen die `user`-Tabelle geprüft, siehe `hooks.server.ts`. Kein
			 * Login: jedes Gerät mit gültigem Cookie darf sich als dieser Nutzer
			 * ausgeben.
			 */
			userId: number;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
