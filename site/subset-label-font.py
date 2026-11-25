"""
从文渊黑体（WenYuan Sans SC Flex VF）切出小标题用的中文字体：
宽度 87.5（wdth 87.5）、SemiBold（wght 600），只留 catalog.json 标题和 build.mjs 里写死的小标题用到的汉字。

    python3 -m pip install fonttools brotli uharfbuzz skia-pathops
    python3 site/subset-label-font.py ~/Library/Fonts/WenYuanSansSCFlexVF.otf

catalog.json 里新增中文标题后要重跑一次；build.mjs 发现缺字会提示。
字体按 SIL OFL 1.1 授权，'WenYuan Sans'、'文渊黑体' 是保留字体名，
修改过的版本不能用这个名字，所以子集改名为 Registry Label SC。
"""

import json
import sys
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.ttLib import TTFont
import pathops
import uharfbuzz as hb

here = Path(__file__).resolve().parent
out_dir = here / 'assets' / 'fonts' / 'registry-label-sc'
family = 'Registry Label SC'
postscript = 'RegistryLabelSC-SemiBold'
weight = 600
width_percent = 87.5
file_name = 'registry-label-sc-wdth87.5-wght600.woff2'

# build.mjs 里写死的小标题
fixed_labels = ['配置仓库', '包']


def titles(node):
	if isinstance(node, dict):
		for key, value in node.items():
			if key == 'title' and isinstance(value, str):
				yield value
			else:
				yield from titles(value)
	elif isinstance(node, list):
		for item in node:
			yield from titles(item)


def is_cjk(ch):
	return ord(ch) >= 0x2E80


catalog = json.loads((here.parent / 'catalog.json').read_text())
text = ''.join([*titles(catalog), *fixed_labels])
chars = sorted({ch for ch in text if is_cjk(ch)})
if not chars:
	sys.exit('没有找到需要的汉字')

source = TTFont(sys.argv[1])
copyright_notice = source['name'].getDebugName(0)
license_text = source['name'].getDebugName(13)
license_url = source['name'].getDebugName(14)

# 用 HarfBuzz 按 width_percent、weight 取每个字的轮廓，另建一个静态字体。
# 不用 fontTools 算插值（instancer 或 getGlyphSet）：它算这个字体的 CFF2 时，
# 「配」「置」这类笔画密的字会算错，笔画之间的空白被填实或镂空成条纹
hb_font = hb.Font(hb.Face(hb.Blob.from_file_path(sys.argv[1])))
hb_font.set_variations({'wdth': width_percent, 'wght': weight})
glyph_ids = {name: index for index, name in enumerate(source.getGlyphOrder())}
cmap = source.getBestCmap()

glyph_order = ['.notdef']
char_strings = {}
metrics = {}

notdef = source['hmtx']['.notdef'][0]
pen = T2CharStringPen(notdef, None)
char_strings['.notdef'] = pen.getCharString()
metrics['.notdef'] = (notdef, 0)

for ch in chars:
	source_name = cmap.get(ord(ch))
	if source_name is None:
		sys.exit(f'文渊黑体里没有「{ch}」')
	name = f'uni{ord(ch):04X}'
	glyph_id = glyph_ids[source_name]
	width = hb_font.get_glyph_h_advance(glyph_id)
	# 原字体的笔画是互相重叠的轮廓；不合并的话，浏览器渲染这个静态 CFF 时重叠处会镂空
	path = pathops.Path()
	hb_font.draw_glyph_with_pen(glyph_id, pathops.PathPen(path))
	path.simplify(fix_winding=True)
	pen = T2CharStringPen(width, None)
	path.draw(pen)
	char_strings[name] = pen.getCharString()
	bounds = BoundsPen(None)
	path.draw(bounds)
	metrics[name] = (width, round(bounds.bounds[0]) if bounds.bounds else 0)
	glyph_order.append(name)

builder = FontBuilder(source['head'].unitsPerEm, isTTF=False)
builder.setupGlyphOrder(glyph_order)
builder.setupCharacterMap({ord(ch): f'uni{ord(ch):04X}' for ch in chars})
builder.setupCFF(postscript, {'FullName': f'{family} SemiBold', 'FamilyName': family, 'Weight': 'SemiBold'}, char_strings, {})
builder.setupHorizontalMetrics(metrics)
hhea = source['hhea']
builder.setupHorizontalHeader(ascent=hhea.ascent, descent=hhea.descent, lineGap=hhea.lineGap)
os2 = source['OS/2']
builder.setupOS2(
	usWeightClass=weight,
	usWidthClass=4,
	fsSelection=0,
	sTypoAscender=os2.sTypoAscender,
	sTypoDescender=os2.sTypoDescender,
	sTypoLineGap=os2.sTypoLineGap,
	usWinAscent=os2.usWinAscent,
	usWinDescent=os2.usWinDescent,
	ulCodePageRange1=os2.ulCodePageRange1,
	ulUnicodeRange2=os2.ulUnicodeRange2,
)
builder.setupNameTable(
	{
		'copyright': copyright_notice,
		'familyName': family,
		'styleName': 'SemiBold',
		'uniqueFontIdentifier': f'{postscript};subset of WenYuan Sans SC Flex VF 1.010',
		'fullName': f'{family} SemiBold',
		'version': 'Version 1.010',
		'psName': postscript,
		'licenseDescription': license_text,
		'licenseInfoURL': license_url,
	}
)
builder.setupPost()
if 'ltag' in builder.font:
	del builder.font['ltag']

out_dir.mkdir(parents=True, exist_ok=True)
builder.font.flavor = 'woff2'
builder.save(out_dir / file_name)

ofl = (here / 'assets' / 'fonts' / 'roboto-flex' / 'OFL.txt').read_text().split('\n', 1)[1]
(out_dir / 'OFL.txt').write_text(copyright_notice + '\n' + ofl)

ranges = ', '.join(f'U+{ord(ch):04X}' for ch in chars)
(out_dir / 'registry-label-sc.css').write_text(
	f"""/* 文渊黑体（WenYuan Sans SC）宽度 {width_percent}、SemiBold 的子集，只含小标题用到的汉字：{''.join(chars)} */
/* 由 site/subset-label-font.py 生成，别手改。SIL OFL 1.1，保留字体名不能用于修改版，所以改名 */
@font-face {{
  font-family: '{family}';
  font-style: normal;
  font-weight: {weight};
  font-stretch: {width_percent}%;
  font-display: swap;
  src: url(./{file_name}) format('woff2');
  unicode-range: {ranges};
}}
"""
)
print(f'{len(chars)} 个字：{"".join(chars)}')
