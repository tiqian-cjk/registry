/*
 * 详情页左上角的返回箭头：从首页点进来的，就用浏览器的「后退」回去，首页停在点进来之前的位置。
 * 直接打开、从外面链进来的，没有可退的首页，照旧按链接跳到 /#group-<组>（滚到这张卡所在的分组）。
 */

const back = document.querySelector('.detail__back');
const fromHome = (() => {
	try {
		const referrer = new URL(document.referrer);
		return referrer.origin === location.origin && referrer.pathname === '/';
	} catch {
		return false;
	}
})();

if (back && fromHome && history.length > 1) {
	back.addEventListener('click', (event) => {
		// 新标签页打开之类的，交给浏览器照常处理
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		history.back();
	});
}
