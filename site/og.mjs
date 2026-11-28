// 分享预览图（Open Graph）：先拼成 SVG，再由 build.mjs 转成 PNG。两张都照设计稿：
// - 首页：页面底色上铺一片首页卡片（上边、左边超出画面裁掉）
// - 详情页：那张卡片的大卡片（左、上超出画面），左下大标题和色块渐变，右下版本、源码、协议
// 底下一排两张一样：左下 POWERED BY BORING PLATFORM，右下大号标志。
// 尺寸 1280 × 640（2 : 1，各平台的大图预览都能用）

import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

export const OG_WIDTH = 1280;
export const OG_HEIGHT = 640;

// 卡片的排布（设计稿：两行三列，最左一列和最上一行有一半在画面外）。手调改这里
// 卡片之间横竖同一个间距
const CARD = { width: 509, height: 268, gap: 48 };
// 卡片里的字照首页卡片（style.css 的 .card、.card__title、.card__version）按卡片高度等比放大：
// 首页卡片高 128px，这里 268px，约 2.1 倍。内边距上下 12、左右 16，标题 24px / 400 / 字距 -0.05em / 行高 1.1，
// 版本号 12px / 500 / 行高 1.3、和标题隔 2px。内边距不跟着放大那么多（放大 1.5 倍），字离卡片边近一点
const CARD_SCALE = CARD.height / 128;
// 圆角也按同样的倍数放大（首页卡片 16px）
CARD.radius = 16 * CARD_SCALE;
const CARD_TEXT = {
	padX: 16 * 1.5,
	padBottom: 12 * 1.5,
	title: { size: 24 * CARD_SCALE, weight: 400, lineHeight: 1.1, tracking: -0.05 },
	version: { size: 12 * CARD_SCALE, weight: 500, lineHeight: 1.3, gap: 2 * CARD_SCALE }
};
// 最右一列的右边对齐 x = 1196（右下标志「Registry」的右缘也对这里），往左每列隔一个卡宽加间距
const COLUMNS = [2, 1, 0].map((n) => 1196 - CARD.width - n * (CARD.width + CARD.gap));
// 第一排的底边放在 102：画面上边切掉第一排大标题的上面一小截，版本号完整；第二排跟在下面。手调改这里
const FIRST_ROW_BOTTOM = 102;
const ROWS = [FIRST_ROW_BOTTOM - CARD.height, FIRST_ROW_BOTTOM + CARD.gap];

// 卡片上的灰字，同页面上的 .blend / .card__version：底下一份黑字叠加（overlay），让字带上卡片底色和色块的颜色；
// 上面一份黑字 10% 正常。element 是一个不带 fill 的 SVG 元素（<text …>…</text> 或 <path …/>），渲染两份
const blend = (element) => [
	element.replace(/^<(\w+)/, '<$1 fill="#000" style="mix-blend-mode:overlay"'),
	element.replace(/^<(\w+)/, '<$1 fill="#000" fill-opacity="0.1"')
].join('');

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// 一张 SVG 的图形部分（去掉外壳、注释、写死的颜色），由外层统一上色
const artwork = (file) =>
	fs
		.readFileSync(file, 'utf8')
		.replace(/<\?xml[^>]*>/g, '')
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<defs>[\s\S]*?<\/defs>/g, '')
		.replace(/^[\s\S]*?<svg[^>]*>/, '')
		.replace(/<\/svg>\s*$/, '')
		.replace(/ (fill|class)="[^"]*"/g, '')
		.trim();

