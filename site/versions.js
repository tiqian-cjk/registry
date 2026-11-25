/*
 * 包卡片的版本切换：右上角的下拉选一个版本，下面代码框换成这个版本的写法，旁边的 ↗ 链到它的发布页。
 * 每个版本的写法由 build.mjs 预先生成在 <template class="package__variant"> 里。
 * 只换 <code> 里面的内容，不换 <code> 本身：复制按钮（snippet.js）拿的是这个元素，复制的就是当前版本。
 * 没有脚本时，下拉和 ↗ 都是 hidden，卡片上只显示最新版本号（链到它的发布页）。
 */

for (const card of document.querySelectorAll('.package')) {
	const select = card.querySelector('.package__select');
	if (!select) continue;
	const picker = card.querySelector('.package__picker');
	const fallback = card.querySelector('.package__release');
	const link = card.querySelector('.package__release-link');
	const code = card.querySelector('.snippet code');

	picker.hidden = false;
	link.hidden = false;
	fallback.hidden = true;

	select.addEventListener('change', () => {
		const version = select.value;
		const variant = [...card.querySelectorAll('.package__variant')].find((t) => t.dataset.version === version);
		if (variant && code) code.innerHTML = variant.innerHTML;
		const option = select.selectedOptions[0];
		link.href = option.dataset.release;
		link.setAttribute('aria-label', `${version} 的发布页`);
	});
}
