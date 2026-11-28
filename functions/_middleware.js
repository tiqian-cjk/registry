/*
 * Cloudflare Pages Functions 中间件：打开站点页面时按语言跳到对应的版本。
 *
 *   1. 用户在页脚选过语言（cookie tiqian-registry-lang，见 site/footer.js），就按它来；
 *   2. 没选过，就按浏览器的 Accept-Language：繁体（zh-Hant、zh-TW、zh-HK、zh-MO）→ /zh-Hant/，
 *      其他中文 → 简体（根路径），英文和其他语言 → /en/；
 *   3. 都没有（比如搜索引擎的爬虫一般不带 Accept-Language）就不跳，原样返回。
 *
 * 爬虫和链接预览机器人一律不跳：Telegram 的预览爬虫带着 Accept-Language: en，
 * 不排除的话，别人分享简体页面，预览出来的却是英文版。按 User-Agent 认（见 BOT_PATTERN）。
 *
 * 只管站点的页面（GET、返回 HTML 的那些）：npm、Maven、Cargo 这些仓库接口返回的不是 HTML，原样放过。
 * 语言和路径的规则同 site/i18n.mjs：简体在根路径，其余加一级前缀。改那边时这里要一起改。
 */

const LOCALES = ['zh-Hans', 'zh-Hant', 'en'];
const DEFAULT_LOCALE = 'zh-Hans';
const COOKIE = 'tiqian-registry-lang';

// 常见的爬虫和链接预览机器人（Telegram、X、Facebook、Slack、Discord、WhatsApp、LinkedIn、各家搜索引擎……），
// 加上名字里带 bot、crawler、spider、preview 的
const BOT_PATTERN =
	/bot\b|bot\/|crawler|spider|preview|facebookexternalhit|whatsapp|slack|discord|telegram|twitter|linkedin|embedly|vkshare|skype|line\//i;

// 路径属于哪种语言，去掉语言前缀后的路径是什么（/zh-Hant/platform/web/ → zh-Hant、/platform/web/）
function splitLocale(pathname) {
	const [, first, ...rest] = pathname.split('/');
	if (first && first !== DEFAULT_LOCALE && LOCALES.includes(first)) return { locale: first, path: `/${rest.join('/')}` };
	return { locale: DEFAULT_LOCALE, path: pathname };
}

function localizePath(locale, path) {
	return locale === DEFAULT_LOCALE ? path : `/${locale}${path}`;
}

// 一个语言标签对应站点的哪种语言；对不上的（日文、法文……）返回 null，由调用方决定
function localeForTag(tag) {
	const lower = tag.toLowerCase();
	if (lower === 'zh' || lower.startsWith('zh-')) {
		return /^zh-(hant|tw|hk|mo)\b/.test(lower) ? 'zh-Hant' : 'zh-Hans';
	}
	if (lower === 'en' || lower.startsWith('en-')) return 'en';
	return null;
}

// 按 Accept-Language 的权重挑：先对得上中文、英文的那个；都对不上（只写了别的语言）就用英文
function localeFromAcceptLanguage(header) {
	if (!header) return null;
	const tags = header
		.split(',')
		.map((part) => {
			const [tag, ...params] = part.trim().split(';');
			const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
			return { tag: tag.trim(), q: q ? Number(q.slice(2)) : 1 };
		})
		.filter(({ tag, q }) => tag && tag !== '*' && q > 0)
		.sort((a, b) => b.q - a.q);
	if (!tags.length) return null;
	for (const { tag } of tags) {
		const locale = localeForTag(tag);
		if (locale) return locale;
	}
	return 'en';
}

function localeFromCookie(header) {
	if (!header) return null;
	for (const part of header.split(';')) {
		const [name, value] = part.trim().split('=');
		if (name === COOKIE && LOCALES.includes(value)) return value;
	}
	return null;
}

export async function onRequest(context) {
	const { request, next } = context;
	if (request.method !== 'GET') return next();
	if (BOT_PATTERN.test(request.headers.get('user-agent') ?? '')) return next();

	const response = await next();
	if (!(response.headers.get('content-type') ?? '').includes('text/html')) return response;

	const url = new URL(request.url);
	const preferred =
		localeFromCookie(request.headers.get('cookie')) ?? localeFromAcceptLanguage(request.headers.get('accept-language'));
	const { locale, path } = splitLocale(url.pathname);
	if (!preferred || preferred === locale) {
		// 同一个地址按请求头可能跳、可能不跳，告诉缓存别混用
		const varied = new Response(response.body, response);
		varied.headers.append('Vary', 'Accept-Language, Cookie');
		return varied;
	}

	url.pathname = localizePath(preferred, path);
	return new Response(null, {
		status: 302,
		headers: { Location: url.toString(), 'Cache-Control': 'private, no-store', Vary: 'Accept-Language, Cookie' }
	});
}
