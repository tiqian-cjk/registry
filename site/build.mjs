// 生成 registry.tiqian.org 的页面：按 catalog.json 的分组，从元数据树里取各包的版本，
// 填进 site/index.html，与样式、脚本、图标一起写到输出目录。
//   首页：/index.html，各组的卡片，每张卡显示组内包的最新版本
//   详情页：/<组>/<卡片>/index.html，这张卡里每个包的接入写法（可以切换版本）
// 每种语言各一套（见 site/i18n.mjs）：简体中文在根路径，其余在 /en/、/zh-Hant/ 下；样式、脚本、字体共用 /assets/
// 用法：node site/build.mjs --tree <元数据树> --catalog <catalog.json> --out <输出目录>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHtmlPreparer, renderSnapshotServerAssets } from '@tiqian/precompute/precompute-html';
import { createCssVariablesTheme, createHighlighter } from 'shiki';
import { OG_HEIGHT, OG_WIDTH, detailImageSvg, homeImageSvg, renderPng } from './og.mjs';
import { defaultLocale, format, localeNames, localizePath, locales, messages, missingKeys } from './i18n.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

// 各生态在本站的地址，与 registry-tool 的输出一致（见 Losses/boring 的 26-package-registry.md）
const BASE = 'https://registry.tiqian.org';
const SWIFT_SCOPE = 'tiqian';

function parseArgs(argv) {
	const args = {};
	for (let i = 0; i < argv.length; i += 2) {
		const flag = argv[i];
		const value = argv[i + 1];
		if (!flag.startsWith('--') || value === undefined) fail(`参数有误：${argv.join(' ')}`);
		args[flag.slice(2)] = value;
	}
	for (const name of ['tree', 'catalog', 'out']) if (!args[name]) fail(`缺少 --${name}`);
	return args;
}

function fail(message) {
	console.error(`site/build.mjs: ${message}`);
	process.exit(1);
}

// 元数据树：<owner>/<包目录>/<版本>/<生态>/metadata.json。
// 以「生态:包名」为键收集各版本的元数据，Maven 的包名带上 groupId。
// 值：{ eco, name, versions: Map<版本, 元数据> }
function readTree(tree) {
	const packages = new Map();
	const dirs = (dir) =>
		fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.'));
	for (const owner of dirs(tree)) {
		for (const pkg of dirs(path.join(tree, owner.name))) {
			for (const version of dirs(path.join(tree, owner.name, pkg.name))) {
				for (const eco of dirs(path.join(tree, owner.name, pkg.name, version.name))) {
					const file = path.join(tree, owner.name, pkg.name, version.name, eco.name, 'metadata.json');
					if (!fs.existsSync(file)) continue;
					const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
					const name = eco.name === 'maven' ? `${meta.groupId}:${meta.name}` : meta.name;
					const key = `${eco.name}:${name}`;
					if (!packages.has(key)) packages.set(key, { eco: eco.name, name, versions: new Map() });
					packages.get(key).versions.set(meta.version, meta);
				}
			}
		}
	}
	return packages;
}

// SemVer 2.0 的优先级比较（忽略构建元数据）
function compareVersions(a, b) {
	const split = (v) => {
		const [core, pre] = v.split('+')[0].split(/-(.*)/s);
		return { core: core.split('.').map(Number), pre: pre ? pre.split('.') : [] };
	};
	const x = split(a);
	const y = split(b);
	for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i];
	if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length;
	for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
		if (x.pre[i] === undefined) return -1;
		if (y.pre[i] === undefined) return 1;
		const p = x.pre[i];
		const q = y.pre[i];
		const pn = /^\d+$/.test(p);
		const qn = /^\d+$/.test(q);
		if (pn && qn && Number(p) !== Number(q)) return Number(p) - Number(q);
		if (pn !== qn) return pn ? -1 : 1;
		if (p !== q) return p < q ? -1 : 1;
	}
	return 0;
}

const latest = (versions) => versions.reduce((a, b) => (compareVersions(a, b) >= 0 ? a : b));
const newestFirst = (versions) => [...versions].sort((a, b) => compareVersions(b, a));

const escape = (s) =>
	String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const indent = (n) => '\t'.repeat(n);

// 正在生成哪种语言的页面，和这种语言的文案（见 site/messages/）。输出时按语言挨个换
let locale = defaultLocale;
let t = messages[defaultLocale];

// 驼峰处（小写后接大写，如 TypeScript）允许折行：放不下整个词时在这里断开，而不是从词中间断
const camelBreaks = (title) => escape(title).replace(/([a-z])(?=[A-Z])/g, '$1<wbr>');

// catalog.json 里的分区名（简体中文）换成当前语言的（见 site/messages/ 的 sections）
const sectionTitle = (title) => t.sections[title] ?? fail(`site/messages/${locale}.mjs 的 sections 里缺「${title}」`);

