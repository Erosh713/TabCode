"""List every French UI string (key) used by TabCode, to keep js/i18n-en.js complete."""
import re, json, glob, sys
keys = []
def add(k):
    k = bytes(k, 'utf-8').decode('unicode_escape').encode('latin-1').decode('utf-8') if '\\' in k else k
    if k not in keys: keys.append(k)
for f in sorted(glob.glob('js/*.js')):
    if f.endswith('i18n-en.js'): continue
    s = open(f, encoding='utf-8').read()
    for m in re.finditer(r'\bt\(\s*"((?:[^"\\]|\\.)*)"', s): add(m.group(1))
    for m in re.finditer(r'\b(?:desc|label):\s*"((?:[^"\\]|\\.)*)"', s): add(m.group(1))
    for m in re.finditer(r'\["(\w+)", "([^"]+)"\]', s):
        if f.endswith('app.js'): add(m.group(2))
s = open('index.html', encoding='utf-8').read()
for m in re.finditer(r'data-i18n(?:-title|-placeholder)?="([^"]+)"', s): add(m.group(1).replace('&#39;', "'"))
# shortcut descriptions in app.js
s = open('js/app.js', encoding='utf-8').read()
for m in re.finditer(r'\["[^"]+", "([^"]+)"\]', s): add(m.group(1))
if '--check' in sys.argv:
    en = open('js/i18n-en.js', encoding='utf-8').read()
    missing = [k for k in keys if json.dumps(k, ensure_ascii=False) not in en]
    print(len(keys), 'keys,', len(missing), 'missing'); print('\n'.join(missing)); sys.exit(1 if missing else 0)
print(json.dumps(keys, ensure_ascii=False, indent=0))
