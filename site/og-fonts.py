"""
给分享预览图（og.mjs）切静态 TTF：resvg 不认 woff2 和可变字体。都从站上已有的字体切，放在 site/og-fonts/
（构建时读，不发布到网站上）：

- JetBrains Mono（拉丁）400、500、600：卡片标题、版本号，详情页大卡片的版本号用 600（同 style.css 的 .detail__facts-version）
- Inter（拉丁）500：详情页大卡片右下的「GitHub」「MPL-2.0」和英文的 VERSION、SOURCE、LICENSE
- MiSans Medium：同一行的「版本、源码、协议」等汉字（站上那份子集本来就是静态的，只是换成 TTF）
- Roboto Flex（拉丁，wdth 80、wght 700）：详情页大卡片的组名（ENGINE、PLATFORM……）。站上那份文件名写着 wdth80-wght700，
  其实还是可变字体（页面上靠 font-stretch、font-weight 选），这里切成 wdth 80、wght 700 的静态实例

    python3 -m pip install fonttools brotli
    python3 site/og-fonts.py

JetBrains Mono、Inter、Roboto Flex 按 SIL OFL 1.1 授权（许可证复制在 og-fonts/LICENSE-*），字体名未改；
MiSans 按小米的许可协议（见 assets/fonts/misans/README.md）。
"""

from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

here = Path(__file__).resolve().parent
fonts = here / 'assets' / 'fonts'
out_dir = here / 'og-fonts'
out_dir.mkdir(exist_ok=True)

STYLE_NAMES = {400: 'Regular', 500: 'Medium', 600: 'SemiBold'}


def rename(font, family, weight):
	# 同一字族的几个字重统一叫一个名字，og.mjs 里按 font-weight 选
	style = STYLE_NAMES[weight]
	name = font['name']
	for name_id, value in ((1, family), (2, 'Regular'), (16, family), (17, style), (4, f'{family} {style}')):
		name.setName(value, name_id, 3, 1, 0x409)


def static(source, family, weight, out_name):
	font = instancer.instantiateVariableFont(TTFont(source), {'wght': weight})
	font['OS/2'].usWeightClass = weight
	rename(font, family, weight)
	font.flavor = None
	font.save(out_dir / out_name)
	print(out_name)


for weight in (400, 500, 600):
	static(fonts / 'jetbrains-mono' / 'files' / 'jetbrains-mono-latin-wght-normal.woff2', 'JetBrains Mono', weight, f'jetbrains-mono-latin-{weight}.ttf')

static(fonts / 'inter' / 'files' / 'inter-latin-wght-normal.woff2', 'Inter', 500, 'inter-latin-500.ttf')

misans = TTFont(fonts / 'misans-medium' / 'misans-medium-labels.woff2')
misans.flavor = None
misans.save(out_dir / 'misans-medium-labels.ttf')
print('misans-medium-labels.ttf')

roboto = instancer.instantiateVariableFont(TTFont(fonts / 'roboto-flex' / 'roboto-flex-latin-wdth80-wght700.woff2'), {'wght': 700, 'wdth': 80})
roboto['OS/2'].usWeightClass = 400  # og.mjs 里不写字重，按默认的 400 选到这唯一一个
roboto.flavor = None
roboto.save(out_dir / 'roboto-flex-latin-wdth80-wght700.ttf')
print('roboto-flex-latin-wdth80-wght700.ttf')
