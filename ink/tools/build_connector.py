"""Packs ink/connector into floating-ink.mcpb, the file Claude Desktop installs as an extension.

An .mcpb is a zip with manifest.json at its root. Run after changing the connector:
  python ink/tools/build_connector.py
"""
import json, os, zipfile

CONN = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'connector')
FILES = ['manifest.json', 'icon.png', 'server/index.js']
manifest = json.load(open(os.path.join(CONN, 'manifest.json'), encoding='utf-8'))
out = os.path.join(CONN, 'floating-ink.mcpb')
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in FILES:
        z.write(os.path.join(CONN, *f.split('/')), f)
print('built', os.path.relpath(out), 'version', manifest['version'], os.path.getsize(out), 'bytes')