// cards：[{ title, version, bg }]，按 ROWS × COLUMNS 的顺序填（先上一行、从左到右）
// assets：site/assets 目录；fontFamily：卡片标题和版本号用的等宽字体
// logo：{ mark, word, wordRight }，标志（含字）和「Registry」两张 SVG，wordRight 是「Registry」右缘在画布上的 x
// fontFace：可选的 @font-face 规则（在浏览器里直接看 SVG 时用；转 PNG 时字体由 renderPng 加载）
export function homeImageSvg({ cards, assets, fontFamily, logo, fontFace = '' }) {
	const out = [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">`,
		fontFace ? `<style>${fontFace}</style>` : '',
		// 底色同页面（style.css 的 --color-bg）
		`<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="#f3f2f0"/>`
	];
	let i = 0;
	for (const y of ROWS) {
		for (const x of COLUMNS) {
			const card = cards[i++ % cards.length];
			const { padX, padBottom, title, version } = CARD_TEXT;
			const left = x + padX;
			// 按行框排：版本号的行框贴着下内边距，标题的行框在它上面隔 gap；基线取行框里字身居中的位置
			// （等宽字体上伸 1.02em、下伸 0.3em，同 style.css 里版本号基线的算法）
			const baseline = (boxBottom, size, lineHeight) => boxBottom - (size * lineHeight - size * 1.32) / 2 - size * 0.3;
			const versionBox = y + CARD.height - padBottom;
			const titleBox = versionBox - version.size * version.lineHeight - version.gap;
			out.push(
				`<rect x="${x}" y="${y}" width="${CARD.width}" height="${CARD.height}" rx="${CARD.radius.toFixed(1)}" fill="${card.bg}"/>`,
				`<text x="${left.toFixed(1)}" y="${baseline(titleBox, title.size, title.lineHeight).toFixed(1)}" font-family="${fontFamily}" font-size="${title.size.toFixed(2)}" font-weight="${title.weight}" letter-spacing="${(title.size * title.tracking).toFixed(2)}" fill="#1c1c1c">${escape(card.title)}</text>`,
				blend(`<text x="${left.toFixed(1)}" y="${baseline(versionBox, version.size, version.lineHeight).toFixed(1)}" font-family="${fontFamily}" font-size="${version.size.toFixed(2)}" font-weight="${version.weight}">${escape(card.version)}</text>`)
			);
		}
	}
	out.push(...footerRow(assets, logo), '</svg>');
	return out.join('\n');
}

// 底下一排（两张图共用）
function footerRow(assets, logo) {
	// 右下：页眉那个标志原尺寸（画布 116 高）。标志和「提椠」实色，「Registry」六成灰（同页眉）
	const logoX = RIGHT - logo.wordRight; // 「Registry」右缘对齐卡片的右缘
	// 左下：POWERED BY BORING PLATFORM（画布 280 × 56），淡灰
	const poweredScale = 222 / 280;
	return [
		`<g transform="translate(${logoX.toFixed(2)} 477)">`,
		`<g fill="#14120d">${artwork(path.join(assets, logo.mark))}</g>`,
		`<g fill="#14120d" fill-opacity="0.6">${artwork(path.join(assets, logo.word))}</g>`,
		`</g>`,
		`<g transform="translate(68 538) scale(${poweredScale.toFixed(4)})" fill="#14120d" fill-opacity="0.22">${artwork(path.join(assets, 'powered-by-boring-platform.svg'))}</g>`
	];
}

// ---------- 详情页 ----------

// 大卡片照详情页的 .detail__hero 按 HERO_SCALE 倍放大：内边距、圆角、色块的轨道和模糊都乘这个数；
// 卡片里的字（字号和字之间的间距）单独按 HERO_TEXT_SCALE 放大，缩略图里看得清。手调改这里
const HERO_SCALE = 2.2;
const HERO_TEXT_SCALE = 2.7;
// 大卡片在画面上：左边、上边超出画面（只露右下角的圆角），右边对齐 RIGHT，底边在 HERO_BOTTOM
const HERO_BOTTOM = 428;
const RIGHT = 1196;

