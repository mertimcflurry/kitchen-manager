/**
 * Das Geräte-Cookie für M11 (mehrere Nutzer ohne Login).
 *
 * Name und Lebensdauer an einer Stelle, damit `hooks.server.ts` (liest) und
 * die Actions auf `/nutzer` (schreiben) nicht auseinanderlaufen können.
 */
import type { Cookies } from '@sveltejs/kit';

export const USER_COOKIE_NAME = 'userId';

/** Zehn Jahre — kein Ablauf im praktischen Sinn, siehe „Kein Auth" in CLAUDE.md. */
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365 * 10;

/**
 * Merkt sich dauerhaft, welcher Nutzer an diesem Gerät gerade dran ist.
 *
 * `secure: false` bewusst: SvelteKits Default ist `secure: true`, sobald der
 * Host nicht exakt `localhost` über HTTP ist — das trifft auf den Dev-Zugriff
 * vom Handy über den Tailscale-Hostnamen zu (siehe CLAUDE.md), der ohne TLS
 * läuft. Ohne dieses Override würde der Browser das Set-Cookie über die
 * unverschlüsselte Verbindung still verwerfen und `/nutzer` liefe in einer
 * Schleife. Die Tailscale-Grenze ersetzt hier ohnehin TLS als Schutz (siehe
 * „Kein Auth, trotzdem mehrere Nutzer" in CLAUDE.md), das Cookie selbst trägt
 * kein Geheimnis, das eine fehlende Secure-Markierung gefährden würde.
 */
export function setUserCookie(cookies: Cookies, userId: number): void {
	cookies.set(USER_COOKIE_NAME, String(userId), {
		path: '/',
		maxAge: COOKIE_MAX_AGE_S,
		httpOnly: true,
		sameSite: 'lax',
		secure: false
	});
}
