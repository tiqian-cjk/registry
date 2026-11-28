/*
 * 页眉、页脚的提椠标志：鼠标移上去时点头、眨一下左眼，播一轮就停（一轮多长见 build.mjs 的 LOGO_DURATION）
 * （动画在 site/logo-nod-wink.svg，build.mjs 把它内联成 .logo-mark，begin="indefinite"、只播一轮）。
 * 正在播的时候再移上去不重新开始，免得半途跳回开头；播完以后再移上去才会再播。
 * 系统设置了「减少动态效果」就不播。
 */

if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
	for (const svg of document.querySelectorAll('.logo-mark')) {
		const trigger = svg.closest('a') ?? svg;
		const animations = [...svg.querySelectorAll('animate, animateTransform')];
		const duration = Number(svg.dataset.duration) * 1000;
		let playing = false;

		trigger.addEventListener('pointerenter', () => {
			if (playing) return;
			playing = true;
			for (const animation of animations) animation.beginElement();
			setTimeout(() => {
				playing = false;
			}, duration);
		});
	}
}