// 字在 SVG 里的墨迹宽度（resvg 量）：右下那几行要按最宽的值右对齐
function inkWidth(text, { family, weight, size, tracking = 0 }, fontFiles) {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="200"><text x="0" y="100" font-family="${family}" font-weight="${weight}" font-size="${size}" letter-spacing="${tracking}">${escape(text)}</text></svg>`;
	const box = new Resvg(svg, { font: { fontFiles, loadSystemFonts: false } }).getBBox();
	return box ? box.x + box.width : 0;
}

// 行框里的基线：字身居中（上伸 1.02em、下伸 0.3em 的近似，同 homeImageSvg）
const baselineIn = (boxBottom, size, lineHeight) => boxBottom - (size * lineHeight - size * 1.32) / 2 - size * 0.3;

// card：{ group, title, bg, blobs: [三个色块颜色] }；facts：[{ label, value, kind: 'version' | 'link' | 'text' }]；
// labelStyle：右下小标题的字（中文用 MiSans，英文用 Inter 全大写）
export function detailImageSvg({ card, facts, labelStyle, assets, logo, fontFiles, arrowPath }) {
	const S = HERO_SCALE;
	const T = HERO_TEXT_SCALE;
	const out = [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">`,
		`<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="#f3f2f0"/>`
	];

	// 卡片：左、上各多画出 40px 到画面外，只露出右下角的圆角（页面上 16px，同样乘 HERO_SCALE）
	const cardShape = `<rect x="-40" y="-40" width="${RIGHT + 40}" height="${HERO_BOTTOM + 40}" rx="${(16 * S).toFixed(1)}"/>`;

	// 色块：同 style.css 的 .detail__hero .card__blobs —— 三块方形色块的中心在一个椭圆上
	// （中心离卡片左边 120、在底边下面 80，横半径 160、纵半径 24，边长 300），彼此错开 183°、303°、63°，
	// 整层模糊 64px，再用从左下角往右上的透明度渐变（550 × 300 的椭圆，平滑曲线）淡出。都乘 HERO_SCALE
	const cx = 120 * S;
	const cy = HERO_BOTTOM + 80 * S;
	const rx = 160 * S;
	const ry = 24 * S;
	const size = 300 * S;
	const phases = [183, 303, 63];
	const squares = phases.map((phase, i) => {
		const angle = (phase * Math.PI) / 180;
		const x = cx + rx * Math.cos(angle);
		const y = cy + ry * Math.sin(angle);
		return `<rect x="${(x - size / 2).toFixed(1)}" y="${(y - size / 2).toFixed(1)}" width="${size}" height="${size}" fill="${card.blobs[i]}" transform="rotate(${-phase} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
	});
	const fadeStops = [1, 0.972, 0.896, 0.784, 0.648, 0.5, 0.352, 0.216, 0.104, 0.028, 0]
		.map((a, i) => `<stop offset="${i * 10}%" stop-color="#fff" stop-opacity="${a}"/>`)
		.join('');
	out.push(
		'<defs>',
		`<clipPath id="card">${cardShape}</clipPath>`,
		`<filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${64 * S}"/></filter>`,
		`<radialGradient id="fade" gradientUnits="userSpaceOnUse" cx="0" cy="${HERO_BOTTOM}" r="${550 * S}" gradientTransform="translate(0 ${HERO_BOTTOM}) scale(1 ${(300 / 550).toFixed(4)}) translate(0 ${-HERO_BOTTOM})">${fadeStops}</radialGradient>`,
		`<mask id="fade-mask" maskUnits="userSpaceOnUse" x="-40" y="-40" width="${RIGHT + 40}" height="${HERO_BOTTOM + 40}"><rect x="-40" y="-40" width="${RIGHT + 40}" height="${HERO_BOTTOM + 40}" fill="url(#fade)"/></mask>`,
		'</defs>',
		cardShape.replace('/>', ` fill="${card.bg}"/>`),
		`<g clip-path="url(#card)"><g mask="url(#fade-mask)"><g filter="url(#blur)">${squares.join('')}</g></g></g>`
	);

	// 左下：组名和大标题。大标题（.detail__title：40px、400、字距 -0.05em、行高 1.1）贴着下内边距（12）、左内边距（16）；
	// 组名（.detail__group：Roboto Flex 窄体粗体 16px、行高 1.2，灰）在它上面，隔 2px
	const pad = { x: 16 * S, bottom: 12 * S };
	const titleSize = 40 * T;
	const titleBox = HERO_BOTTOM - pad.bottom;
	const groupSize = 16 * T;
	const groupBox = titleBox - titleSize * 1.1 - 2 * T;
	out.push(
		blend(`<text x="${pad.x.toFixed(1)}" y="${baselineIn(groupBox, groupSize, 1.2).toFixed(1)}" font-family="Roboto Flex" font-size="${groupSize.toFixed(1)}">${escape(card.group)}</text>`),
		`<text x="${pad.x.toFixed(1)}" y="${baselineIn(titleBox, titleSize, 1.1).toFixed(1)}" font-family="JetBrains Mono" font-size="${titleSize.toFixed(1)}" letter-spacing="${(-0.05 * titleSize).toFixed(2)}" fill="#1c1c1c">${escape(card.title)}</text>`
	);

	// 右下：版本、源码、协议（按 facts 的顺序；字照 .detail__facts：13px、500、行距 2px，标题一栏右对齐、和值隔 8px，
	// 行高比页面上的 1.6 收紧）。最后一行贴着下内边距，最后一个字离卡片右边是左右内边距。手调改这里
	const factSize = 13 * T;
	const factLineHeight = 1.3;
	const rowHeight = factSize * factLineHeight;
	const rowGap = 2 * T;
	const columnGap = 8 * T;
	const iconSize = 14 * T;
	// 「GitHub」和 ↗ 之间的空隙（页面上图标前面有一个很窄的空）
	const iconGap = 2 * T;
	const valueStyle = (kind) =>
		kind === 'version'
			? { family: 'JetBrains Mono', weight: 600, size: factSize }
			: { family: 'Inter', weight: 500, size: factSize };
	const valueWidths = facts.map(({ value, kind }) => inkWidth(value, valueStyle(kind), fontFiles) + (kind === 'link' ? iconGap + iconSize : 0));
	const valueLeft = RIGHT - pad.x - Math.max(...valueWidths);
	const labelRight = valueLeft - columnGap;
	facts.forEach(({ label, value, kind }, i) => {
		const boxBottom = HERO_BOTTOM - pad.bottom - (facts.length - 1 - i) * (rowHeight + rowGap);
		const y = baselineIn(boxBottom, factSize, factLineHeight).toFixed(1);
		const style = valueStyle(kind);
		out.push(
			`<text x="${labelRight.toFixed(1)}" y="${y}" text-anchor="end" font-family="${labelStyle.family}" font-weight="${labelStyle.weight}" font-size="${labelStyle.size.toFixed(1)}" letter-spacing="${(labelStyle.tracking ?? 0).toFixed(2)}" fill="#1c1c1c">${escape(label)}</text>`,
			blend(`<text x="${valueLeft.toFixed(1)}" y="${y}" font-family="${style.family}" font-weight="${style.weight}" font-size="${style.size.toFixed(1)}">${escape(value)}</text>`)
		);
		if (kind === 'link') {
			// 值后面的 ↗（Material Symbols arrow_outward，画布 960，y 从 -960 到 0），和字的 x 高度居中
			const x = valueLeft + valueWidths[i] - iconSize;
			const top = Number(y) - factSize * 0.36 - iconSize / 2;
			out.push(
				blend(`<path d="${arrowPath}" transform="translate(${x.toFixed(1)} ${(top + iconSize).toFixed(1)}) scale(${(iconSize / 960).toFixed(5)})"/>`)
			);
		}
	});

	out.push(...footerRow(assets, logo), '</svg>');
	return out.join('\n');
}

// SVG 转 PNG（resvg）。字体只用传进来的这几个文件（不读系统字体，各台机器上出来的图一样）
export function renderPng(svg, fontFiles) {
	const resvg = new Resvg(svg, {
		fitTo: { mode: 'original' },
		font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'JetBrains Mono' }
	});
	return resvg.render().asPng();
}
