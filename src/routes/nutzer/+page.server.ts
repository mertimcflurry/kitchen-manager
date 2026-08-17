import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { createUser, listUsers } from '$lib/server/db/users';
import { setUserCookie, USER_COOKIE_NAME } from '$lib/server/user-cookie';
import type { Actions, PageServerLoad } from './$types';

/**
 * Nur ein Pfad im eigenen Haus, nie eine fremde URL — sonst wäre `next` ein
 * offenes Weiterleitungsziel. `//evil.example` sieht wie ein relativer Pfad
 * aus, ist aber protokollrelativ und würde den Browser verlassen.
 */
function safeNext(value: string | null): string {
	if (!value) return '/';
	if (!value.startsWith('/') || value.startsWith('//')) return '/';
	return value;
}

export const load: PageServerLoad = ({ url, cookies }) => {
	const users = listUsers(db);

	// `hooks.server.ts` lässt `/nutzer` bewusst ohne `locals.userId` durch — hier
	// ist ja noch nichts gewählt. Für „das bist du gerade" reicht das Cookie,
	// gegen die schon geladene Liste geprüft statt mit einem zweiten Query.
	const cookieId = Number(cookies.get(USER_COOKIE_NAME));
	const currentUserId = users.some((u) => u.id === cookieId) ? cookieId : null;

	return {
		users,
		currentUserId,
		next: safeNext(url.searchParams.get('next'))
	};
};

export const actions: Actions = {
	/** Einen bestehenden Nutzer für dieses Gerät wählen. */
	waehlen: async ({ request, cookies }) => {
		const data = await request.formData();
		const userId = Number(data.get('userId'));
		const next = safeNext(data.get('next') as string | null);
		if (!Number.isInteger(userId) || userId <= 0) return fail(400, { message: 'Ungültig' });

		setUserCookie(cookies, userId);
		redirect(303, next);
	},

	/** Einen neuen Nutzer anlegen und gleich für dieses Gerät wählen. */
	anlegen: async ({ request, cookies }) => {
		const data = await request.formData();
		const name = String(data.get('name') ?? '');
		const next = safeNext(data.get('next') as string | null);

		const userId = createUser(db, name);
		if (userId === null) return fail(400, { message: 'Name fehlt' });

		setUserCookie(cookies, userId);
		redirect(303, next);
	}
};
