/* Draft. Same structure as zh-Hans.mjs; the footer follows the main site's en.ts, but Tíqiàn always carries its tone marks */
export default {
	meta: {
		description: 'The package registry for Tíqiàn.',
		detailDescription: 'Use {product} in {card}.'
	},
	siteName: 'Tíqiàn Registry',
	tiqianHomeLabel: 'Tíqiàn home',
	search: {
		label: 'Search',
		results: 'Search results',
		noScript: 'Search needs JavaScript.',
		packages: 'Packages',
		empty: 'No results for “{query}”',
		failed: 'Search isn’t available right now. Please try again later.'
	},
	snippet: {
		terminal: 'Terminal',
		copy: 'Copy',
		copied: 'Copied'
	},
	detail: {
		back: 'Back to home',
		version: 'Version',
		source: 'Source',
		license: 'License',
		setup: 'Setup',
		packageManager: 'Package manager',
		packages: 'Packages',
		releasePage: 'Release page for {version}',
		versionsOf: 'Versions of {name}'
	},
	setup: {
		copyToRoot: 'Copy the following into the {file} file at the root of your project to use packages from Tíqiàn Registry.',
		copyTo: 'Copy the following into your project’s {file} file to use packages from Tíqiàn Registry.',
		runInTerminal: 'Run the following command in your terminal to use packages from Tíqiàn Registry.',
		/* English needs a space between the two sentences */
		mirror: 'You can also use the versions we publish on {link}. {note}',
		notes: {
			maven: 'Because of Maven Central’s quotas, we only publish stable versions and larger updates there.',
			npm: 'In nearly all cases, the packages and how quickly they update are the same as on Tíqiàn Registry.'
		},
		asides: {
			cargo:
				'You can also use <a href="https://github.com/tiqian-cjk/tiqian-rs">Tíqiàn Rust</a>, a version written natively in Rust, for better performance and memory management. It may behave slightly differently from Tíqiàn.'
		}
	},
	sections: {
		// \u00AD 是软连字符：标题栏放不下时在这里断开、补上连字符，放得下时不显示
		集成: 'Inte\u00ADgra\u00ADtions',
		组件: 'Components',
		SSR: 'SSR',
		底层: 'Low-level'
	},
	footer: {
		navigationLabel: 'Footer',
		repositories: {
			title: 'Repositories',
			tiqian: 'Tíqiàn',
			tiqianRust: 'Tíqiàn Rust',
			tiqianMarkdown: 'Tíqiàn Markdown',
			tiqianMath: 'Tíqiàn Math'
		},
		packages: {
			title: 'Packages',
			registry: 'Tíqiàn Registry'
		},
		language: {
			title: 'Language'
		}
	}
};
