// 生成 registry.tiqian.org 的页面：按 catalog.json 的分组，从元数据树里取各包的版本，
// 填进 site/index.html，与样式、脚本、图标一起写到输出目录。
//   首页：/index.html，各组的卡片，每张卡显示组内包的最新版本
//   详情页：/<组>/<卡片>/index.html，这张卡里每个包的接入写法（可以切换版本）
// 用法：node site/build.mjs --tree <元数据树> --catalog <catalog.json> --out <输出目录>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHtmlPreparer, renderSnapshotServerAssets } from '@tiqian/precompute/precompute-html';
import { createCssVariablesTheme, createHighlighter } from 'shiki';

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

// 驼峰处（小写后接大写，如 TypeScript）允许折行：放不下整个词时在这里断开，而不是从词中间断
const camelBreaks = (title) => escape(title).replace(/([a-z])(?=[A-Z])/g, '$1<wbr>');

// 卡片里的包：有分区的（平台卡片）按分区，没有的整张卡算一个不带标题的分区
const sectionsOf = (card) => card.sections ?? [{ packages: card.packages }];
const cardHref = (group, card) => `/${group.id}/${card.id}/`;

function lookup(packages, ref, where) {
	if (!packages.has(ref)) fail(`catalog.json 里的 ${ref}（${where}）在元数据树里找不到`);
	return packages.get(ref);
}

// ---------- 接入写法 ----------

// 每个生态：先把本站加成仓库（setup），再按包写依赖（dependency）
const ECOSYSTEMS = {
	maven: {
		label: 'Gradle',
		setupHint: '复制以下内容到您项目的 settings.gradle.kts 文件，以使用提椠 Registry 中提供的包。',
		mirror: {
			name: 'Maven Central',
			href: 'https://mvnrepository.com/artifact/org.tiqian',
			note: '由于 Maven Central 的配额限制，我们只在其中提供稳定和较大更新的版本。'
		},
		setup: () => ({
			file: 'settings.gradle.kts',
			code: `dependencyResolutionManagement {\n    repositories {\n        maven("${BASE}/maven/")\n    }\n}`
		}),
		dependency: (name, version) => ({ file: 'build.gradle.kts', code: `implementation("${name}:${version}")` })
	},
	npm: {
		label: 'npm',
		setupHint: '复制以下内容到您项目根目录的 .npmrc 文件，以使用提椠 Registry 中提供的包。',
		mirror: {
			name: 'NPM',
			href: 'https://www.npmjs.com/org/tiqian',
			note: '在大多数情况下，包内容和更新速度与提椠 Registry 相同。'
		},
		setup: () => ({ file: '.npmrc', code: `@tiqian:registry=${BASE}/npm/` }),
		dependency: (name, version) => ({ code: `npm install ${name}@${version}` })
	},
	cargo: {
		label: 'Cargo',
		setupHint: '复制以下内容到您项目的 .cargo/config.toml 文件，以使用提椠 Registry 中提供的包。',
		// 配置说明后面再加的一段（HTML，原样输出）
		aside:
			'您也可以使用<a href="https://github.com/tiqian-cjk/tiqian-rs">提椠 Rust</a>，一个原生使用 Rust 编写的版本，来获得更好的性能与内存管理。其行为可能与提椠有些许不同。',
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
		setupHint: '在终端中运行以下命令，以使用提椠 Registry 中提供的包。',
		setup: () => ({ code: `export PUB_HOSTED_URL=${BASE}/pub` }),
		dependency: (name, version) => ({ code: `dart pub add ${name}:${version}` })
	},
	swift: {
		label: 'Swift Package Registry',
		setupHint: '在终端中运行以下命令，以使用提椠 Registry 中提供的包。',
		setup: () => ({ code: `swift package-registry set ${BASE}/swift/` }),
		dependency: (name, version) => ({
			file: 'Package.swift',
			code: `.package(id: "${SWIFT_SCOPE}.${name}", exact: "${version}")`
		})
	}
};

