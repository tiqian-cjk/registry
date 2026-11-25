/*
 * 代码块的复制按钮：复制 <code> 的文本（行号是样式画的，不在文本里），
 * 成功后图标换成对勾，1.5 秒后换回来。按钮在 HTML 里是 hidden，有脚本才显示。
 */

for (const button of document.querySelectorAll('.snippet__copy')) {
	const code = button.closest('.snippet')?.querySelector('code');
	if (!code || !navigator.clipboard) continue;
	button.hidden = false;

	let timer;
	button.addEventListener('click', async () => {
		try {
			await navigator.clipboard.writeText(code.textContent);
		} catch {
			return;
		}
		button.classList.add('is-copied');
		button.setAttribute('aria-label', '已复制');
		clearTimeout(timer);
		timer = setTimeout(() => {
			button.classList.remove('is-copied');
			button.setAttribute('aria-label', '复制');
		}, 1500);
	});
}
