/*
 * 源语言。其他语言的文案文件都按这里的结构来写（build.mjs 会检查缺了哪些键）。
 * {file}、{link} 这类是占位，build.mjs / 脚本里换成实际内容。
 * 结构和用词尽量同官网（tiqian-cjk/homepage 的 src/lib/messages/），页脚那段直接照抄。
 */
export default {
	meta: {
		description: '提椠的软件包仓库。'
	},
	siteName: '提椠 Registry',
	tiqianHomeLabel: '提椠首页',
	search: {
		label: '搜索',
		results: '搜索结果',
		noScript: '搜索需要开启 JavaScript。',
		packages: '包',
		empty: '没有找到「{query}」',
		failed: '搜索暂时用不了，请稍后再试。'
	},
	snippet: {
		terminal: '终端',
		copy: '复制',
		copied: '已复制'
	},
	detail: {
		back: '返回首页',
		version: '版本',
		source: '源码',
		license: '协议',
		setup: '配置仓库',
		packageManager: '包管理器',
		packages: '包',
		releasePage: '{version} 的发布页',
		versionsOf: '{name} 的版本'
	},
	setup: {
		copyToRoot: '复制以下内容到您项目根目录的 {file} 文件，以使用提椠 Registry 中提供的包。',
		copyTo: '复制以下内容到您项目的 {file} 文件，以使用提椠 Registry 中提供的包。',
		runInTerminal: '在终端中运行以下命令，以使用提椠 Registry 中提供的包。',
		/* {note} 是下面 notes 里的一句；中文两句之间不加空格 */
		mirror: '您也可以使用我们发布在 {link} 中的版本。{note}',
		notes: {
			maven: '由于 Maven Central 的配额限制，我们只在其中提供稳定和较大更新的版本。',
			npm: '在绝大多数情况下，包内容和更新速度与提椠 Registry 相同。'
		},
		/* 配置说明后面再加的一段（HTML，原样输出） */
		asides: {
			cargo:
				'您也可以使用<a href="https://github.com/tiqian-cjk/tiqian-rs">提椠 Rust</a>，一个原生使用 Rust 编写的版本，来获得更好的性能与内存管理。其行为可能与提椠有些许不同。'
		}
	},
	/* catalog.json 里的分区名（键是 catalog.json 里写的简体中文） */
	sections: {
		集成: '集成',
		组件: '组件',
		SSR: 'SSR',
		底层: '底层'
	},
	footer: {
		navigationLabel: '页脚导航',
		repositories: {
			title: '仓库',
			tiqian: '提椠',
			tiqianRust: '提椠 Rust',
			tiqianMarkdown: '提椠 Markdown',
			tiqianMath: '提椠 Math'
		},
		packages: {
			title: '发布',
			registry: '提椠 Registry'
		},
		language: {
			title: '语言'
		}
	}
};
