/*
 * 多语言，同官网（tiqian-cjk/homepage 的 src/lib/i18n.ts）：简体中文是源语言，放在根路径；
 * 其余语言加一级 BCP 47 标签前缀，如 /en/platform/web/、/zh-Hant/platform/web/。/zh-Hans/... 不存在，免得同一页有两个地址。
 * 界面文案在 site/messages/ 下，每种语言一个文件，结构以 zh-Hans.mjs 为准。
 */
import zhHans from './messages/zh-Hans.mjs';
import zhHant from './messages/zh-Hant.mjs';
import en from './messages/en.mjs';

export const locales = ['zh-Hans', 'zh-Hant', 'en'];
export const defaultLocale = 'zh-Hans';

/* 语言切换处用各语言自己的名称 */
export const localeNames = {
	'zh-Hans': '简体中文',
	'zh-Hant': '繁體中文',
	en: 'English'
};

export const messages = { 'zh-Hans': zhHans, 'zh-Hant': zhHant, en };

/* 不带语言前缀的站内路径（以 / 开头）→ 该语言下的路径 */
export function localizePath(locale, path) {
	if (locale === defaultLocale) return path;
	return path === '/' ? `/${locale}/` : `/${locale}${path}`;
}

/* 文案里的 {名字} 换成 values 里对应的值（值原样放进去，要转义的先转义好） */
export function format(template, values) {
	return template.replace(/\{(\w+)\}/g, (match, name) => (name in values ? values[name] : match));
}

/* 其他语言的文案和源语言比，缺了哪些键（返回 'detail.setup' 这样的路径） */
export function missingKeys(source, target, prefix = '') {
	const missing = [];
	for (const [key, value] of Object.entries(source)) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (!(key in Object(target))) missing.push(path);
		else if (value && typeof value === 'object') missing.push(...missingKeys(value, target[key], path));
	}
	return missing;
}