// 卡片里的包：有分区的（平台卡片）按分区，没有的整张卡算一个不带标题的分区
const sectionsOf = (card) => card.sections ?? [{ packages: card.packages }];
const cardHref = (group, card) => localizePath(locale, `/${group.id}/${card.id}/`);
// 详情页里每张包卡片的锚点（搜索结果点包名时直接滚到这张卡），比如 @tiqian/react → package-tiqian-react
const packageAnchor = (name) => `package-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

function lookup(packages, ref, where) {
	if (!packages.has(ref)) fail(`catalog.json 里的 ${ref}（${where}）在元数据树里找不到`);
	return packages.get(ref);
}

// ---------- 接入写法 ----------

// npm 仓库的几种包管理器：配置写到哪个文件（setup），装包的命令（dependency）
const npmrc = { file: '.npmrc', code: `@tiqian:registry=${BASE}/npm/` };
const npmManager = (id, setup, install) => ({
	id,
	setupHint: () => format(t.setup.copyToRoot, { file: setup.file }),
	setup: () => setup,
	dependency: (name, version) => ({ code: install(`${name}@${version}`) })
});

// 每个生态：先把本站加成仓库（setup），再按包写依赖（dependency）。
// 有 managers 的（npm）按包管理器各有一套 setupHint、setup、dependency，见 variantsOf。
// 说明文字在 site/messages/ 里：setupHint 按当前语言取；mirror.note、aside 是 t.setup.notes、t.setup.asides 里的键
const ECOSYSTEMS = {
	maven: {
		label: 'Gradle',
		setupHint: () => format(t.setup.copyTo, { file: 'settings.gradle.kts' }),
		mirror: {
			name: 'Maven Central',
			href: 'https://mvnrepository.com/artifact/org.tiqian',
			note: 'maven'
		},
		setup: () => ({
			file: 'settings.gradle.kts',
			code: `dependencyResolutionManagement {\n    repositories {\n        maven("${BASE}/maven/")\n    }\n}`
		}),
		dependency: (name, version) => ({ file: 'build.gradle.kts', code: `implementation("${name}:${version}")` })
	},
	npm: {
		label: 'npm',
		mirror: {
			name: 'NPM',
			href: 'https://www.npmjs.com/org/tiqian',
			note: 'npm'
		},
		// 几种包管理器共用 npm 仓库，配置和安装命令各不相同。「配置仓库」右边的下拉选一种（versions.js），
		// 第一种是默认的（没有脚本时就显示它）
		managers: [
			npmManager('npm', npmrc, (spec) => `npm install ${spec}`),
			npmManager('pnpm', npmrc, (spec) => `pnpm add ${spec}`),
			// Yarn 2 及以后不读 .npmrc（Yarn 1 读，照 npm 那样配也行）
			npmManager(
				'yarn',
				{ file: '.yarnrc.yml', code: `npmScopes:\n  tiqian:\n    npmRegistryServer: "${BASE}/npm/"` },
				(spec) => `yarn add ${spec}`
			),
			npmManager('bun', { file: 'bunfig.toml', code: `[install.scopes]\ntiqian = "${BASE}/npm/"` }, (spec) => `bun add ${spec}`),
			npmManager('deno', npmrc, (spec) => `deno add npm:${spec}`)
		]
	},
	cargo: {
		label: 'Cargo',
		setupHint: () => format(t.setup.copyTo, { file: '.cargo/config.toml' }),
		// 配置说明后面再加的一段（提椠 Rust）
		aside: 'cargo',
		setup: () => ({
			file: '.cargo/config.toml',
			code: `[registries.tiqian]\nindex = "sparse+${BASE}/cargo/index/"`
		}),
		dependency: (name, version) => ({
			file: 'Cargo.toml',
			code: `${name} = { version = "=${version}", registry = "tiqian" }`
		})
	},
	pub: {
		label: 'pub',
		setupHint: () => t.setup.runInTerminal,
		setup: () => ({ code: `export PUB_HOSTED_URL=${BASE}/pub` }),
		dependency: (name, version) => ({ code: `dart pub add ${name}:${version}` })
	},
	swift: {
		label: 'Swift Package Registry',
		setupHint: () => t.setup.runInTerminal,
		setup: () => ({ code: `swift package-registry set ${BASE}/swift/` }),
		dependency: (name, version) => ({
			file: 'Package.swift',
			code: `.package(id: "${SWIFT_SCOPE}.${name}", exact: "${version}")`
		})
	}
};

// 一个生态的几种写法：有 managers 的就是那几种包管理器，没有的只有一种（id 为 null）
const variantsOf = (eco) => eco.managers ?? [{ id: null, setupHint: eco.setupHint, setup: eco.setup, dependency: eco.dependency }];

// Material Symbols（Outlined，grade 0、opsz 24，不填充；Apache-2.0）。字重默认 400，个别注明的是 500
const ICONS = {
	arrowBack: 'M313-440l224 224-57 56-320-320 320-320 57 56-224 224h487v80H313Z',
	// arrowOutward 跟在 Medium、Semibold 的小字后面，用 500 字重，不然显得细
	arrowOutward: 'M258.39-232.11 194.5-296 573-674.5H236.89v-91h491v491h-91v-336.11l-378.5 378.5Z',
	contentCopy:
		'M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Zm160-240v-480 480Z',
	check: 'M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z',
	// expandMore、unfoldMore 跟着下拉里的 Semibold 字，用 600 字重
	expandMore: 'M480-327.48 221.91-585.57 296-659.65l184 184 184-184 74.09 74.08L480-327.48Z',
	unfoldMore:
		'M480-101.91 280.22-301.7l76.08-75.52L480-253.52l123.7-123.7 76.08 75.52L480-101.91ZM356.3-580.48 280.22-656 480-855.78 679.78-656l-76.08 75.52L480-704.17 356.3-580.48Z'
};
const icon = (name, className = 'icon') =>
	`<svg class="${className}" viewBox="0 -960 960 960" aria-hidden="true"><path fill="currentColor" d="${ICONS[name]}" /></svg>`;

// ---------- 代码高亮 ----------

// 构建时用 Shiki 切词，按 TextMate 作用域分几类上色（颜色在 style.css 的 .tok-*，亮色暗色各一套）：
//   string 字符串和值，func 函数名和命令名，key 键名和参数标签，keyword 关键字，quiet 标点（调淡），comment 注释
const SNIPPET_LANGS = ['kotlin', 'toml', 'swift', 'shellscript', 'ini', 'yaml'];
const highlighter = await createHighlighter({
	themes: [createCssVariablesTheme({ name: 'css-variables', variablePrefix: '--shiki-' })],
	langs: SNIPPET_LANGS
});

function tokenKind(scopes) {
	const scope = scopes.join(' ');
	if (/\bcomment\b/.test(scope)) return 'comment';
	if (/string\.quoted|punctuation\.definition\.string/.test(scope)) return 'string';
	if (/entity\.name\.(command|function)|support\.function/.test(scope)) return 'func';
	if (/variable\.other\.(key|assignment)|keyword\.other\.definition|entity\.name\.section|entity\.name\.tag\.yaml/.test(scope)) return 'key';
	if (/storage\.(modifier|type)|keyword\.(control|other)/.test(scope)) return 'keyword';
	if (/punctuation|keyword\.operator/.test(scope)) return 'quiet';
	return null;
}

// 按文件名认语言；没有文件名的是终端命令
function langOf(file) {
	if (!file) return 'shellscript';
	if (file.endsWith('.kts')) return 'kotlin';
	if (file.endsWith('.toml')) return 'toml';
	if (file.endsWith('.swift')) return 'swift';
	if (file === '.npmrc') return 'ini';
	if (file.endsWith('.yml') || file.endsWith('.yaml')) return 'yaml';
	return null;
}

// 代码里的断行机会：在 / : . 后面加 <wbr>，长网址、包坐标折行时在分隔处断开，不从单词中间断。
// 不加的地方：:// 中间；后面接数字的点（版本号 0.1.0-alpha.15 不拆开）；收尾的引号、括号前面（免得只剩一个引号折到下一行）。
// 一个分隔符都没有的长串，还是靠样式里的 overflow-wrap: anywhere 兜底。<wbr> 不是字符，复制不受影响
function codeText(text) {
	let html = '';
	for (let i = 0; i < text.length; i++) {
		const [char, next] = [text[i], text[i + 1]];
		html += escape(char);
		if (!'/:.'.includes(char) || next === undefined) continue;
		if ('/"\')]}'.includes(next)) continue;
		if (char === '.' && /\d/.test(next)) continue;
		html += '<wbr>';
	}
	return html;
}

// 每行一个 span（行号由样式里的计数器画）；行里需要上色的词再包一层 .tok-*
function highlightLines(code, lang) {
	if (!lang) return code.split('\n').map(codeText);
	const { tokens } = highlighter.codeToTokens(code, {
		lang,
		theme: 'css-variables',
		includeExplanation: 'scopeName'
	});
	return tokens.map((line) => {
		const parts = line.flatMap((token) =>
			token.explanation.map((part) => ({
				text: part.content,
				scopes: part.scopes.map((s) => s.scopeName),
				kind: tokenKind(part.scopes.map((s) => s.scopeName))
			}))
		);
		// 语法规则切得粗的地方补一下：
		//   终端里 export X=… 和 .npmrc 里 key=… 的等号后面是值，当字符串
		//   Swift 的参数标签（id:、exact:）被标成了函数，后面跟冒号的改成键名
		let afterAssignment = false;
		parts.forEach((part, i) => {
			if (afterAssignment && part.kind !== 'quiet') part.kind = 'string';
			if (part.scopes.some((s) => /keyword\.operator\.assignment\.shell|punctuation\.separator\.key-value\.ini/.test(s))) {
				afterAssignment = true;
			}
			if (lang === 'swift' && part.kind === 'func') {
				const next = parts.slice(i + 1).find((p) => p.text.trim());
				if (next?.scopes.some((s) => s.startsWith('punctuation.separator.argument-label'))) part.kind = 'key';
			}
		});
		// 同类相邻的合成一个 span
		const out = [];
		for (const part of parts) {
			const kind = part.text.trim() ? part.kind : out.at(-1)?.kind ?? null;
			if (out.length && out.at(-1).kind === kind) out.at(-1).text += part.text;
			else out.push({ kind, text: part.text });
		}
		return out.map(({ kind, text }) => (kind ? `<span class="tok-${kind}">${codeText(text)}</span>` : codeText(text))).join('');
	});
}

// 大卡片里的灰字，和首页卡片的版本号一样两层混合（见 style.css 的 .blend）：
// 底下一份叠加（overlay）吸收背景色块的颜色，上面一份是很淡的正常文字。
// 内容渲染两份（叠加那份读屏跳过），带图标的也能一起混合
const blend = (html) =>
	`<span class="blend"><span class="blend__overlay" aria-hidden="true">${html}</span><span class="blend__base">${html}</span></span>`;

// 代码块：上面一行是文件名（命令行的写「终端」）和复制按钮，下面是带行号的代码。
// 复制按钮要 snippet.js 才能用，所以先 hidden，脚本加载后再显示
function renderSnippet(level, { file, code }) {
	const out = [`${indent(level)}<figure class="snippet">`];
	out.push(`${indent(level + 1)}<figcaption class="snippet__header">`);
	out.push(`${indent(level + 2)}<span class="snippet__file">${escape(file ?? t.snippet.terminal)}</span>`);
	// 复制成功后读屏念的「已复制」也放在按钮上（data-copied），snippet.js 换上去
	out.push(
		`${indent(level + 2)}<button class="snippet__copy" type="button" aria-label="${escape(t.snippet.copy)}" data-copied="${escape(t.snippet.copied)}" hidden>${icon('contentCopy', 'snippet__icon')}${icon('check', 'snippet__icon snippet__icon--done')}</button>`
	);
	out.push(`${indent(level + 1)}</figcaption>`);
	// <pre> 里不能有缩进，否则会原样显示
	out.push(`${indent(level + 1)}<pre class="snippet__code"><code>${snippetCode({ file, code })}</code></pre>`);
	out.push(`${indent(level)}</figure>`);
	return out.join('\n');
}

// 代码框 <code> 里面的 HTML（包卡片切换版本时也用它预先生成每个版本的写法）。
// 行号不在文本里，复制时不会带上。
// 每行排成「行号 + 代码」两栏（见 style.css 的 .snippet__line）：代码包在 .snippet__text 里整体作为一栏，
// 不然上了色的词会各自成一栏。换行符放在里面（最后一行除外），夹在 span 之间的话会多出空行
function snippetCode({ file, code }) {
	const highlighted = highlightLines(code, langOf(file));
	// 行首缩进包在 .snippet__indent 里，不让折行在缩进后面断开（不然缩进会独占一行）；
	// 折下去的续行从代码栏最左边开始，不跟着缩进
	return highlighted
		.map((line, i) => {
			const [, spaces, rest] = /^( *)(.*)$/s.exec(line);
			const indent = spaces ? `<span class="snippet__indent">${spaces}</span>` : '';
			const newline = i < highlighted.length - 1 ? '\n' : '';
			return `<span class="snippet__line"><span class="snippet__text">${indent}${rest}${newline}</span></span>`;
		})
		.join('');
}

// ---------- 首页 ----------

function renderGroups(catalog, packages) {
	const out = [`${indent(2)}<main class="groups frame">`];
	for (const group of catalog.groups) {
		out.push(`${indent(3)}<section class="group" aria-labelledby="group-${escape(group.id)}">`);
		out.push(`${indent(4)}<h2 class="group__title" id="group-${escape(group.id)}">${escape(group.title)}</h2>`);
		out.push(`${indent(4)}<ul class="group__cards">`);
		for (const card of group.cards) {
			const versions = sectionsOf(card)
				.flatMap((s) => s.packages)
				.map((ref) => latest([...lookup(packages, ref, `${group.id}/${card.id}`).versions.keys()]));
			out.push(`${indent(5)}<li class="card card--${escape(card.id)}">`);
			// 背景色块：三块模糊的颜色，位置和颜色在 style.css 里按卡片设（没设的卡片不显示）
			out.push(`${indent(6)}<div class="card__blobs" aria-hidden="true"><i></i><i></i><i></i></div>`);
			const title = camelBreaks(card.title);
			// 链接放在标题上，style.css 里把它的点击区域撑满整张卡片
			out.push(
				`${indent(6)}<h3 class="card__title"><a class="card__link" href="${cardHref(group, card)}">${title}</a></h3>`
			);
			// data-version：样式里用它再画一层同样的字（混合模式那层），见 style.css 的 .card__version
			const version = escape(latest(versions));
			out.push(`${indent(6)}<p class="card__version" data-version="${version}">${version}</p>`);
			out.push(`${indent(5)}</li>`);
		}
		out.push(`${indent(4)}</ul>`);
		out.push(`${indent(3)}</section>`);
	}
	out.push(`${indent(2)}</main>`);
	return out.join('\n');
}

// ---------- 详情页 ----------

// 包名里的前缀（npm 的 @tiqian/、Maven 的 org.tiqian:）调淡，真正的包名突出。
// 前缀和包名各是一块（见 style.css 的 .package__scope），放不下时先在两块之间折行。
// 返回 html 和前缀的字数（scope）
function packageName(name) {
	const match = /^(@[^/]+\/|[^:]+:)(.+)$/.exec(name);
	const parts = match ? [match[1], match[2]] : ['', name];
	const html = match
		? `<span class="package__scope">${escape(match[1])}</span><span class="package__base">${escape(match[2])}</span>`
		: `<span class="package__base">${escape(name)}</span>`;
	return { html, scope: parts[0].length };
}

// 包卡片：包名、版本（可以切换，链到 GitHub release）、依赖写法。
// 许可证和源码每个包都一样，写在顶部大卡片里，这里不再重复
function renderPackage(level, pkg) {
	const eco = ECOSYSTEMS[pkg.eco];
	if (!eco) fail(`不认识的生态：${pkg.eco}`);
	const versions = newestFirst(pkg.versions.keys());
	const current = versions[0];
	const release = (version) => {
		const m = pkg.versions.get(version);
		return `https://github.com/${m.repository}/releases/tag/${m.tag}`;
	};

	const out = [`${indent(level)}<article class="package" id="${packageAnchor(pkg.name)}">`];
	out.push(`${indent(level + 1)}<header class="package__header">`);
	const name = packageName(pkg.name);
	// 版本：没有脚本时就是最新版本号，链到它的发布页；有脚本（versions.js）时换成下拉切换 + 发布页链接，
	// 切换版本时下面代码框的写法跟着换。只有一个版本的包不做切换
	out.push(`${indent(level + 2)}<div class="package__version">`);
	out.push(
		`${indent(level + 3)}<a class="package__release" href="${escape(release(current))}" aria-label="${escape(format(t.detail.releasePage, { version: current }))}">${escape(current)}</a>`
	);
	if (versions.length > 1) {
		out.push(`${indent(level + 3)}<span class="package__picker" hidden>`);
		out.push(`${indent(level + 4)}${icon('unfoldMore', 'package__chevron')}`);
		out.push(`${indent(level + 4)}<select class="package__select" aria-label="${escape(format(t.detail.versionsOf, { name: pkg.name }))}">`);
		for (const version of versions) {
			out.push(
				`${indent(level + 5)}<option value="${escape(version)}" data-release="${escape(release(version))}">${escape(version)}</option>`
			);
		}
		out.push(`${indent(level + 4)}</select>`);
		out.push(`${indent(level + 3)}</span>`);
		out.push(
			`${indent(level + 3)}<a class="package__release-link" href="${escape(release(current))}" aria-label="${escape(format(t.detail.releasePage, { version: current }))}" data-label="${escape(t.detail.releasePage)}" hidden>${icon('arrowOutward', 'package__release-icon')}</a>`
		);
	}
	out.push(`${indent(level + 2)}</div>`);
	// 包名写在版本后面：版本浮在右边，包名绕着它排（见 style.css 的 .package__header）
	out.push(`${indent(level + 2)}<h3 class="package__name" style="--scope-chars: ${name.scope}">${name.html}</h3>`);
	out.push(`${indent(level + 1)}</header>`);

	// 依赖写法，作为卡片的第二行（同一排的卡片只共用包名那一行的高度，见 style.css 的 .package）
	out.push(`${indent(level + 1)}<div class="package__body">`);
	const variants = variantsOf(eco);
	out.push(renderSnippet(level + 2, variants[0].dependency(pkg.name, current)));
	// 每个版本（和每种包管理器）的写法预先生成好，切换时 versions.js 拿来换掉代码框里的内容
	if (versions.length > 1 || variants.length > 1) {
		for (const variant of variants) {
			const manager = variant.id ? ` data-manager="${escape(variant.id)}"` : '';
			for (const version of versions) {
				out.push(
					`${indent(level + 2)}<template class="package__variant" data-version="${escape(version)}"${manager}>${snippetCode(variant.dependency(pkg.name, version))}</template>`
				);
			}
		}
	}
	out.push(`${indent(level + 1)}</div>`);
	out.push(`${indent(level)}</article>`);
	return out.join('\n');
}

