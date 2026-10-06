// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';
import { readdirSync, readFileSync } from 'node:fs';

// frontmatter에 noindex: true 인 글은 사이트맵에서도 뺀다(noindex 페이지를 사이트맵에 제출하면 서치 콘솔 경고).
const blogDir = new URL('./src/content/blog/', import.meta.url);
const noindexSlugs = new Set(
	readdirSync(blogDir)
		.filter((f) => /\.mdx?$/.test(f) && /^noindex:\s*true\s*$/m.test(readFileSync(new URL(f, blogDir), 'utf-8')))
		.map((f) => f.replace(/\.mdx?$/, '')),
);

// https://astro.build/config
export default defineConfig({
	site: 'https://sportskingdom24.com',
	integrations: [
		mdx(),
		sitemap({ filter: (page) => !noindexSlugs.has(new URL(page).pathname.replace(/^\/|\/$/g, '')) }),
	],
	fonts: [
		{
			provider: fontProviders.local(),
			name: 'Atkinson',
			cssVariable: '--font-atkinson',
			fallbacks: ['sans-serif'],
			options: {
				variants: [
					{
						src: ['./src/assets/fonts/atkinson-regular.woff'],
						weight: 400,
						style: 'normal',
						display: 'swap',
					},
					{
						src: ['./src/assets/fonts/atkinson-bold.woff'],
						weight: 700,
						style: 'normal',
						display: 'swap',
					},
				],
			},
		},
	],
});
