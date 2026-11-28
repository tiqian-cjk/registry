// 把提椠的网页组件（@tiqian/web-component）打包成几个静态文件，放到 /assets/tiqian/。
// 这个包的排版 worker 用 new Worker(new URL(..., import.meta.url)) 引入，浏览器不能直接加载，得经过打包。
//   npm ci --prefix site
//   site/node_modules/.bin/vite build --config site/vite.config.mjs --outDir <输出目录>/assets/tiqian
// 入口文件固定叫 tiqian.js（页面按这个名字加载，见 site/index.html），其余文件名带内容哈希

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	root: here,
	base: '/assets/tiqian/',
	publicDir: false,
	logLevel: 'warn',
	build: {
		emptyOutDir: true,
		assetsDir: '',
		// 提椠的排版引擎本身就有几百 KB，不必为此报警
		chunkSizeWarningLimit: 2000,
		rollupOptions: {
			input: path.join(here, 'tiqian.js'),
			output: {
				entryFileNames: 'tiqian.js',
				chunkFileNames: '[name]-[hash].js',
				assetFileNames: '[name]-[hash][extname]'
			}
		}
	},
	worker: {
		format: 'es',
		rollupOptions: {
			output: {
				entryFileNames: '[name]-[hash].js',
				chunkFileNames: '[name]-[hash].js'
			}
		}
	}
});
