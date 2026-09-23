"""Which interface texts are missing from (or no longer used in) the translations in ink/lang/*.js.

The app's text is Hebrew, written in ink/index.html as T('...'), TN('... {n} ...', n) or N_('...'),
plus the fixed text in the page's HTML. Every lang/<code>.js maps that Hebrew text to its translation,
so a new text needs its Hebrew -> translation pair added to each of them.
Run from anywhere:  python ink/tools/i18n_check.py
"""
import io, json, os, re
from html.parser import HTMLParser

INK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HEB = re.compile('[' + chr(0x590) + '-' + chr(0x5FF) + ']')
BS = chr(92)
REGEX_PREV = set('(,=:[!&|?{};+-*%<>~^')
KEYWORDS = {'return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw'}


def skip_str(js, i, q):
    j = i + 1
    while j < len(js):
        if js[j] == BS: j += 2; continue
        if js[j] == q: return j + 1
        j += 1
    return j


def skip_expr(js, j):
    """from just after '${' to just after its closing '}'"""
    depth = 1
    while j < len(js) and depth:
        c = js[j]
        if c in '\'"': j = skip_str(js, j, c); continue
        if c == '`': j = skip_tpl(js, j); continue
        depth += c == '{'; depth -= c == '}'; j += 1
    return j


def skip_tpl(js, i):
    j = i + 1
    while j < len(js):
        c = js[j]
        if c == BS: j += 2; continue
        if c == '`': return j + 1
        if c == '$' and js[j + 1] == '{': j = skip_expr(js, j + 2); continue
        j += 1
    return j


def literals(js):
    """(start, end) of every string and template literal, at any depth; skips comments and regex literals"""
    out = []

    def scan(a, b):
        i, prev = a, ';'
        while i < b:
            c = js[i]
            if js.startswith('//', i): k = js.find('\n', i); i = b if k < 0 else k; continue
            if js.startswith('/*', i): i = js.find('*/', i) + 2; continue
            if c in '\'"':
                j = skip_str(js, i, c); out.append((i, j)); i = j; prev = 'x'; continue
            if c == '`':
                j = skip_tpl(js, i); out.append((i, j)); k = i + 1
                while k < j - 1:
                    if js[k] == BS: k += 2; continue
                    if js[k] == '$' and js[k + 1] == '{': e = skip_expr(js, k + 2); scan(k + 2, e - 1); k = e; continue
                    k += 1
                i = j; prev = 'x'; continue
            if c == '/' and prev in REGEX_PREV:
                j, cls = i + 1, False
                while j < b and js[j] != '\n':
                    if js[j] == BS: j += 2; continue
                    if js[j] == '[': cls = True
                    elif js[j] == ']': cls = False
                    elif js[j] == '/' and not cls: break
                    j += 1
                i = j + 1; prev = 'x'; continue
            if c.isalpha() or c in '_$':
                w = re.match(r'[\w$]+', js[i:]).group(0)
                prev = ';' if w in KEYWORDS else 'x'; i += len(w); continue
            if not c.isspace(): prev = 'x' if (c.isdigit() or c in ')]') else c
            i += 1

    scan(0, len(js))
    return out


def cook(lit):
    out, i, body = [], 0, lit[1:-1]
    while i < len(body):
        if body[i] == BS:
            n = body[i + 1]
            if n in 'nt': out.append({'n': '\n', 't': '\t'}[n]); i += 2
            elif n == 'x': out.append(chr(int(body[i + 2:i + 4], 16))); i += 4
            elif n == 'u': out.append(chr(int(body[i + 2:i + 6], 16))); i += 6
            else: out.append(n); i += 2
        else: out.append(body[i]); i += 1
    return ''.join(out)


class StaticText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.skip = 0; self.found = set()
    def handle_starttag(self, tag, attrs):
        self.skip += tag in ('script', 'style')
        for k, v in attrs:
            if k in ('title', 'aria-label', 'placeholder', 'alt') and v and HEB.search(v): self.found.add(v.strip())
            if k == 'data-t' and v: self.found.add(v.strip())   # a key with its context, e.g. ביטול@undo
    def handle_endtag(self, tag):
        self.skip -= tag in ('script', 'style')
    def handle_data(self, d):
        if not self.skip and HEB.search(d): self.found.add(d.strip())


html = io.open(os.path.join(INK, 'index.html'), encoding='utf-8').read()
js = html[html.rindex('<script>') + 8:html.rindex('</script>')]
strings, plurals = set(), set()
call = re.compile(r'(?<![\w$.])(T|TN|N_)\(\s*$')
for a, b in literals(js):
    m = call.search(js[max(0, a - 8):a])
    if m and '${' not in js[a:b] and HEB.search(js[a:b]):
        key = cook(js[a:b])
        # N_() marks keys shown later; one with {n} is shown through TN, so it's a plural
        (plurals if m.group(1) == 'TN' or (m.group(1) == 'N_' and '{n}' in key) else strings).add(key)
static = StaticText(); static.feed(html[html.index('<body'):html.rindex('<script>')])
strings |= static.found

lang_dir = os.path.join(INK, 'lang')
for name in sorted(os.listdir(lang_dir)):
    if not name.endswith('.js'): continue
    src = io.open(os.path.join(lang_dir, name), encoding='utf-8').read()
    data = json.loads(src[src.index('=') + 1:src.rindex(';')])
    have, have_p = set(data['strings']), set(data['plurals'])
    missing, missing_p, unused = sorted(strings - have), sorted(plurals - have_p), sorted(have - strings)
    print(f"{name}: {len(have)} strings, {len(missing)} missing, {len(missing_p)} plurals missing, {len(unused)} unused")
    for k in missing: print('   missing:', k[:100])
    for k in missing_p: print('   missing plural:', k[:100])
    for k in unused: print('   unused:', k[:100])