// ---------- 提椠构建期预排 ----------

// 配置仓库的说明文字由提椠排（<tiqian-prose>）。构建时先用 @tiqian/precompute 排一遍：
// 浏览器里右栏正好是 --setup-width 那么宽、字体也对得上时，直接用这份结果，不用等脚本重排；
// 对不上（比如手机上）就照常由脚本在浏览器里排。字体和字号要和 style.css 的 .detail__prose 一致。
// 预排不支持可变字体，所以西文用 Inter 的静态实例（site/static-inter.py）。
// 字体（fontFamilies）和 locale 按语言另给，见 PROSE_FONTS 和 prepareProse
const PROSE_TYPOGRAPHY = {
	fontSizePx: 14,
	lineHeightPx: 14 * 1.6,
	fontWeight: 400
};
// 繁中页面以繁中版 MiSansTC 为主、简中版补字（同官网，原因见 style.css 的 :lang(zh-Hant)），其他语言反过来
const PROSE_FONTS = {
	'zh-Hant': {
		families: ['Inter Static', 'MiSansTC', 'MiSans'],
		stylesheets: ['fonts/inter-static/inter-static.css', 'fonts/misans-tc/MiSansTC-Regular.min.css', 'fonts/misans/MiSans-Regular.min.css']
	},
	default: {
		families: ['Inter Static', 'MiSans'],
		stylesheets: ['fonts/inter-static/inter-static.css', 'fonts/misans/MiSans-Regular.min.css']
	}
};
// 预排表（每页一份，按内容哈希命名）放在这里，<tiqian-prose> 的 tq-tables 指过来
const TABLES_DIR = 'assets/tiqian-tables';

