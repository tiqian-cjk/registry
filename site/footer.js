/*
 * 页脚导航分栏，移植自官网（tiqian-cjk/homepage 的 footer-layout.ts 与 SiteFooter.svelte）。
 * 把各项（按原顺序）分进至多 maxColumns 栏，使最高一栏最矮；尺寸参数读自 CSS 变量。
 * 脚本运行前每项各占一栏，靠换行排布。
 */

function arrangeColumns(heights, maxColumns, gap, isolateFirst) {
	const count = heights.length;
	if (count === 0) return [];

	const tolerance = 1;
	const limit = Math.max(isolateFirst ? 2 : 1, Math.floor(maxColumns));
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

const container = document.querySelector('.site-footer__columns');
const items = [...container.querySelectorAll('[data-footer-item]')].sort(
	(a, b) => Number(a.dataset.footerItem) - Number(b.dataset.footerItem)
);
let current = JSON.stringify(items.map((_, item) => [item]));

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
	const heights = items.map((element) => element.getBoundingClientRect().height);

	const maxColumns = wide
		? 1 + Math.max(1, Math.floor((width - brandColumnWidth) / (columnWidth + columnGap)))
		: Math.max(1, Math.floor((width + columnGap) / (columnWidth + columnGap)));

	const next = arrangeColumns(heights, maxColumns, rowGap, wide);
	const key = JSON.stringify(next);
	if (key === current) return;
	current = key;
	container.replaceChildren(
		...next.map((column) => {
			const element = document.createElement('div');
			element.className = 'site-footer__column';
			element.append(...column.map((item) => items[item]));
			return element;
		})
	);
}

layout();
new ResizeObserver(layout).observe(container);
