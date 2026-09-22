"""Adds translations to every ink/lang/<code>.js at once.

The input is a JSON file keyed by the Hebrew source text:
  {"strings": {"<hebrew>": {"en": "...", "ar": "...", ...}},
   "plurals": {"<hebrew with {n}>": {"en": {"one": "...", "other": "..."}, ...}}}
Existing keys are overwritten. Run:  python ink/tools/i18n_add.py new.json
"""
import io, json, os, sys

LANG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'lang')
add = json.load(io.open(sys.argv[1], encoding='utf-8'))
for name in sorted(os.listdir(LANG_DIR)):
    if not name.endswith('.js'): continue
    code, path = name[:-3], os.path.join(LANG_DIR, name)
    src = io.open(path, encoding='utf-8').read()
    head, body = src.split('window.INK_I18N = ', 1)
    data = json.loads(body.rstrip().rstrip(';'))
    n = 0
    for he, tr in add.get('strings', {}).items():
        if code in tr: data['strings'][he] = tr[code]; n += 1
    for he, tr in add.get('plurals', {}).items():
        if code in tr: data['plurals'][he] = tr[code]; n += 1
    io.open(path, 'w', encoding='utf-8', newline='\n').write(head + 'window.INK_I18N = ' + json.dumps(data, ensure_ascii=False, indent=0) + ';\n')
    print(name, '+', n)