const PRECOMPUTE_LOCALES = ['zh-Hans'];
// 每种语言一个预排器（字体和 locale 不同）
const preparers = new Map();
const proseTables = new Map();

// 返回 { attributes, html, head }：<tiqian-prose> 上加的属性、预排后的段落（加了 data-tq-snapshot-key）、
// 要放进 <head> 的数据。预排失败只提示，段落照原样输出，交给浏览器里的脚本排
async function prepareProse(html, id, widthPx) {
	// @tiqian/precompute 目前只能预排简体中文（别的 locale 报 UnsupportedSnapshotLocale），其他语言交给浏览器里的脚本排
	if (!PRECOMPUTE_LOCALES.includes(locale)) return { attributes: '', html, head: '' };
	if (!preparers.has(locale)) {
		const fonts = PROSE_FONTS[locale] ?? PROSE_FONTS.default;
		preparers.set(
			locale,
			await createHtmlPreparer({
				fontStylesheets: fonts.stylesheets.map((file) => ({
					source: path.join(here, 'assets', file),
					publicUrl: `/assets/${file}`
				})),
				typography: { ...PROSE_TYPOGRAPHY, fontFamilies: fonts.families, locale }
			})
		);
	}
	const preparer = preparers.get(locale);
	let prepared;
	try {
		prepared = await preparer.prepare(html, { id, snapshot: { maxWidthPx: widthPx } });
	} catch (error) {
		console.warn(`site/build.mjs: ${id} 预排失败，交给浏览器排：${error.message}`);
		return { attributes: '', html, head: '' };
	}
	for (const issue of prepared.issues) console.warn(`site/build.mjs: ${id} 第 ${issue.index} 段（${issue.stage}）：${issue.issue}`);
	const attributes = Object.entries(prepared.rootAttributes).map(([name, value]) => ` ${name}="${escape(value)}"`);
	if (prepared.tables) {
		const file = `${prepared.tables.sha256}.tiqtbl`;
		proseTables.set(file, prepared.tables.bytes);
		attributes.push(` tq-tables="/${TABLES_DIR}/${file}"`);
	}
	return { attributes: attributes.join(''), html: prepared.html, head: renderSnapshotServerAssets(prepared.serverAssets) };
}

// 右栏（配置仓库）并排时多宽：代码最长那行正好放下（左右内边距各 12px；行号是 Inter 等宽数字，
// 13px 每位按 0.649em 算，后面隔 10px；
// JetBrains Mono 13px 每个字宽按 0.603em 算，实测 0.600em，留一点余量），再向上取整到正文字号 14px 的整数倍，
// 这样说明文字每行正好排满整数个汉字。预排也按这个宽度排
const setupWidthPx = (code) => {
	const lines = code.split('\n');
	const numberColumn = String(lines.length).length * 13 * 0.649 + 10;
	const codeWidth = Math.max(...lines.map((line) => line.length)) * 13 * 0.603;
	return Math.ceil((2 * 12 + numberColumn + codeWidth) / 14) * 14;
};

