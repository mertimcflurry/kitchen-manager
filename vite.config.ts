import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			typescript: {
				config: (config) => {
					config.include.push('../drizzle.config.ts');
				}
			}
		})
	],
	server: {
		// Bindet an alle Interfaces, damit das Handy im Tailnet drankommt.
		// Der Pi haengt hinter Tailscale und im Heimnetz, kein oeffentliches Interface.
		host: true,
		port: 5173,
		// Lieber hart fehlschlagen als still auf einen anderen Port ausweichen,
		// den dann niemand auf dem Handy erraet.
		strictPort: true,
		// Vite weist fremde Host-Header ab. Der MagicDNS-Name muss also drinstehen,
		// sonst kommt vom Handy nur "Blocked request".
		allowedHosts: ['raspbert-1', 'raspbert-1.tailfa6004.ts.net']
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
