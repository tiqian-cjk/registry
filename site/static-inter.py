"""
从站点自带的 Inter Variable（拉丁字符那个文件）做一个 wght 400 的静态实例，
给提椠排的说明文字用：提椠的构建期预排（@tiqian/precompute）不支持可变字体。

    python3 -m pip install fonttools brotli
    python3 site/static-inter.py

Inter Variable 的默认字重就是 400，所以这里只是去掉可变数据，字形和页面上 400 的 Inter 一样。
Inter 按 SIL OFL 1.1 授权，没有保留字体名；CSS 里叫 Inter Static，免得和本机装的 Inter 混在一起。
"""

import re
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

here = Path(__file__).resolve().parent
source_dir = here / 'assets' / 'fonts' / 'inter'
out_dir = here / 'assets' / 'fonts' / 'inter-static'
file_name = 'inter-latin-400.woff2'

# 和 inter.css 里拉丁字符那个文件的范围一致
css = (source_dir / 'inter.css').read_text()
match = re.search(r'inter-latin-wght-normal\.woff2[^}]*unicode-range:\s*([^;]+);', css)
if not match:
	raise SystemExit('inter.css 里找不到 inter-latin-wght-normal.woff2 的 unicode-range')
unicode_range = match.group(1).strip()

font = TTFont(source_dir / 'files' / 'inter-latin-wght-normal.woff2')
font = instancer.instantiateVariableFont(font, {'wght': 400})

out_dir.mkdir(parents=True, exist_ok=True)
font.flavor = 'woff2'
font.save(out_dir / file_name)
(out_dir / 'LICENSE').write_text((source_dir / 'LICENSE').read_text())
(out_dir / 'inter-static.css').write_text(
	f"""/* Inter wght 400 的静态实例（拉丁字符），给提椠排的说明文字用。由 site/static-inter.py 生成，别手改 */
@font-face {{
  font-family: 'Inter Static';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(./{file_name}) format('woff2');
  unicode-range: {unicode_range};
}}
"""
)
print(f'写好了 {out_dir / file_name}')