// 详情页：返回 { main, head }，head 是要放进 <head> 的预排数据
async function renderDetail(group, card, packages) {
	const where = `${group.id}/${card.id}`;
	const sections = sectionsOf(card).map((s) => ({
		title: s.title,
		packages: s.packages.map((ref) => lookup(packages, ref, where))
	}));
	const all = sections.flatMap((s) => s.packages);
	const ecos = [...new Set(all.map((p) => p.eco))];
	const version = latest(all.map((p) => latest([...p.versions.keys()])));

	const metas = all.map((p) => p.versions.get(latest([...p.versions.keys()])));
	const repositories = [...new Set(metas.map((m) => m.repository))];
	const licenses = [...new Set(metas.map((m) => m.license).filter(Boolean))];

	const out = [`${indent(2)}<main class="detail frame">`];
	const head = [];
	// 写给样式用的（见 style.css 的 .detail__top）：
	//   --version-chars：版本号几个字，据此算卡片最窄多宽
	//   --setup-width：右栏并排时多宽（见 setupWidthPx）
	// 只按默认那种写法算：别的包管理器的配置更长时，代码框里折行（比如 .yarnrc.yml）
	const setupWidth = Math.max(...ecos.map((eco) => setupWidthPx(variantsOf(ECOSYSTEMS[eco])[0].setup().code)));
	out.push(
		`${indent(3)}<div class="detail__top" style="--version-chars: ${version.length}; --setup-width: ${setupWidth}px">`
	);

	// 左边：和首页卡片同一套颜色的大卡片。左上返回，左下组名和标题，右下版本、源码、协议
	out.push(`${indent(4)}<header class="detail__hero card--${escape(card.id)}">`);
	// 背景色块：同首页卡片的三块颜色（.card__blobs），这里一直显示、一直转，挪到左下角（见 style.css 的 .detail__hero）。
	// 色块还会自转，所以模糊加在外面这层 .card__blobs-layer 上，不加在色块自己身上（原因见 style.css）
	out.push(
		`${indent(5)}<div class="card__blobs" aria-hidden="true"><div class="card__blobs-layer"><i></i><i></i><i></i></div></div>`
	);
	out.push(
		`${indent(5)}<a class="detail__back" href="${localizePath(locale, '/')}#group-${escape(group.id)}" aria-label="${escape(t.detail.back)}">${icon('arrowBack', 'detail__back-icon')}</a>`
	);
	out.push(`${indent(5)}<div class="detail__name">`);
	out.push(`${indent(6)}<p class="detail__group">${blend(escape(group.title))}</p>`);
	out.push(`${indent(6)}<h1 class="detail__title">${camelBreaks(card.title)}</h1>`);
	out.push(`${indent(5)}</div>`);
	out.push(`${indent(5)}<dl class="detail__facts">`);
	out.push(`${indent(6)}<div><dt>${escape(t.detail.version)}</dt><dd class="detail__facts-version">${blend(escape(version))}</dd></div>`);
	for (const repository of repositories) {
		const label = repositories.length > 1 ? repository : 'GitHub';
		// catalog.json 里写了 source（仓库里的子目录）就链到那里，按最新版本的发布标签（目录以后挪了链接也不失效）；
		// 没写就链到仓库首页
		const tag = metas.find((m) => m.repository === repository && m.tag)?.tag;
		const href =
			card.source && tag
				? `https://github.com/${repository}/tree/${encodeURIComponent(tag)}/${card.source}`
				: `https://github.com/${repository}`;
		out.push(
			`${indent(6)}<div><dt>${escape(t.detail.source)}</dt><dd><a href="${escape(href)}" aria-label="${escape(label)}">${blend(`${escape(label)}${icon('arrowOutward', 'detail__facts-icon')}`)}</a></dd></div>`
		);
	}
	if (licenses.length) out.push(`${indent(6)}<div><dt>${escape(t.detail.license)}</dt><dd>${blend(escape(licenses.join(' / ')))}</dd></div>`);
	out.push(`${indent(5)}</dl>`);
	out.push(`${indent(4)}</header>`);

	// 右边：配置仓库。一张卡里的包通常同一个生态，混了几个就各写一段
	out.push(`${indent(4)}<section class="detail__setup" aria-labelledby="setup">`);
	// 标题右边：选包管理器的下拉（只有 npm 这类有几种包管理器的生态才有）。没有脚本时藏着，只显示默认那种
	const managers = ecos.flatMap((eco) => ECOSYSTEMS[eco].managers ?? []);
	out.push(`${indent(5)}<div class="detail__setup-header">`);
	out.push(`${indent(6)}<h2 class="detail__setup-title" id="setup">${escape(t.detail.setup)}</h2>`);
	if (managers.length > 1) {
		// 和包卡片的版本下拉同一套样子，只是字用 Inter、箭头（chevron）放右边（见 style.css 的 .detail__manager）
		out.push(`${indent(6)}<span class="package__picker detail__manager" hidden>`);
		out.push(`${indent(7)}<select class="package__select detail__manager-select" aria-label="${escape(t.detail.packageManager)}">`);
		for (const manager of managers) out.push(`${indent(8)}<option value="${escape(manager.id)}">${escape(manager.id)}</option>`);
		out.push(`${indent(7)}</select>`);
		out.push(`${indent(7)}${icon('expandMore', 'package__chevron detail__manager-chevron')}`);
		out.push(`${indent(6)}</span>`);
	}
	out.push(`${indent(5)}</div>`);
	for (const eco of ecos) {
		const { label, mirror, aside } = ECOSYSTEMS[eco];
		if (ecos.length > 1) out.push(`${indent(5)}<h3 class="detail__subheading">${escape(label)}</h3>`);
		// 配置一样的包管理器（npm、pnpm、deno 都用 .npmrc）合成一份，data-managers 写上都是哪几种
		const groups = new Map();
		for (const variant of variantsOf(ECOSYSTEMS[eco])) {
			const setup = variant.setup();
			const setupHint = variant.setupHint();
			const key = `${setupHint}\0${setup.file}\0${setup.code}`;
			if (!groups.has(key)) groups.set(key, { setupHint, setup, ids: [] });
			if (variant.id) groups.get(key).ids.push(variant.id);
		}
		let first = true;
		for (const { setupHint, setup, ids } of groups.values()) {
			// 说明文字交给提椠排版（<tiqian-prose>，脚本见 site/tiqian.js）；没有脚本时照常由浏览器排
			const paragraphs = [`<p class="detail__setup-text">${escape(setupHint)}</p>`];
			if (mirror) {
				paragraphs.push(
					`<p class="detail__setup-text">${format(escape(t.setup.mirror), {
						link: `<a href="${escape(mirror.href)}">${escape(mirror.name)}</a>`,
						note: escape(t.setup.notes[mirror.note])
					})}</p>`
				);
			}
			if (aside) paragraphs.push(`<p class="detail__setup-text">${t.setup.asides[aside]}</p>`);
			const prose = await prepareProse(
				paragraphs.join(`\n${indent(7)}`),
				`tq-setup-${locale}-${group.id}-${card.id}-${eco}${ids.length ? `-${ids[0]}` : ''}`,
				setupWidth
			);
			head.push(prose.head);
			// 不分包管理器的生态不包这一层
			const level = ids.length ? 6 : 5;
			if (ids.length) {
				out.push(`${indent(5)}<div class="detail__setup-variant" data-managers="${escape(ids.join(' '))}"${first ? '' : ' hidden'}>`);
			}
			out.push(`${indent(level)}<tiqian-prose class="detail__prose"${prose.attributes}>`);
			out.push(`${indent(level + 1)}${prose.html}`);
			out.push(`${indent(level)}</tiqian-prose>`);
			out.push(renderSnippet(level, setup));
			if (ids.length) out.push(`${indent(5)}</div>`);
			first = false;
		}
	}
	out.push(`${indent(4)}</section>`);
	out.push(`${indent(3)}</div>`);

	// 再列包：有分区的按分区（接入、底层……），没有的直接列
	sections.forEach((section, i) => {
		const id = `packages-${i}`;
		out.push(`${indent(3)}<section class="detail__section" aria-labelledby="${id}">`);
		out.push(`${indent(4)}<h2 class="detail__heading" id="${id}">${escape(section.title === undefined ? t.detail.packages : sectionTitle(section.title))}</h2>`);
		// 同一组的包名一起折行：--section-name-chars 是组里最长的全名（前缀加包名）几个字（见 style.css 的 .package__base）
		const fullChars = Math.max(...section.packages.map((p) => p.name.length));
		out.push(`${indent(4)}<div class="detail__packages" style="--section-name-chars: ${fullChars}">`);
		for (const pkg of section.packages) out.push(renderPackage(5, pkg));
		out.push(`${indent(4)}</div>`);
		out.push(`${indent(3)}</section>`);
	});

	out.push(`${indent(2)}</main>`);
	// 页面描述（<meta name="description"> 和分享预览）。产品名按组：MARKDOWN、MATH 是提椠 Markdown、提椠 Math，其余是提椠
	const product = { markdown: t.footer.repositories.tiqianMarkdown, math: t.footer.repositories.tiqianMath }[group.id] ?? t.footer.repositories.tiqian;
	const description = format(t.meta.detailDescription, { card: card.title, product });
	return { main: out.join('\n'), head: head.filter(Boolean).join('\n'), description };
}