// Material Symbols（Outlined，grade 0、opsz 24，不填充；Apache-2.0）。字重默认 400，个别注明的是 500
const ICONS = {
	arrowBack: 'M313-440l224 224-57 56-320-320 320-320 57 56-224 224h487v80H313Z',
	// arrowOutward 和 unfoldMore 跟在 Medium、Semibold 的小字后面，用 500 字重，不然显得细
	arrowOutward: 'M258.39-232.11 194.5-296 573-674.5H236.89v-91h491v491h-91v-336.11l-378.5 378.5Z',
	contentCopy:
		'M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Zm160-240v-480 480Z',
	check: 'M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z',
	unfoldMore:
		'M480-112.35 291.63-300.72l65.65-65.41L480-243.41l122.72-122.72 65.65 65.41L480-112.35ZM357.28-590.59 291.63-656 480-844.37 668.37-656l-65.65 65.41L480-713.3 357.28-590.59Z'
};
const icon = (name, className = 'icon') =>
	`<svg class="${className}" viewBox="0 -960 960 960" aria-hidden="true"><path fill="currentColor" d="${ICONS[name]}" /></svg>`;

// ---------- 代码高亮 ----------

// 构建时用 Shiki 切词，按 TextMate 作用域分几类上色（颜色在 style.css 的 .tok-*，亮色暗色各一套）：
//   string 字符串和值，func 函数名和命令名，key 键名和参数标签，keyword 关键字，quiet 标点（调淡），comment 注释
const SNIPPET_LANGS = ['kotlin', 'toml', 'swift', 'shellscript', 'ini'];
const highlighter = await createHighlighter({
	themes: [createCssVariablesTheme({ name: 'css-variables', variablePrefix: '--shiki-' })],
	langs: SNIPPET_LANGS
});

