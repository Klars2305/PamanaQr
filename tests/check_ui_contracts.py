#!/usr/bin/env python3
"""Read-only UI preservation check. Python standard library only.

Run from the project root: python tests/check_ui_contracts.py
The manifest records the uploaded application's contracts, not credentials.
This does not connect to Supabase, change files, or replace live browser tests.
"""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import hashlib
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = Path(__file__).with_name('ui-contracts.json')
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}
FIELD_ATTRS = {'name', 'type', 'required', 'readonly', 'disabled', 'value', 'checked', 'min', 'max', 'minlength', 'maxlength', 'pattern', 'accept', 'multiple'}
HOOK_CLASSES = {'navbar', 'navbar-nav', 'navbar-collapse', 'container', 'nav-link', 'd-none', 'invalid-feedback'}

class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.ids = {}
        self.duplicates = []
        self.data_hooks = []
        self.hrefs = []
        self.scripts = []
        self.forms = []
        self.options = {}
        self.textareas = {}
        self.classes = []
        self.option = None
        self.textarea = None
        self.assets = []
        self.aria_refs = []

    def handle_starttag(self, tag, pairs):
        attrs = {k: '' if v is None else v for k, v in pairs}
        id_ = attrs.get('id', '')
        if id_:
            if id_ in self.ids:
                self.duplicates.append(id_)
            forms = [a.get('id', '') for t, a in self.stack if t == 'form']
            self.ids[id_] = {
                'tag': tag,
                'form': forms[-1] if forms else None,
                'attrs': {k: v for k, v in attrs.items() if k in FIELD_ATTRS or k.startswith('data-')}
            }
        self.classes.extend(c for c in attrs.get('class', '').split() if c in HOOK_CLASSES)
        self.data_hooks.extend([tag, id_, k, v] for k, v in attrs.items() if k.startswith('data-'))
        if tag == 'a' and 'href' in attrs:
            self.hrefs.append(attrs['href'])
        if tag == 'script':
            self.scripts.append(attrs)
        if tag == 'form':
            self.forms.append({k: v for k, v in attrs.items() if k in {'id', 'action', 'method', 'enctype', 'novalidate'}})
        if tag == 'select':
            self.options[id_] = []
        if tag == 'option':
            select = next((a.get('id', '') for t, a in reversed(self.stack) if t == 'select'), '')
            self.option = [select, attrs.get('value'), 'selected' in attrs, '']
        if tag == 'textarea':
            self.textarea = id_
            self.textareas[id_] = ''
        if tag in {'img', 'script'} and 'src' in attrs:
            self.assets.append(attrs['src'])
        if tag in {'link', 'use'} and 'href' in attrs:
            self.assets.append(attrs['href'])
        for key in ('aria-describedby', 'aria-labelledby'):
            self.aria_refs.extend(attrs.get(key, '').split())
        if tag not in VOID:
            self.stack.append((tag, attrs))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag == 'option' and self.option:
            select, value, selected, text = self.option
            self.options.setdefault(select, []).append([value, selected, ' '.join(text.split())])
            self.option = None
        if tag == 'textarea':
            self.textarea = None
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break

    def handle_data(self, text):
        if self.option is not None:
            self.option[3] += text
        if self.textarea is not None:
            self.textareas[self.textarea] += text

    def snapshot(self):
        return {k: getattr(self, k) for k in ('ids', 'data_hooks', 'hrefs', 'scripts', 'forms', 'options', 'textareas', 'classes')}

def inspect_page(path):
    page = Page()
    page.feed(path.read_text(encoding='utf-8'))
    return page

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    if not MANIFEST.exists():
        print('Missing ui-contracts.json', file=sys.stderr)
        return 1
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    failures = []
    for relative, expected in manifest['protected_files'].items():
        path = ROOT / relative
        if not path.is_file() or digest(path) != expected:
            failures.append(f'Protected JavaScript/SQL/config file changed: {relative}')
    for relative, before in manifest['pages'].items():
        path = ROOT / relative
        if not path.is_file():
            failures.append(f'Missing page: {relative}')
            continue
        page = inspect_page(path)
        after = page.snapshot()
        for id_, expected in before['ids'].items():
            if after['ids'].get(id_) != expected:
                failures.append(f'{relative}: functional attributes/tag/form changed for #{id_}')
        for key in ('scripts', 'forms', 'options', 'textareas'):
            if before[key] != after[key]:
                failures.append(f'{relative}: {key} changed')
        for key in ('hrefs', 'classes'):
            if Counter(before[key]) - Counter(after[key]):
                failures.append(f'{relative}: original {key} missing')
        if Counter(map(tuple, before['data_hooks'])) - Counter(map(tuple, after['data_hooks'])):
            failures.append(f'{relative}: original data-* hook missing')
        if page.duplicates:
            failures.append(f'{relative}: duplicate IDs {page.duplicates}')
        for ref in page.aria_refs:
            if ref not in page.ids:
                failures.append(f'{relative}: missing ARIA target #{ref}')
        for asset in page.assets:
            if asset.startswith(('http:', 'https:', 'data:', '#')):
                continue
            local = path.parent / asset.split('#', 1)[0].split('?', 1)[0]
            if not local.is_file():
                failures.append(f'{relative}: missing local asset {asset}')
    css = ROOT / 'css/style.css'
    for asset in re.findall(r'url\([\"\']?([^\"\')]+)', css.read_text(encoding='utf-8')):
        if not asset.startswith(('http:', 'https:', 'data:')) and not (css.parent / asset).is_file():
            failures.append(f'CSS: missing asset {asset}')
    if failures:
        print('\n'.join('FAIL: ' + item for item in failures))
        return 1
    print(f"PASS: {len(manifest['pages'])} pages preserve their original contracts.")
    print(f"PASS: {len(manifest['protected_files'])} protected files match the uploaded original.")
    print('PASS: local asset references, ARIA targets, form defaults, and IDs.')
    print('This is a static preservation check, not live authentication, RLS, storage, or QR acceptance testing.')
    return 0

if __name__ == '__main__':
    sys.exit(main())