// ---------- 输出 ----------

const args = parseArgs(process.argv.slice(2));
const catalog = JSON.parse(fs.readFileSync(args.catalog, 'utf8'));
const packages = readTree(args.tree);

// 其他语言的文案缺了键就别往下走了（缺的地方会显示成 undefined）
for (const target of locales) {
	const missing = missingKeys(messages[defaultLocale], messages[target]);
	if (missing.length) fail(`site/messages/${target}.mjs 缺这些文案：${missing.join('、')}`);
}

const template = fs.readFileSync(path.join(here, 'index.html'), 'utf8');
for (const slot of ['<!-- main -->', '<!-- head -->']) {
	if (!template.includes(slot)) fail(`site/index.html 里缺少 ${slot} 占位`);
}

// 页面：模板里的 {{t.xxx}} 换成当前语言的文案（转义），{{名字}} 换成下面算好的 HTML（原样）。
// pagePath 是不带语言前缀的路径（/ 或 /<组>/<卡片>/），用来算各语言版本的地址
// ---------- 会动的标志 ----------

// 标志的点头眨眼动画（site/logo-nod-wink.svg，24 × 24 的画布，SMIL）。原图一轮 2.8 秒，这里统一改成 LOGO_DURATION。拆出标志那组图形，去掉背景色块，
// 颜色改成 currentColor（跟着亮暗色变），所有动画改成 begin="indefinite"、只播一轮：不自己播，悬停时由 site/logo.js 开始
// 动画一轮多少秒（logo.js 从 .logo-mark 的 data-duration 读）。手调改这里
const LOGO_DURATION = 2;
const LOGO_ANIMATION = (() => {
	const source = fs.readFileSync(path.join(here, 'logo-nod-wink.svg'), 'utf8');
	const start = source.indexOf('<g fill=');
	const end = source.lastIndexOf('</g>');
	if (start < 0 || end < start) fail('site/logo-nod-wink.svg 里找不到标志那组图形');
	return source
		.slice(start, end + 4)
		.replace(/<g fill="[^"]*"/, '<g fill="currentColor"')
		.replace(/<(animate|animateTransform) /g, '<$1 begin="indefinite" ')
		// 每次悬停只播一轮
		.replace(/repeatCount="indefinite"/g, 'repeatCount="1"')
		.replace(/dur="[^"]*"/g, `dur="${LOGO_DURATION}s"`)
		.replace(/\s*\n\s*/g, ' ');
})();

// 动画里标志的圆（左眼）在 24 × 24 画布上的外框：x 4.16–11.26、y 5.22–12.32。
// 每张字标里，同一个圆的外框是多少，就按比例把动画放大、挪过去，正好盖在原来标志的位置上
const LOGO_CIRCLE = { x: 4.16, y: 5.22, size: 7.1 };
const placement = (width, height, x, y, size) => ({ width, height, scale: size / LOGO_CIRCLE.size, x: x - LOGO_CIRCLE.x * (size / LOGO_CIRCLE.size), y: y - LOGO_CIRCLE.y * (size / LOGO_CIRCLE.size) });
const LOGO_MARK_PLACEMENTS = {
	// 页眉：registry-text*.svg 的画布（简繁 560 × 116，英文 597 × 116），圆在 x 14.54、y 19.21，宽 35.61
	header: {
		default: placement(560, 116, 14.54, 19.21, 35.61),
		en: placement(597, 116, 14.54, 19.21, 35.61)
	},
	// 页脚：brand-text.svg 288 × 115、brand-text-en.svg 320 × 116、brand-text-hant.svg 160 × 64
	footer: {
		default: placement(288, 115, 14.96, 19.73, 36.63),
		en: placement(320, 116, 14.54, 19.21, 35.61),
		'zh-Hant': placement(160, 64, 8.31, 10.98, 20.35)
	}
};
// site/assets 里一张 SVG 的图形部分：去掉 <svg> 外壳、注释、<defs>（里面的样式会作用到整页）和写死的填充色，
// 放进内联 SVG 后由外层的 fill="currentColor" 上色
const svgArtwork = (file) =>
	fs
		.readFileSync(path.join(here, 'assets', file), 'utf8')
		.replace(/<\?xml[^>]*>/g, '')
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<defs>[\s\S]*?<\/defs>/g, '')
		.replace(/^[\s\S]*?<svg[^>]*>/, '')
		.replace(/<\/svg>\s*$/, '')
		.replace(/ (fill|class)="[^"]*"/g, '')
		.replace(/\s*\n\s*/g, ' ')
		.trim();

// 一张 SVG 写成 data URI（放在 style 属性里当遮罩用，不另外请求）
const svgDataUri = (file) =>
	`data:image/svg+xml,${encodeURIComponent(fs.readFileSync(path.join(here, 'assets', file), 'utf8').replace(/\s*\n\s*/g, ' ').trim()).replace(/'/g, '%27')}`;

