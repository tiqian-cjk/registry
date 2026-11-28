/*
 * 页眉的搜索：边输边在搜索框下面列出匹配的卡片（按分组列，分组名当小标题）和包，点了（或回车）进详情页；包会直接滚到它那张卡。
 * 搜卡片标题、分组名（搜 PLATFORM 列出这组的卡片）、包的全名。不分大小写；空格隔开的几个词都要对上。
 * 索引由 build.mjs 写在 /assets/search-index.json，第一次聚焦时才取。各语言共用，地址不带语言前缀，
 * 这里补上当前语言的（搜索框上的 data-base）；几句提示也按页面语言写在搜索框的 data-* 上（见 index.html）。
 * 没有脚本时下拉里只有一句提示（见 index.html），这里加上 .search--ready 把提示换成结果列表。
 * 键盘：↑ ↓ 选，回车打开，Esc 先清空、再按一次离开搜索框。
 */

const form = document.querySelector('.search');
const input = form?.querySelector('input');
const list = form?.querySelector('.search__results');

// 每组最多列几条。手调改这里
const MAX_CARDS = 6;
const MAX_PACKAGES = 8;

if (form && input && list) {
	form.classList.add('search--ready');
	list.hidden = false;
	input.setAttribute('role', 'combobox');
	input.setAttribute('aria-controls', list.id);
	input.setAttribute('aria-autocomplete', 'list');
	input.setAttribute('aria-expanded', 'false');

	let index = null;
	let loading = null;
	let options = [];
	let active = -1;

	const load = () =>
		(loading ??= fetch('/assets/search-index.json')
			.then((response) => (response.ok ? response.json() : Promise.reject(new Error(response.statusText))))
			.then((data) => {
				index = data;
			})
			.catch(() => {
				index = { failed: true };
			}));

	const escape = (text) =>
		text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);

	// 排序：标题（包是去掉前缀的名字）以搜索词开头的最前，其次是某个词以它开头，最后是中间含有
	const rank = (text, query) => {
		const lower = text.toLowerCase();
		if (lower.startsWith(query)) return 0;
		if (lower.split(/[^a-z0-9⺀-￿]+/).some((word) => word.startsWith(query))) return 1;
		return 2;
	};

	const search = (query) => {
		const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
		const matches = (text) => terms.every((term) => text.toLowerCase().includes(term));
		const first = terms[0];
		const cards = index.cards
			.filter((card) => matches(`${card.title} ${card.group}`))
			.map((card) => ({ ...card, rank: Math.min(rank(card.title, first), rank(card.group, first) + 1) }))
			.sort((a, b) => a.rank - b.rank);
		const packages = index.packages
			.filter((pkg) => matches(pkg.name))
			.map((pkg) => {
				const [, scope = '', base] = /^(@[^/]+\/|[^:]+:)?(.+)$/.exec(pkg.name);
				return { ...pkg, scope, base, rank: rank(base, first) };
			})
			.sort((a, b) => a.rank - b.rank || a.name.length - b.name.length);
		return { cards: cards.slice(0, MAX_CARDS), packages: packages.slice(0, MAX_PACKAGES) };
	};

	const base = form.dataset.base ?? '';
	const option = (path, title, meta) => {
		const href = base + path;
		const i = options.length;
		options.push(href);
		const metaHtml = meta ? `<span class="search__meta">${meta}</span>` : '';
		return `<li role="presentation"><a class="search__option" id="search-option-${i}" role="option" aria-selected="false" href="${escape(href)}">${title}${metaHtml}</a></li>`;
	};

	const render = () => {
		const query = input.value.trim();
		options = [];
		active = -1;
		input.removeAttribute('aria-activedescendant');
		form.classList.toggle('search--open', Boolean(query));
		input.setAttribute('aria-expanded', String(Boolean(query)));
		if (!query) {
			list.innerHTML = '';
			return;
		}
		if (!index) {
			list.innerHTML = '';
			load().then(render);
			return;
		}
		if (index.failed) {
			list.innerHTML = `<li class="search__empty" role="presentation">${escape(form.dataset.failed)}</li>`;
			return;
		}
		const { cards, packages } = search(query);
		const html = [];
		// 首页上的卡片（TypeScript、Web……）按分组列，分组名当小标题；哪组排前面看组里最靠前的那张
		const groups = new Map();
		for (const card of cards) {
			if (!groups.has(card.group)) groups.set(card.group, []);
			groups.get(card.group).push(card);
		}
		for (const [group, members] of groups) {
			html.push(`<li class="search__heading" role="presentation">${escape(group)}</li>`);
			for (const card of members) html.push(option(card.href, `<span class="search__title">${escape(card.title)}</span>`));
		}
		if (packages.length) {
			html.push(`<li class="search__heading" role="presentation">${escape(form.dataset.packages)}</li>`);
			for (const pkg of packages) {
				const name = `<span class="search__title search__title--package"><span class="search__scope">${escape(pkg.scope)}</span>${escape(pkg.base)}</span>`;
				html.push(option(pkg.href, name, `${escape(pkg.group)} / ${escape(pkg.card)}`));
			}
		}
		if (!html.length) {
			html.push(`<li class="search__empty" role="presentation">${escape(form.dataset.empty).replace('{query}', escape(query))}</li>`);
		}
		list.innerHTML = html.join('');
	};

	const select = (i) => {
		const items = list.querySelectorAll('.search__option');
		items[active]?.setAttribute('aria-selected', 'false');
		active = i;
		const item = items[active];
		if (!item) {
			input.removeAttribute('aria-activedescendant');
			return;
		}
		item.setAttribute('aria-selected', 'true');
		item.scrollIntoView({ block: 'nearest' });
		input.setAttribute('aria-activedescendant', item.id);
	};

	input.addEventListener('focus', load);
	input.addEventListener('input', render);
	input.addEventListener('keydown', (event) => {
		if (event.isComposing) return;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			if (!options.length) return;
			event.preventDefault();
			const step = event.key === 'ArrowDown' ? 1 : -1;
			select((active + step + options.length + (active === -1 && step < 0 ? 1 : 0)) % options.length);
		} else if (event.key === 'Enter') {
			const href = options[active === -1 ? 0 : active];
			if (href) location.href = href;
		} else if (event.key === 'Escape') {
			if (input.value) {
				input.value = '';
				render();
			} else {
				input.blur();
			}
		}
	});

	// 点结果时别让搜索框先失焦（失焦会收起下拉，窄屏上搜索框还会缩回去），点击照常跳转
	list.addEventListener('mousedown', (event) => event.preventDefault());
	// 鼠标移到哪条，键盘就从哪条接着选
	list.addEventListener('mousemove', (event) => {
		const item = event.target.closest('.search__option');
		if (item) select([...list.querySelectorAll('.search__option')].indexOf(item));
	});
}
