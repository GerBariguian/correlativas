"""Export the built demo as one offline HTML file; no third-party dependencies."""
from pathlib import Path
import base64
import hashlib
import re
import zipfile

root = Path(__file__).resolve().parents[2]
build = root / '.tools/mobile-demo-dist'
output = root / '.tools/mobile-demo-portable'
output.mkdir(parents=True, exist_ok=True)
html = (build / 'index.html').read_text()
script_match = re.search(r'<script\b[^>]*\bsrc="([^"]+)"[^>]*></script>', html)
style_match = re.search(r'<link\b[^>]*\bhref="([^"]+\.css)"[^>]*>', html)
if not script_match or not style_match:
    raise RuntimeError('Expected one compiled script and stylesheet; build the demo first.')
script_path = build / script_match[1].removeprefix('./')
script = script_path.read_text()
style = (build / style_match[1].removeprefix('./')).read_text()
for image in (build / 'assets').glob('*.png'):
    data_url = 'data:image/png;base64,' + base64.b64encode(image.read_bytes()).decode()
    expression = re.compile(r'new URL\(([`\'"])' + re.escape(image.name) + r'\1,import\.meta\.url\)\.href')
    script, count = expression.subn('"' + data_url + '"', script)
    if not count:
        raise RuntimeError(f'Could not embed {image.name}; refusing an incomplete offline export.')
script = script.replace('</script', r'<\/script')
if re.search(r'@import\s', style) or re.search(r'\bimport\s*\(', script):
    raise RuntimeError('Offline export must not load external styles or dynamic modules.')
digest = base64.b64encode(hashlib.sha256(script.encode()).digest()).decode()
html = html.replace(script_match[0], '<script type="module">' + script + '</script>')
html = html.replace(style_match[0], '<style>' + style + '</style>')
html = html.replace("script-src 'self'", "script-src 'sha256-" + digest + "'")
html = html.replace('img-src \'self\' data:', "img-src data:")
html = html.replace("default-src 'self'", "default-src 'none'")
name = 'Correlativas-demo.html'
(output / name).write_text(html)
readme = '''CORRELATIVAS — DEMO MOBILE

Abrí Correlativas-demo.html en Chrome, Edge o Firefox de una computadora.
No requiere instalación, servidor, login ni conexión a Internet.
Podés cambiar el tamaño de la ventana o usar la emulación de teléfono del navegador.
Todos los datos son ficticios. Los cambios se pierden al recargar.
Notas y promedio: propuesta visual; no implementa ni modifica el PR #4.
Los visores de archivos de algunos celulares no ejecutan JavaScript: en ese caso
usá un navegador de escritorio o una vista previa autenticada que sirva el build.
No se publicó el sitio ni se configuró ningún servicio externo.
'''
(output / 'LEEME.txt').write_text(readme)
archive = root / '.tools/correlativas-mobile-demo.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    z.write(output / name, name)
    z.writestr('LEEME.txt', readme)
print(f'Offline HTML: {output / name}')
print(f'ZIP: {archive}')
