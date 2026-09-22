"""Packs ink/connector into the two files Claude installs:

  floating-ink.mcpb        an extension (zip with manifest.json at its root)
  floating-ink-plugin.zip  a plugin (zip with .claude-plugin/plugin.json), for the Plugins screen

Run after changing the connector:  python ink/tools/build_connector.py
"""
import json, os, zipfile

CONN = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'connector')
manifest = json.load(open(os.path.join(CONN, 'manifest.json'), encoding='utf-8'))
BUNDLES = {
    'floating-ink.mcpb': [('manifest.json', 'manifest.json'), ('icon.png', 'icon.png'), ('server/index.js', 'server/index.js')],
    'floating-ink-plugin.zip': [('plugin.json', '.claude-plugin/plugin.json'), ('icon.png', 'icon.png'), ('server/index.js', 'server/index.js')],
}
for name, files in BUNDLES.items():
    out = os.path.join(CONN, name)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for src, dest in files:
            z.write(os.path.join(CONN, *src.split('/')), dest)
    print('built', os.path.relpath(out), 'version', manifest['version'], os.path.getsize(out), 'bytes')