// 标志的内联 SVG：字（textFile）和会动的标志叠在同一块画布上，颜色跟着文字色走
const logoArt = (textFile, { width, height, scale, x, y }) =>
	`<svg class="logo-mark" data-duration="${LOGO_DURATION}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><g fill="currentColor">${svgArtwork(textFile)}</g><g transform="translate(${x.toFixed(3)} ${y.toFixed(3)}) scale(${scale.toFixed(4)})">${LOGO_ANIMATION}</g></svg>`;

// 分享预览（Open Graph）里的语言写法
const OG_LOCALES = { 'zh-Hans': 'zh_CN', 'zh-Hant': 'zh_TW', en: 'en_US' };

function page(main, pagePath, title, head = '', description = t.meta.description) {
	const hrefs = Object.fromEntries(locales.map((target) => [target, localizePath(target, pagePath)]));
	// 页脚「语言」一栏：同一页的各语言版本，当前语言不做成链接（同官网）
	const languageItem = (target, indentLevel) => {
		const label = escape(localeNames[target]);
		const content =
			target === locale
				? `<span aria-current="true">${label}</span>`
				: `<a href="${hrefs[target]}" hreflang="${target}">${label}</a>`;
		return `${indent(indentLevel)}<li lang="${target}">${content}</li>`;
	};
	const vars = {
		lang: locale,
		title: escape(title ? `${title} — ${t.siteName}` : t.siteName),
		home: localizePath(locale, '/'),
		// 官网的语言首页是 /en、/zh-Hant（不带结尾的斜杠）
		tiqianHome: locale === defaultLocale ? 'https://tiqian.org/' : `https://tiqian.org/${locale}`,
		searchBase: locale === defaultLocale ? '' : `/${locale}`,
		// 标志按语言换：英文是拼音「Tíqiàn」，繁中是「提槧」（尺寸差异见 style.css 的 .site-header:lang(…) 和 .site-footer:lang(…)）
		// 页眉、页脚的标志：字（*-text*.svg，不含标志）和会动的标志合成一张内联 SVG（见 logoArt），和页面一起出来，
		// 不另外加载图片，免得字、标志、Registry 先后分几块出现
		brandMark: logoArt(
			{ en: 'registry-text-en.svg', 'zh-Hant': 'registry-text-hant.svg' }[locale] ?? 'registry-text.svg',
			LOGO_MARK_PLACEMENTS.header[locale] ?? LOGO_MARK_PLACEMENTS.header.default
		),
		// 「Registry」和 POWERED BY BORING PLATFORM 要用作遮罩（两层取色，见 style.css 的 .ink-blend），写成 data URI 直接放进页面
		brandWord: svgDataUri(locale === 'en' ? 'registry-word-en.svg' : 'registry-word.svg'),
		poweredWide: svgDataUri('powered-by-boring-platform.svg'),
		poweredNarrow: svgDataUri('boring-platform.svg'),
		brandLogoMark: logoArt(
			{ en: 'brand-text-en.svg', 'zh-Hant': 'brand-text-hant.svg' }[locale] ?? 'brand-text.svg',
			LOGO_MARK_PLACEMENTS.footer[locale] ?? LOGO_MARK_PLACEMENTS.footer.default
		),
		// 搜索引擎用：同一页的各语言版本
		alternates: locales
			.map((target) => `\t\t<link rel="alternate" hreflang="${target}" href="${BASE}${hrefs[target]}" />`)
			.concat(`\t\t<link rel="alternate" hreflang="x-default" href="${BASE}${hrefs[defaultLocale]}" />`)
			.join('\n'),
		description: escape(description),
		// 规范地址和分享预览（Open Graph、Twitter），预览图见上面的 ogImagePath
		social: [
			`<link rel="canonical" href="${BASE}${hrefs[locale]}" />`,
			`<meta property="og:type" content="website" />`,
			`<meta property="og:site_name" content="${escape(t.siteName)}" />`,
			`<meta property="og:title" content="${escape(title ?? t.siteName)}" />`,
			`<meta property="og:description" content="${escape(description)}" />`,
			`<meta property="og:url" content="${BASE}${hrefs[locale]}" />`,
			`<meta property="og:locale" content="${OG_LOCALES[locale]}" />`,
			...locales
				.filter((target) => target !== locale)
				.map((target) => `<meta property="og:locale:alternate" content="${OG_LOCALES[target]}" />`),
			`<meta property="og:image" content="${BASE}${ogImagePath(locale, pagePath)}" />`,
			`<meta property="og:image:width" content="${OG_WIDTH}" />`,
			`<meta property="og:image:height" content="${OG_HEIGHT}" />`,
			`<meta property="og:image:alt" content="${escape(t.siteName)}" />`,
			`<meta name="twitter:card" content="summary_large_image" />`
		]
			.map((line) => `\t\t${line}`)
			.join('\n'),
		languageItems: locales.map((target) => languageItem(target, 8)).join('\n'),
		// 放不下语言一栏时的原生下拉：值是那种语言的同一页
		languageOptions: locales
			.map(
				(target) =>
					`${indent(6)}<option value="${hrefs[target]}" lang="${target}"${target === locale ? ' selected' : ''}>${escape(localeNames[target])}</option>`
			)
			.join('\n')
	};
	const lookupMessage = (key) => {
		const value = key.split('.').reduce((node, part) => node?.[part], t);
		if (typeof value !== 'string') fail(`site/index.html 里的 {{t.${key}}} 在文案里找不到`);
		return escape(value);
	};
	return template
		.replace('<!-- main -->', main)
		.replace('<!-- head -->', head)
		.replace(/\{\{t\.([\w.]+)\}\}/g, (_, key) => lookupMessage(key))
		.replace(/\{\{(\w+)\}\}/g, (match, name) => (name in vars ? vars[name] : fail(`site/index.html 里的 ${match} 不认识`)));
}

// 小标题里的汉字来自文渊黑体的子集，只有 site/subset-label-font.py 切进去的那些字
const labelFontCss = fs.readFileSync(path.join(here, 'assets/fonts/registry-label-sc/registry-label-sc.css'), 'utf8');
const labelChars = new Set(
	[...labelFontCss.matchAll(/U\+([0-9A-F]+)/g)].map((match) => String.fromCodePoint(parseInt(match[1], 16))),
);
const missingLabelChars = new Set();
const checkLabels = (html) => {
	for (const match of html.matchAll(/class="(?:group__title|detail__group|detail__heading|detail__setup-title)"[^>]*>(.*?)<\/(?:h2|p)>/g)) {
		for (const char of match[1].replace(/<[^>]*>/g, '')) {
			if (char.codePointAt(0) >= 0x2e80 && !labelChars.has(char)) missingLabelChars.add(char);
		}
	}
};

const write = (file, html) => {
	checkLabels(html);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, html);
};

// ---------- 分享预览图 ----------