function tokenKind(scopes) {
	const scope = scopes.join(' ');
	if (/\bcomment\b/.test(scope)) return 'comment';
	if (/string\.quoted|punctuation\.definition\.string/.test(scope)) return 'string';
	if (/entity\.name\.(command|function)|support\.function/.test(scope)) return 'func';
	if (/variable\.other\.(key|assignment)|keyword\.other\.definition|entity\.name\.section/.test(scope)) return 'key';
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
	out.push(`${indent(level + 2)}<span class="snippet__file">${escape(file ?? '终端')}</span>`);
	out.push(
		`${indent(level + 2)}<button class="snippet__copy" type="button" aria-label="复制" hidden>${icon('contentCopy', 'snippet__icon')}${icon('check', 'snippet__icon snippet__icon--done')}</button>`
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

	const out = [`${indent(level)}<article class="package">`];
	out.push(`${indent(level + 1)}<header class="package__header">`);
	const name = packageName(pkg.name);
	// 版本：没有脚本时就是最新版本号，链到它的发布页；有脚本（versions.js）时换成下拉切换 + 发布页链接，
	// 切换版本时下面代码框的写法跟着换。只有一个版本的包不做切换
	out.push(`${indent(level + 2)}<div class="package__version">`);
	out.push(
		`${indent(level + 3)}<a class="package__release" href="${escape(release(current))}" aria-label="${escape(current)} 的发布页">${escape(current)}</a>`
	);
	if (versions.length > 1) {
		out.push(`${indent(level + 3)}<span class="package__picker" hidden>`);
		out.push(`${indent(level + 4)}${icon('unfoldMore', 'package__chevron')}`);
		out.push(`${indent(level + 4)}<select class="package__select" aria-label="${escape(pkg.name)} 的版本">`);
		for (const version of versions) {
			out.push(
				`${indent(level + 5)}<option value="${escape(version)}" data-release="${escape(release(version))}">${escape(version)}</option>`
			);
		}
		out.push(`${indent(level + 4)}</select>`);
		out.push(`${indent(level + 3)}</span>`);
		out.push(
			`${indent(level + 3)}<a class="package__release-link" href="${escape(release(current))}" aria-label="${escape(current)} 的发布页" hidden>${icon('arrowOutward', 'package__release-icon')}</a>`
		);
	}
	out.push(`${indent(level + 2)}</div>`);
	// 包名写在版本后面：版本浮在右边，包名绕着它排（见 style.css 的 .package__header）
	out.push(`${indent(level + 2)}<h3 class="package__name" style="--scope-chars: ${name.scope}">${name.html}</h3>`);
	out.push(`${indent(level + 1)}</header>`);

	// 依赖写法，作为卡片的第二行（同一排的卡片只共用包名那一行的高度，见 style.css 的 .package）
	out.push(`${indent(level + 1)}<div class="package__body">`);
	out.push(renderSnippet(level + 2, eco.dependency(pkg.name, current)));
	// 每个版本的写法预先生成好，切换版本时 versions.js 拿来换掉代码框里的内容
	if (versions.length > 1) {
		for (const version of versions) {
			out.push(
				`${indent(level + 2)}<template class="package__variant" data-version="${escape(version)}">${snippetCode(eco.dependency(pkg.name, version))}</template>`
			);
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
const PROSE_TYPOGRAPHY = {
	fontFamilies: ['Inter Static', 'MiSans'],
	fontSizePx: 14,
	lineHeightPx: 14 * 1.6,
	locale: 'zh-Hans',
	fontWeight: 400
};
const PROSE_FONT_STYLESHEETS = ['fonts/inter-static/inter-static.css', 'fonts/misans/MiSans-Regular.min.css'];
// 预排表（每页一份，按内容哈希命名）放在这里，<tiqian-prose> 的 tq-tables 指过来
const TABLES_DIR = 'assets/tiqian-tables';

let preparer;
const proseTables = new Map();

// 返回 { attributes, html, head }：<tiqian-prose> 上加的属性、预排后的段落（加了 data-tq-snapshot-key）、
// 要放进 <head> 的数据。预排失败只提示，段落照原样输出，交给浏览器里的脚本排
async function prepareProse(html, id, widthPx) {
	preparer ??= await createHtmlPreparer({
		fontStylesheets: PROSE_FONT_STYLESHEETS.map((file) => ({
			source: path.join(here, 'assets', file),
			publicUrl: `/assets/${file}`
		})),
		typography: PROSE_TYPOGRAPHY
	});
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
// JetBrains Mono 13px 每个字宽按 0.603em 算，实测约 0.602em），再向上取整到正文字号 14px 的整数倍，
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
	const setupWidth = Math.max(...ecos.map((eco) => setupWidthPx(ECOSYSTEMS[eco].setup().code)));
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
		`${indent(5)}<a class="detail__back" href="/#group-${escape(group.id)}" aria-label="返回首页">${icon('arrowBack', 'detail__back-icon')}</a>`
	);
	out.push(`${indent(5)}<div class="detail__name">`);
	out.push(`${indent(6)}<p class="detail__group">${blend(escape(group.title))}</p>`);
	out.push(`${indent(6)}<h1 class="detail__title">${camelBreaks(card.title)}</h1>`);
	out.push(`${indent(5)}</div>`);
	out.push(`${indent(5)}<dl class="detail__facts">`);
	out.push(`${indent(6)}<div><dt>版本</dt><dd class="detail__facts-version">${blend(escape(version))}</dd></div>`);
	for (const repository of repositories) {
		const label = repositories.length > 1 ? repository : 'GitHub';
		out.push(
			`${indent(6)}<div><dt>源码</dt><dd><a href="https://github.com/${escape(repository)}" aria-label="${escape(label)}">${blend(`${escape(label)}${icon('arrowOutward', 'detail__facts-icon')}`)}</a></dd></div>`
		);
	}
	if (licenses.length) out.push(`${indent(6)}<div><dt>协议</dt><dd>${blend(escape(licenses.join(' / ')))}</dd></div>`);
	out.push(`${indent(5)}</dl>`);
	out.push(`${indent(4)}</header>`);

	// 右边：配置仓库。一张卡里的包通常同一个生态，混了几个就各写一段
	out.push(`${indent(4)}<section class="detail__setup" aria-labelledby="setup">`);
	out.push(`${indent(5)}<h2 class="detail__setup-title" id="setup">配置仓库</h2>`);
	for (const eco of ecos) {
		const { label, setupHint, mirror, aside, setup } = ECOSYSTEMS[eco];
		if (ecos.length > 1) out.push(`${indent(5)}<h3 class="detail__subheading">${escape(label)}</h3>`);
		// 说明文字交给提椠排版（<tiqian-prose>，脚本见 site/tiqian.js）；没有脚本时照常由浏览器排
		const paragraphs = [`<p class="detail__setup-text">${escape(setupHint)}</p>`];
		if (mirror) {
			paragraphs.push(
				`<p class="detail__setup-text">您也可以使用我们发布在 <a href="${escape(mirror.href)}">${escape(mirror.name)}</a> 中的版本。${escape(mirror.note)}</p>`
			);
		}
		if (aside) paragraphs.push(`<p class="detail__setup-text">${aside}</p>`);
		const prose = await prepareProse(
			paragraphs.join(`\n${indent(6)}`),
			`tq-setup-${group.id}-${card.id}-${eco}`,
			setupWidth
		);
		head.push(prose.head);
		out.push(`${indent(5)}<tiqian-prose class="detail__prose"${prose.attributes}>`);
		out.push(`${indent(6)}${prose.html}`);
		out.push(`${indent(5)}</tiqian-prose>`);
		out.push(renderSnippet(5, setup()));
	}
	out.push(`${indent(4)}</section>`);
	out.push(`${indent(3)}</div>`);

	// 再列包：有分区的按分区（接入、底层……），没有的直接列
	sections.forEach((section, i) => {
		const id = `packages-${i}`;
		out.push(`${indent(3)}<section class="detail__section" aria-labelledby="${id}">`);
		out.push(`${indent(4)}<h2 class="detail__heading" id="${id}">${escape(section.title ?? '包')}</h2>`);
		// 同一组的包名一起折行：--section-name-chars 是组里最长的全名（前缀加包名）几个字（见 style.css 的 .package__base）
		const fullChars = Math.max(...section.packages.map((p) => p.name.length));
		out.push(`${indent(4)}<div class="detail__packages" style="--section-name-chars: ${fullChars}">`);
		for (const pkg of section.packages) out.push(renderPackage(5, pkg));
		out.push(`${indent(4)}</div>`);
		out.push(`${indent(3)}</section>`);
	});

	out.push(`${indent(2)}</main>`);
	return { main: out.join('\n'), head: head.filter(Boolean).join('\n') };
}

// ---------- 输出 ----------

const args = parseArgs(process.argv.slice(2));
const catalog = JSON.parse(fs.readFileSync(args.catalog, 'utf8'));
const packages = readTree(args.tree);

const template = fs.readFileSync(path.join(here, 'index.html'), 'utf8');
for (const slot of ['<!-- main -->', '<!-- head -->']) {
	if (!template.includes(slot)) fail(`site/index.html 里缺少 ${slot} 占位`);
}
const page = (main, title, head = '') =>
	template
		.replace('<!-- main -->', main)
		.replace('<!-- head -->', head)
		.replace('<title>提椠 Registry</title>', `<title>${title ? `${escape(title)} · ` : ''}提椠 Registry</title>`);

// 小标题里的汉字来自文渊黑体的子集，只有 site/subset-label-font.py 切进去的那些字
const labelFontCss = fs.readFileSync(path.join(here, 'assets/fonts/registry-label-sc/registry-label-sc.css'), 'utf8');
const labelChars = new Set(
	[...labelFontCss.matchAll(/U\+([0-9A-F]+)/g)].map((match) => String.fromCodePoint(parseInt(match[1], 16))),
);
const missingLabelChars = new Set();
const checkLabels = (html) => {
	for (const match of html.matchAll(/class="(?:group__title|detail__group|detail__heading)"[^>]*>(.*?)<\/(?:h2|p)>/g)) {
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

write(path.join(args.out, 'index.html'), page(renderGroups(catalog, packages)));
let details = 0;
for (const group of catalog.groups) {
	for (const card of group.cards) {
		const title = `${card.title}（${group.title}）`;
		const { main, head } = await renderDetail(group, card, packages);
		write(path.join(args.out, group.id, card.id, 'index.html'), page(main, title, head));
		details++;
	}
}

preparer?.close();
highlighter.dispose();
fs.mkdirSync(path.join(args.out, TABLES_DIR), { recursive: true });
for (const [file, bytes] of proseTables) fs.writeFileSync(path.join(args.out, TABLES_DIR, file), bytes);

const assets = path.join(args.out, 'assets');
fs.mkdirSync(assets, { recursive: true });
for (const file of ['style.css', 'footer.js', 'snippet.js', 'back.js', 'versions.js']) fs.copyFileSync(path.join(here, file), path.join(assets, file));
// 连同子目录一起复制（字体放在 assets/fonts/ 下）
fs.cpSync(path.join(here, 'assets'), assets, { recursive: true });

console.log(`site/build.mjs: 首页和 ${details} 个详情页已写到 ${args.out}`);
if (missingLabelChars.size) {
	console.warn(
		`site/build.mjs: 小标题字体缺这些字，会退回 MiSans：${[...missingLabelChars].join('')}。重跑 site/subset-label-font.py`,
	);
}
