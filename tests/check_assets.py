#!/usr/bin/env python3
"""Check local CSS/SVG syntax and application JS without contacting services."""
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET
import tinycss2
ROOT = Path(__file__).resolve().parents[1]
errors=[]
for file in (ROOT/'js').glob('*.js'):
    result=subprocess.run(['node','--check',str(file)],capture_output=True,text=True)
    if result.returncode: errors.append(str(file.relative_to(ROOT))+': '+result.stderr)
for file in (ROOT/'assets').rglob('*.svg'):
    try: ET.parse(file)
    except ET.ParseError as e: errors.append(str(file.relative_to(ROOT))+': '+str(e))
def rules(items):
    for item in items:
        if item.type=='error': errors.append(f'CSS: {item.message} at line {item.source_line}')
        elif item.type=='qualified-rule':
            for decl in tinycss2.parse_declaration_list(item.content,skip_comments=True,skip_whitespace=True):
                if decl.type=='error':errors.append(f'CSS declaration: {decl.message}')
        elif item.type=='at-rule' and item.content and item.lower_at_keyword in ('media','supports','layer','keyframes'):
            rules(tinycss2.parse_rule_list(item.content,skip_comments=True,skip_whitespace=True))
rules(tinycss2.parse_stylesheet((ROOT/'css/style.css').read_text(),skip_comments=True,skip_whitespace=True))
if errors:
    print('\n'.join(errors));sys.exit(1)
print(f"PASS: {len(list((ROOT/'js').glob('*.js')))} application JavaScript files, CSS syntax, {len(list((ROOT/'assets').rglob('*.svg')))} SVG files.")
