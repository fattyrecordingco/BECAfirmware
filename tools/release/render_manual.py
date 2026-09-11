"""Render the bundled offline manual using a build-time Markdown package."""
from pathlib import Path
import markdown

root = Path(__file__).resolve().parents[2]
source = (root / 'docs/user/BECA_MANUAL.md').read_text(encoding='utf-8')
body = markdown.markdown(source, extensions=['extra', 'toc'])
html = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BECA manual · 0.2.0</title><style>
:root{color-scheme:light}body{max-width:850px;margin:auto;padding:32px 24px 80px;background:#f6f4ef;color:#174d36;font:16px/1.7 system-ui,sans-serif}
h1,h2,h3{line-height:1.2;color:#008351}h1{font-size:42px}h2{margin-top:48px;border-top:1px solid #b9ccbc;padding-top:24px}
a{color:#00653d;text-underline-offset:3px}a:focus-visible{outline:3px solid #008351;outline-offset:3px}li{margin:10px 0}code{font-size:.9em;background:#e5eee6;padding:2px 4px;overflow-wrap:anywhere}
@media print{body{background:white;padding:0;font-size:11pt}h2,h3{break-after:avoid}a{color:inherit}h1{font-size:26pt}}
</style><main>''' + body + '</main></html>'
output = root / 'apps/beca-setup/ui/public/manual.html'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(html, encoding='utf-8')
(root / 'docs/user/BECA_MANUAL.html').write_text(html, encoding='utf-8')
print('Rendered app and standalone manual.')