// 每个页面一张，每种语言各一张（标志、小标题不一样）：
//   首页 /og/home.png（简体）、/og/home.zh-Hant.png、/og/home.en.png
//   详情页 /og/<组>/<卡片>.png、/og/<组>/<卡片>.zh-Hant.png……
// pagePath 同 page() 的，不带语言前缀
const ogImagePath = (target, pagePath = '/') => {
	const name = pagePath === '/' ? '/og/home' : `/og${pagePath.replace(/\/$/, '')}`;
	return target === defaultLocale ? `${name}.png` : `${name}.${target}.png`;
};
{
	// 卡片底色从 style.css 里读（.card--<id> 的 --card-bg，亮色那个），和首页一致
	const css = fs.readFileSync(path.join(here, 'style.css'), 'utf8');
	const cardColor = (id, variable) =>
		/#[0-9a-f]{6}/i.exec(new RegExp(`\\.card--${id} \\{[^}]*?--${variable}: light-dark\\(([^,]+),`).exec(css)?.[1] ?? '')?.[0] ?? '#e1e3e6';
	const cardBg = (id) => cardColor(id, 'card-bg');
	const cardInfo = (groupId, cardId) => {
		const group = catalog.groups.find((g) => g.id === groupId);
		const card = group.cards.find((c) => c.id === cardId);
		const versions = sectionsOf(card)
			.flatMap((s) => s.packages)
			.map((ref) => latest([...lookup(packages, ref, `${groupId}/${cardId}`).versions.keys()]));
		return { title: card.title, version: latest(versions), bg: cardBg(cardId) };
	};
	// 上一行、下一行各三张（最左一张只露出右边一截）。手调改这里
	const cards = [
		['engine', 'swift'], ['platform', 'web'], ['platform', 'android'],
		['engine', 'rust'], ['engine', 'kotlin'], ['engine', 'typescript']
	].map(([g, c]) => cardInfo(g, c));
	// 各语言的标志：「Registry」右缘在画布上的 x（英文版画布宽一些，Registry 往右挪了 36.83，见 registry-word-en.svg）
	const logos = {
		'zh-Hans': { mark: 'registry-mark.svg', word: 'registry-word.svg', wordRight: 550.11 },
		'zh-Hant': { mark: 'registry-mark-hant.svg', word: 'registry-word.svg', wordRight: 550.11 },
		en: { mark: 'registry-mark-en.svg', word: 'registry-word-en.svg', wordRight: 586.94 }
	};
	// 字体：site/og-fonts.py 切的静态 TTF（resvg 不认 woff2 和可变字体）
	const fontFiles = fs
		.readdirSync(path.join(here, 'og-fonts'))
		.filter((file) => file.endsWith('.ttf'))
		.map((file) => path.join(here, 'og-fonts', file));
	const assets = path.join(here, 'assets');
	const writePng = (file, svg) => {
		fs.mkdirSync(path.dirname(path.join(args.out, file)), { recursive: true });
		fs.writeFileSync(path.join(args.out, file), renderPng(svg, fontFiles));
	};
	for (const target of locales) {
		const tt = messages[target];
		writePng(ogImagePath(target), homeImageSvg({ cards, assets, fontFamily: 'JetBrains Mono', logo: logos[target] }));
		// 详情页右下的小标题：中文用 MiSans Medium 13px，英文同页面上那样全大写、12px、字距 0.04em（都再乘 og.mjs 里字的放大倍数 HERO_TEXT_SCALE）
		const labelStyle =
			target === 'en'
				? { family: 'Inter', weight: 500, size: 12 * 2.7, tracking: 12 * 2.7 * 0.04, upper: true }
				: { family: 'MiSans VF', weight: 500, size: 13 * 2.7 };
		const label = (text) => (labelStyle.upper ? text.toUpperCase() : text);
		for (const group of catalog.groups) {
			for (const card of group.cards) {
				const all = sectionsOf(card).flatMap((s) => s.packages).map((ref) => lookup(packages, ref, `${group.id}/${card.id}`));
				const metas = all.map((p) => p.versions.get(latest([...p.versions.keys()])));
				const licenses = [...new Set(metas.map((m) => m.license).filter(Boolean))];
				// 顺序同页面：版本、源码、协议
				const facts = [
					{ label: label(tt.detail.version), value: latest(metas.map((m) => m.version)), kind: 'version' },
					{ label: label(tt.detail.source), value: 'GitHub', kind: 'link' },
					...(licenses.length ? [{ label: label(tt.detail.license), value: licenses.join(' / '), kind: 'text' }] : [])
				];
				const svg = detailImageSvg({
					card: { group: group.title, title: card.title, bg: cardBg(card.id), blobs: [1, 2, 3].map((n) => cardColor(card.id, `card-blob-${n}`)) },
					facts,
					labelStyle,
					assets,
					logo: logos[target],
					fontFiles,
					arrowPath: ICONS.arrowOutward
				});
				writePng(ogImagePath(target, `/${group.id}/${card.id}/`), svg);
			}
		}
	}
}

// 每种语言输出一套：简体中文在根目录，其余在 <语言>/ 下
let details = 0;
for (const target of locales) {
	locale = target;
	t = messages[target];
	const root = path.join(args.out, locale === defaultLocale ? '' : locale);
	write(path.join(root, 'index.html'), page(renderGroups(catalog, packages), '/'));
	for (const group of catalog.groups) {
		for (const card of group.cards) {
			const { main, head, description } = await renderDetail(group, card, packages);
			const pagePath = `/${group.id}/${card.id}/`;
			write(path.join(root, group.id, card.id, 'index.html'), page(main, pagePath, `${group.title} / ${card.title}`, head, description));
			if (locale === defaultLocale) details++;
		}
	}
}
locale = defaultLocale;
t = messages[defaultLocale];

// 搜索用的索引（search.js 第一次用到时取）：每张卡片一条（标题、分组），每个包一条（全名、在哪张卡片）。
// 各语言共用一份：地址不带语言前缀，search.js 按当前页面的语言补上（搜索框上的 data-base）
const searchIndex = { cards: [], packages: [] };
for (const group of catalog.groups) {
	for (const card of group.cards) {
		const href = cardHref(group, card);
		searchIndex.cards.push({ title: card.title, group: group.title, href });
		for (const section of sectionsOf(card)) {
			for (const ref of section.packages) {
				const { name } = lookup(packages, ref, `${group.id}/${card.id}`);
				searchIndex.packages.push({ name, card: card.title, group: group.title, href: `${href}#${packageAnchor(name)}` });
			}
		}
	}
}
for (const preparer of preparers.values()) preparer.close();
highlighter.dispose();
fs.mkdirSync(path.join(args.out, TABLES_DIR), { recursive: true });
for (const [file, bytes] of proseTables) fs.writeFileSync(path.join(args.out, TABLES_DIR, file), bytes);

const assets = path.join(args.out, 'assets');
fs.mkdirSync(assets, { recursive: true });
fs.writeFileSync(path.join(assets, 'search-index.json'), JSON.stringify(searchIndex));
for (const file of ['style.css', 'footer.js', 'snippet.js', 'back.js', 'versions.js', 'search.js', 'logo.js']) fs.copyFileSync(path.join(here, file), path.join(assets, file));
// 连同子目录一起复制（字体放在 assets/fonts/ 下）
fs.cpSync(path.join(here, 'assets'), assets, { recursive: true });

console.log(`site/build.mjs: ${locales.join('、')} 各一套首页和 ${details} 个详情页已写到 ${args.out}`);
if (missingLabelChars.size) {
	console.warn(
		`site/build.mjs: 小标题字体缺这些字，会退回 MiSans：${[...missingLabelChars].join('')}。重跑 site/subset-label-font.py`,
	);
}
