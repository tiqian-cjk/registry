/* 草稿：用词待定稿。結構同 zh-Hans.mjs；頁尾那段照抄官網的 zh-Hant.ts */
export default {
	meta: {
		description: '提槧的套件儲存庫。',
		detailDescription: '在 {card} 中使用{product}。'
	},
	siteName: '提槧 Registry',
	tiqianHomeLabel: '提槧首頁',
	search: {
		label: '搜尋',
		results: '搜尋結果',
		noScript: '搜尋需要啟用 JavaScript。',
		packages: '套件',
		empty: '找不到「{query}」',
		failed: '搜尋暫時無法使用，請稍後再試。'
	},
	snippet: {
		terminal: '終端機',
		copy: '複製',
		copied: '已複製'
	},
	detail: {
		back: '返回首頁',
		version: '版本',
		source: '原始碼',
		license: '授權',
		setup: '設定儲存庫',
		packageManager: '套件管理器',
		packages: '套件',
		releasePage: '{version} 的發布頁面',
		versionsOf: '{name} 的版本'
	},
	setup: {
		copyToRoot: '將以下內容複製到您專案根目錄的 {file} 檔案，即可使用提槧 Registry 提供的套件。',
		copyTo: '將以下內容複製到您專案的 {file} 檔案，即可使用提槧 Registry 提供的套件。',
		runInTerminal: '在終端機中執行以下指令，即可使用提槧 Registry 提供的套件。',
		mirror: '您也可以使用我們發布在 {link} 上的版本。{note}',
		notes: {
			maven: '由於 Maven Central 的配額限制，我們只在上面發布穩定版本和較大的更新。',
			npm: '在絕大多數情況下，套件內容和更新速度與提槧 Registry 相同。'
		},
		asides: {
			cargo:
				'您也可以使用<a href="https://github.com/tiqian-cjk/tiqian-rs">提槧 Rust</a>，一個以 Rust 原生撰寫的版本，以獲得更好的效能與記憶體管理。其行為可能與提槧略有不同。'
		}
	},
	sections: {
		集成: '整合',
		组件: '元件',
		SSR: 'SSR',
		底层: '底層'
	},
	footer: {
		navigationLabel: '頁尾導覽',
		repositories: {
			title: '儲存庫',
			tiqian: '提槧',
			tiqianRust: '提槧 Rust',
			tiqianMarkdown: '提槧 Markdown',
			tiqianMath: '提槧 Math'
		},
		packages: {
			title: '發布',
			registry: '提槧 Registry'
		},
		language: {
			title: '語言'
		}
	}
};
