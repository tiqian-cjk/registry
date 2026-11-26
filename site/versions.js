/*
 * 详情页的两种切换，都是换代码框里的写法：
 * - 包卡片右上角的下拉选一个版本，旁边的 ↗ 链到它的发布页；
 * - 「配置仓库」右边的下拉选包管理器（npm、pnpm……），配置那段和每张包卡片的安装命令都跟着换。选过的记在本地，下次打开还是它。
 * 每种写法由 build.mjs 预先生成：包卡片的在 <template class="package__variant">（data-version、data-manager），
 * 配置那段是几块 .detail__setup-variant（data-managers），只显示选中的那块。
 * 只换 <code> 里面的内容，不换 <code> 本身：复制按钮（snippet.js）拿的是这个元素，复制的就是当前这份。
 * 没有脚本时，下拉和 ↗ 都是 hidden，卡片上只显示最新版本号（链到它的发布页），写法都是默认那种包管理器的。
 */

const MANAGER_KEY = 'tiqian-registry:package-manager';
const managerSelect = document.querySelector('.detail__manager-select');

// 下拉的宽度跟着选中的那项走。支持 field-sizing: content 的浏览器样式里就办了（见 style.css 的 .package__select），
// 不支持的按选中那项的文字宽度加左右内边距设
const fitsByItself = CSS.supports('field-sizing', 'content');
const measure = document.createElement('canvas').getContext('2d');
function fit(select) {
	if (fitsByItself) return;
	const style = getComputedStyle(select);
	measure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
	const text = select.selectedOptions[0]?.text ?? '';
	const width = measure.measureText(text).width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
	select.style.width = `${Math.ceil(width)}px`;
}
const selects = [...document.querySelectorAll('.package__select')];
for (const select of selects) select.addEventListener('change', () => fit(select));
// 字体加载完之前量的不准，加载完再量一遍
document.fonts?.ready.then(() => selects.forEach(fit));

// 按卡片当前选的版本和包管理器，换上对应的写法
function render(card) {
	const version = card.querySelector('.package__select')?.value;
	const manager = managerSelect?.value;
	const code = card.querySelector('.snippet code');
	const variant = [...card.querySelectorAll('.package__variant')].find(
		(t) => (!version || t.dataset.version === version) && (!t.dataset.manager || t.dataset.manager === manager)
	);
	if (variant && code) code.innerHTML = variant.innerHTML;
}

for (const card of document.querySelectorAll('.package')) {
	const select = card.querySelector('.package__select');
	if (!select) continue;
	const picker = card.querySelector('.package__picker');
	const fallback = card.querySelector('.package__release');
	const link = card.querySelector('.package__release-link');

	picker.hidden = false;
	link.hidden = false;
	fallback.hidden = true;
	fit(select);

	select.addEventListener('change', () => {
		render(card);
		const option = select.selectedOptions[0];
		link.href = option.dataset.release;
		// 「{version} 的发布页」按页面语言写在 data-label 上（见 build.mjs 的 renderPackage）
		link.setAttribute('aria-label', link.dataset.label.replace('{version}', select.value));
	});
}

if (managerSelect) {
	const applyManager = () => {
		const manager = managerSelect.value;
		for (const block of document.querySelectorAll('.detail__setup-variant')) {
			block.hidden = !block.dataset.managers.split(' ').includes(manager);
		}
		for (const card of document.querySelectorAll('.package')) render(card);
	};

	let saved = null;
	try {
		saved = localStorage.getItem(MANAGER_KEY);
	} catch {}
	if (saved && [...managerSelect.options].some((o) => o.value === saved)) {
		managerSelect.value = saved;
		applyManager();
	}

	managerSelect.closest('.detail__manager').hidden = false;
	fit(managerSelect);
	managerSelect.addEventListener('change', () => {
		applyManager();
		try {
			localStorage.setItem(MANAGER_KEY, managerSelect.value);
		} catch {}
	});
}
