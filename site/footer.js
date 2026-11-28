/*
 * 页脚导航分栏，移植自官网（tiqian-cjk/homepage 的 footer-layout.ts 与 SiteFooter.svelte）。
 * 把各项（按原顺序）分进至多 maxColumns 栏，使最高一栏最矮；尺寸参数读自 CSS 变量。
 * 脚本运行前每项各占一栏，靠换行排布。
 *
 * 语言（最后一组）的两种放法，同官网：放得下时单独成栏、推到右侧对齐线；
 * 放不下时不进分栏，改成列表上方靠右的原生下拉（index.html 里的 .site-footer__language-menu），选了就跳到那种语言的同一页。
 */

/*
 * 穷举所有分法：每一项放进已用的某一栏或新开一栏，栏内保持原顺序。
 * 平手时依次比较：用的栏数更多（放得下就不叠放）→ 靠前的项更靠前（枚举顺序天然满足）。
 * isolateFirst：第一项单独占第一栏；isolateLast：最后一项单独占最后一栏。
 */
function arrangeColumns(heights, maxColumns, gap, { isolateFirst = false, isolateLast = false } = {}) {
	const count = heights.length;
	if (count === 0) return [];

	/* 高度差在 1px 内视为相同，避免亚像素误差影响平手判断 */
	const tolerance = 1;
	const limit = Math.max(1 + Number(isolateFirst) + Number(isolateLast), Math.floor(maxColumns));
	const assignment = new Array(count).fill(0);
	let best = null;

	const evaluate = (used) => {
		const totals = new Array(used).fill(0);
		const sizes = new Array(used).fill(0);
		for (let i = 0; i < count; i++) {
			totals[assignment[i]] += heights[i];
			sizes[assignment[i]] += 1;
		}
		const height = Math.max(...totals.map((total, column) => total + gap * (sizes[column] - 1)));
		if (
			!best ||
			height < best.height - tolerance ||
			(height <= best.height + tolerance && used > best.used)
		) {
			best = { height, used, assignment: [...assignment] };
		}
	};

	const visit = (index, used) => {
		if (index === count) {
			evaluate(used);
			return;
		}
		/* 单独成栏的最后一项只能新开一栏，也就落在最后一栏 */
		if (isolateLast && index > 0 && index === count - 1) {
			if (used < limit) {
				assignment[index] = used;
				visit(index + 1, used + 1);
			}
			return;
		}
		for (let column = 0; column <= Math.min(used, limit - 1); column++) {
			if (isolateFirst && column === 0) continue;
			assignment[index] = column;
			visit(index + 1, Math.max(used, column + 1));
		}
	};

	visit(1, 1);

	const result = Array.from({ length: best.used }, () => []);
	best.assignment.forEach((column, item) => result[column].push(item));
	return result;
}

/* 分栏后的总高度：各栏（项高之和 + 项间距）中最高的一栏 */
function columnsHeight(columns, heights, gap) {
	return Math.max(
		0,
		...columns.map((column) => column.reduce((sum, item) => sum + heights[item], 0) + gap * (column.length - 1))
	);
}

const container = document.querySelector('.site-footer__columns');
const languageMenu = document.querySelector('.site-footer__language-menu');
const items = [...container.querySelectorAll('[data-footer-item]')].sort(
	(a, b) => Number(a.dataset.footerItem) - Number(b.dataset.footerItem)
);
const language = items.length - 1;
let current = null;
/* 语言组的高度：改成下拉菜单后它不在分栏里，量不到，沿用上次量到的值（不随宽度变化） */
let languageHeight = 0;

function layout() {
	const style = getComputedStyle(container);
	const length = (name) => parseFloat(style.getPropertyValue(name));
	const columnWidth = length('--footer-column-width');
	const columnGap = length('--footer-column-gap');
	const rowGap = length('--footer-row-gap');
	const brandColumnWidth = length('--footer-brand-column-width');
	const wide = style.getPropertyValue('--footer-layout').trim() === 'wide';
	/* 用未取整的宽度：clientWidth 会四舍五入，差零点几像素时会误判多放一栏 */
	const width = container.getBoundingClientRect().width;
	const heights = items.map((element) => (element.isConnected ? element.getBoundingClientRect().height : 0));

	const maxColumns = wide
		? 1 + Math.max(1, Math.floor((width - brandColumnWidth) / (columnWidth + columnGap)))
		: Math.max(1, Math.floor((width + columnGap) / (columnWidth + columnGap)));

	if (heights[language]) languageHeight = heights[language];
	else heights[language] = languageHeight;

	/* 语言之外的各项照常分栏 */
	const others = arrangeColumns(heights.slice(0, language), maxColumns, rowGap, { isolateFirst: wide });
	/* 语言单独成栏靠右，前提是栏数够、整体也不因此变高 */
	const pinned = arrangeColumns(heights, maxColumns, rowGap, { isolateFirst: wide, isolateLast: true });
	const languagePinned =
		pinned.length <= maxColumns && columnsHeight(pinned, heights, rowGap) <= columnsHeight(others, heights, rowGap) + 1;

	const next = languagePinned ? pinned : others;
	const key = JSON.stringify(next);
	if (key === current) return;
	current = key;
	languageMenu.hidden = languagePinned;
	container.replaceChildren(
		...next.map((column, index) => {
			const element = document.createElement('div');
			element.className = 'site-footer__column';
			if (languagePinned && index === next.length - 1) element.classList.add('site-footer__column--end');
			element.append(...column.map((item) => items[item]));
			return element;
		})
	);
}

layout();
new ResizeObserver(layout).observe(container);

/*
 * 选过的语言记在 cookie 里（一年）：服务器端按它跳到这种语言的页面，不再按浏览器语言跳
 * （见 functions/_middleware.js，cookie 名两边要一致）
 */
const rememberLanguage = (locale) => {
	document.cookie = `tiqian-registry-lang=${locale}; path=/; max-age=31536000; samesite=lax`;
};

/* 原生下拉：选了哪种语言就记下来，跳到它的同一页（option 的 value） */
const languageSelect = languageMenu.querySelector('.site-footer__language-select');
languageSelect.addEventListener('change', () => {
	rememberLanguage(languageSelect.selectedOptions[0].lang);
	location.href = languageSelect.value;
});

/* 语言单独一栏时是链接：点了同样记下来，再照常跳转 */
for (const link of document.querySelectorAll('.site-footer__group--language a[hreflang]')) {
	link.addEventListener('click', () => rememberLanguage(link.hreflang));
}
