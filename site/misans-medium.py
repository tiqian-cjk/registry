"""
从 MiSans 可变字体切出 Medium（wght 380，MiSans VF 里 Medium 这个命名实例的位置），
只留用到 Medium 的那几处汉字：详情页大卡片右下角的小标题（版本、源码、协议）。站上的 MiSans 只有 Regular 和 Semibold。

    python3 -m pip install fonttools brotli
    python3 site/misans-medium.py ~/Library/Fonts/MiSansVF.ttf

这几处改字时要把 LABELS 一起改了重跑。
CSS 里单独叫 MiSans Medium，不并进 MiSans 字族：并进去当 500 字重的话，
MiSans 500 的字只会在这个子集里找，没有的字不会退回 Regular，而是直接跳到字体栈的下一个。
"""

import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

LABELS = '版本源码协议'
WEIGHT = 380

here = Path(__file__).resolve().parent
out_dir = here / 'assets' / 'fonts' / 'misans-medium'
file_name = 'misans-medium-labels.woff2'

font = TTFont(sys.argv[1])
chars = sorted(set(LABELS))
missing = [ch for ch in chars if ord(ch) not in font.getBestCmap()]
if missing:
	sys.exit(f'MiSans 里没有：{"".join(missing)}')

options = subset.Options()
options.layout_features = ['*']
options.hinting = False
options.notdef_outline = True
subsetter = subset.Subsetter(options)
subsetter.populate(unicodes=[ord(ch) for ch in chars])
subsetter.subset(font)

font = instancer.instantiateVariableFont(font, {'wght': WEIGHT}, overlap=instancer.OverlapMode.REMOVE)
font['OS/2'].usWeightClass = 500

out_dir.mkdir(parents=True, exist_ok=True)
font.flavor = 'woff2'
font.save(out_dir / file_name)

ranges = ', '.join(f'U+{ord(ch):04X}' for ch in chars)
(out_dir / 'misans-medium.css').write_text(
	f"""/* MiSans Medium（MiSans VF wght {WEIGHT}）的子集，只含：{''.join(chars)}。由 site/misans-medium.py 生成，别手改 */
@font-face {{
  font-family: 'MiSans Medium';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url(./{file_name}) format('woff2');
  unicode-range: {ranges};
}}
"""
)
print(f'{len(chars)} 个字：{"".join(chars)}')
