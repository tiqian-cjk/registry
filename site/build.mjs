// 生成 registry.tiqian.org 首页：按 catalog.json 的分组，从元数据树里取各包的最新版本，
// 填进 site/index.html，与样式、脚本、图标一起写到输出目录。
// 用法：node site/build.mjs --tree <元数据树> --catalog <catalog.json> --out <输出目录>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

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
// 以「生态:包名」为键收集各版本，Maven 的包名带上 groupId。
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
					if (!packages.has(key)) packages.set(key, []);
					packages.get(key).push(meta.version);
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

const escape = (s) =>
	String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function renderGroups(catalog, packages) {
	const indent = (n) => '\t'.repeat(n);
	const out = [];
	for (const group of catalog.groups) {
		out.push(`${indent(3)}<section class="group" aria-labelledby="group-${escape(group.id)}">`);
		out.push(`${indent(4)}<h2 class="group__title" id="group-${escape(group.id)}">${escape(group.title)}</h2>`);
		out.push(`${indent(4)}<ul class="group__cards">`);
		for (const card of group.cards) {
			const refs = (card.sections ?? [{ packages: card.packages }]).flatMap((s) => s.packages);
			const versions = refs.map((ref) => {
				if (!packages.has(ref)) fail(`catalog.json 里的 ${ref}（${group.id}/${card.id}）在元数据树里找不到`);
				return latest(packages.get(ref));
			});
			out.push(`${indent(5)}<li class="card card--${escape(card.id)}">`);
			// 背景色块：三块模糊的颜色，位置和颜色在 style.css 里按卡片设（没设的卡片不显示）
			out.push(`${indent(6)}<div class="card__blobs" aria-hidden="true"><i></i><i></i><i></i></div>`);
			// 驼峰处（小写后接大写，如 TypeScript）允许折行：窄卡片放不下整个词时在这里断开
			const title = escape(card.title).replace(/([a-z])(?=[A-Z])/g, '$1<wbr>');
			out.push(`${indent(6)}<h3 class="card__title">${title}</h3>`);
			// data-version：样式里用它再画一层同样的字（混合模式那层），见 style.css 的 .card__version
			const version = escape(latest(versions));
			out.push(`${indent(6)}<p class="card__version" data-version="${version}">${version}</p>`);
			out.push(`${indent(5)}</li>`);
		}
		out.push(`${indent(4)}</ul>`);
		out.push(`${indent(3)}</section>`);
	}
	return out.join('\n');
}

const args = parseArgs(process.argv.slice(2));
const catalog = JSON.parse(fs.readFileSync(args.catalog, 'utf8'));
const packages = readTree(args.tree);

const template = fs.readFileSync(path.join(here, 'index.html'), 'utf8');
if (!template.includes('<!-- groups -->')) fail('site/index.html 里缺少 <!-- groups --> 占位');
const html = template.replace('<!-- groups -->', renderGroups(catalog, packages));

const assets = path.join(args.out, 'assets');
fs.mkdirSync(assets, { recursive: true });
fs.writeFileSync(path.join(args.out, 'index.html'), html);
for (const file of ['style.css', 'footer.js']) fs.copyFileSync(path.join(here, file), path.join(assets, file));
// 连同子目录一起复制（字体放在 assets/fonts/ 下）
fs.cpSync(path.join(here, 'assets'), assets, { recursive: true });

console.log(`site/build.mjs: 首页已写到 ${path.join(args.out, 'index.html')}`);
