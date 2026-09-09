#!/usr/bin/env python3
"""Isolated browser acceptance tests. No requests reach Supabase or a mail service.

Requires Python Playwright and Chromium. Run: python tests/browser_hci.py
The application still imports Bootstrap 5.3.3. Offline tests explicitly use the
bundled 5.3.6 substitute, an Auth/database/storage double, and a QR test adapter.
Passing these tests does NOT establish live RLS, email delivery or production QR.
"""
from __future__ import annotations
import argparse
import os
import shutil
import base64
import functools
import http.server
import json
import mimetypes
import fnmatch
from collections import Counter
import re
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse, unquote, urljoin
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
TESTS = ROOT / 'tests'
OUT = ROOT / 'test-results'
STORY = ("My family visited Fort Santiago during a trip to Intramuros. Walking through the stone walls helped me understand how important the site is to Philippine history. Our guide explained several events connected to the Spanish colonial period and Dr. Jose Rizal. The experience made me appreciate why historical places should be preserved for future generations.")
TITLE = "My Family's Visit to Fort Santiago"
CASES = []

def case(name):
    def register(fn):
        CASES.append((name, fn))
        return fn
    return register

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

class Harness:
    def __init__(self, browser, base):
        self.context = browser.new_context(viewport={'width': 1280, 'height': 900}, reduced_motion='reduce', accept_downloads=True)
        self.errors = []
        self.logs = []
        self.blocked = []
        self.base = base
        self.local_data = {}
        self.session_data = {}
        self.context.route('**/*', self.route)
        self.context.add_init_script("window.__hciPrintCalls=0; window.print=function(){window.__hciPrintCalls++;};")
        self.page = self.context.new_page()
        self.page.on('pageerror', lambda e: self.errors.append(str(e)))
        self.page.on('console', lambda m: self.logs.append({'type':m.type,'text':m.text}) if m.type in ('error','warning') else None)
        self.go('index.html')

    def route(self, route):
        url = route.request.url
        host = urlparse(url).hostname
        if host in ('127.0.0.1', 'localhost'):
            path = (ROOT / unquote(urlparse(url).path).lstrip('/')).resolve()
            if not path.is_relative_to(ROOT) or not path.is_file():
                route.fulfill(status=404, body='Not found'); return
            mime = mimetypes.guess_type(str(path))[0] or 'application/octet-stream'
            if path.suffix == '.js':
                # Browser policy blocks navigation in this environment. Only the
                # browser-bound location/history are instrumented, in-memory.
                # Production files on disk are never changed by the harness.
                text = path.read_text().replace('window.location', 'window.HCI_LOCATION').replace('window.history', 'window.HCI_HISTORY')
                route.fulfill(body=text, content_type='application/javascript'); return
            route.fulfill(path=str(path), content_type=mime); return
        if url.startswith(('blob:', 'data:', 'about:')):
            route.continue_(); return
        if 'bootstrap' in url and url.endswith('.css'):
            route.fulfill(path=str(TESTS/'vendor/bootstrap-5.3.6.min.css'), content_type='text/css'); return
        if 'bootstrap' in url and '.js' in url:
            route.fulfill(path=str(TESTS/'vendor/bootstrap-5.3.6.bundle.min.js'), content_type='application/javascript'); return
        if '@supabase/supabase-js' in url:
            route.fulfill(body=(TESTS/'fixtures/supabase-double.js').read_text().replace('location.', 'window.HCI_LOCATION.'), content_type='application/javascript'); return
        if 'qrcode' in url:
            route.fulfill(path=str(TESTS/'fixtures/qr-test-adapter.js'), content_type='application/javascript'); return
        self.blocked.append(urlparse(url).hostname)
        route.abort()

    @property
    def url(self):
        return self.page.evaluate('window.HCI_LOCATION.href')

    def go(self, path):
        target = urljoin(self.base+'/', path)
        if self.page.evaluate('!!window.__hciSnapshot'):
            saved=self.page.evaluate('window.__hciSnapshot()')
            self.local_data=saved['local']; self.session_data=saved['session']
        self.page.goto('about:blank')
        prelude = r"""(function(){
          function storage(data) { return {getItem:k=>Object.hasOwn(data,k)?data[k]:null,setItem:(k,v)=>{data[k]=String(v)},removeItem:k=>{delete data[k]},clear:()=>Object.keys(data).forEach(k=>delete data[k])}; }
          // about:blank lacks the secure-context randomUUID available on HTTPS/localhost.
          // TEST ONLY: emulate that platform method with cryptographic random bytes.
          if (!crypto.randomUUID) crypto.randomUUID=()=>{const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const x=[...b].map(v=>v.toString(16).padStart(2,'0')).join('');return x.slice(0,8)+'-'+x.slice(8,12)+'-'+x.slice(12,16)+'-'+x.slice(16,20)+'-'+x.slice(20);};
          const local=LOCAL_DATA, session=SESSION_DATA;
          Object.defineProperty(window,'localStorage',{value:storage(local),configurable:true});
          Object.defineProperty(window,'sessionStorage',{value:storage(session),configurable:true});
          window.__hciSnapshot=()=>({local,session});
          const nativeSetAttribute=SVGElement.prototype.setAttribute;
          SVGElement.prototype.setAttribute=function(name,value){if(name==='href' && String(value).includes('sprite.svg#')) value='about:blank#'+String(value).split('#').pop();return nativeSetAttribute.call(this,name,value);};
          let current=new URL(TARGET_URL); window.__hciNavigate='';
          window.HCI_LOCATION=new Proxy({}, {get:(_,k)=>current[k],set:(_,k,v)=>{if(k==='href'){window.__hciNavigate=new URL(v,current).href;return true;}current[k]=v;return true;}});
          window.HCI_HISTORY={replaceState:(_s,_t,url)=>{current=new URL(url,current)}};
          document.addEventListener('click',function(event){
            const a=event.target.closest('a[href]'); if(!a || a.hasAttribute('download') || a.dataset.bsToggle || a.getAttribute('href').startsWith('#')) return;
            const url=new URL(a.getAttribute('href'),current);
            if(url.origin===current.origin){event.preventDefault();window.__hciNavigate=url.href;}
          });
        })();""".replace('LOCAL_DATA',json.dumps(self.local_data).replace('<', r'\u003c').replace('>', r'\u003e')).replace('SESSION_DATA',json.dumps(self.session_data).replace('<', r'\u003c').replace('>', r'\u003e')).replace('TARGET_URL',json.dumps(target))
        source=ROOT/unquote(urlparse(target).path).lstrip('/')
        html=source.read_text()
        html=re.sub(r'(["\'])([^"\']*sprite\.svg#)([^"\']+)\1',lambda m:m[1]+'about:blank#'+m[3]+m[1],html)
        sprite=(ROOT/'assets/icons/sprite.svg').read_text()
        symbols=re.search(r'<svg[^>]*>(.*)</svg>',sprite,re.S).group(1)
        html=html.replace('</body>','<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">'+symbols+'</svg></body>')
        html=html.replace('<head>','<head><base href="'+target+'"><script>'+prelude+'</script>',1)
        self.page.set_content(html,wait_until='networkidle')
        self.page.wait_for_function('!!window.HciFixture')
        self.page.wait_for_timeout(130)
        return self.page

    def wait_for_url(self, pattern):
        self.page.wait_for_function("!!window.__hciNavigate", timeout=7000)
        target=self.page.evaluate('window.__hciNavigate')
        assert pattern.search(target) if hasattr(pattern,'search') else fnmatch.fnmatch(target,pattern), target
        self.go(target)

    def role(self, role):
        self.page.evaluate('(role)=>HciFixture.setRole(role)', role)

    def state(self):
        return self.page.evaluate('HciFixture.read()')

    def change(self, expression):
        return self.page.evaluate('()=>{const s=HciFixture.read();'+expression+';HciFixture.write(s);}')

    def calls(self, action):
        return self.page.evaluate('(a)=>HciFixture.calls(a)', action)

    def fail(self, action, error=None):
        self.page.evaluate('([action,error])=>HciFixture.fail(action,error)', [action, error or {'throw':True}])

    def login(self, email, password):
        p = self.go('login.html')
        p.locator('#loginEmail').fill(email)
        p.locator('#loginPassword').fill(password)
        p.locator('#loginButton').click()
        self.wait_for_url(re.compile(r'/((admin)|(contributor))/dashboard.html'))
        p.wait_for_load_state('networkidle')

    def logout(self):
        p = self.page
        p.locator('[data-logout]:visible').first.click()
        expect(p.locator('#pamanaConfirmModal')).to_be_visible()
        p.locator('#pamanaConfirmAccept').click()
        self.wait_for_url('**/login.html')
        p.wait_for_load_state('networkidle')

    def contributor_form(self):
        self.role('contributor')
        p=self.go('contribute.html')
        expect(p.locator('#submissionButton')).to_be_enabled()
        expect(p.locator('#contributorDisplayName')).to_have_value('Juan Dela Cruz')
        p.locator('#heritageSiteId').select_option('1')
        p.locator('#storyTitle').fill(TITLE)
        p.locator('#storyContent').fill(STORY)
        p.locator('#suggestedClassification').select_option('Personal Recollection')
        p.locator('#storySourceReference').fill('Personal experience during visit')
        return p

    def seed_story(self, status='submitted', photo=False):
        self.role('contributor')
        self.change("s.stories=[{id:1,heritage_site_id:1,contributor_id:s.session.user.id,title:"+json.dumps(TITLE)+",content:"+json.dumps(STORY)+",contributor_display_name:'Juan Dela Cruz',allow_public_name:true,suggested_classification:'Personal Recollection',classification:"+("'Personal Recollection'" if status=='published' else 'null')+",status:"+json.dumps(status)+",source_reference:'Personal visit',created_at:new Date().toISOString()}];s.nextStory=2")
        if photo:
            self.change("s.media=[{id:1,story_id:1,heritage_site_id:null,image_url:'fixture/photo.png',caption:'Test supporting photo',uploaded_by:s.session.user.id}]")
        self.role('admin')
        return self.go('admin/review-story.html?id=1')

    def site_form(self):
        self.role('admin')
        p=self.go('admin/heritage-form.html')
        expect(p.locator('#heritageFormButton')).to_be_enabled()
        data={
            'siteName':'Pamana Test Heritage Plaza',
            'siteLocation':'Davao del Norte, Philippines',
            'historicalPeriod':'20th Century',
            'shortDescription':'A temporary test heritage record used to verify the complete Pamana heritage management workflow.',
            'historicalBackground':'This test record is created only for system testing. It verifies that administrators can create, update, activate, archive, and generate QR codes for heritage records.',
            'sourceReference':'Pamana System Testing'
        }
        for key,value in data.items(): p.locator('#'+key).fill(value)
        p.locator('#siteStatus').select_option('active')
        return p

@case('TC-002 Weak registration password blocked before Auth')
def weak_registration(h):
    p=h.go('register.html')
    p.locator('#displayName').fill('Juan Dela Cruz')
    p.locator('#registerEmail').fill('test@example.com')
    p.locator('#registerPassword').fill('abc')
    p.locator('#confirmPassword').fill('abc')
    p.locator('#registerButton').click()
    expect(p.locator('#registerPasswordFeedback')).to_contain_text('8')
    expect(p.locator('#registerPassword')).to_have_attribute('aria-invalid','true')
    expect(p.locator('#registerPassword')).to_be_focused()
    expect(p.locator('#registerButton')).to_be_enabled()
    assert h.calls('auth.signUp')==0

@case('TC-004 Invalid email stays inline and no Auth request')
def invalid_email(h):
    p=h.go('forgot-password.html')
    p.locator('#forgotPasswordEmail').fill('juan@')
    p.locator('#forgotPasswordButton').click()
    expect(p.locator('#forgotPasswordEmailFeedback')).to_have_text('Enter a valid email address.')
    assert h.calls('auth.resetPasswordForEmail')==0

@case('TC-005 Password mismatch and visibility keyboard toggle')
def mismatch_toggle(h):
    p=h.go('register.html')
    p.locator('#displayName').fill('Juan Dela Cruz')
    p.locator('#registerEmail').fill('test@example.com')
    p.locator('#registerPassword').fill('PamanaTest123')
    p.locator('#confirmPassword').fill('OtherTest123')
    toggle=p.locator('[data-password-toggle="registerPassword"]')
    expect(p.locator('#registerPassword')).to_have_attribute('type','password')
    toggle.focus(); p.keyboard.press('Enter')
    expect(p.locator('#registerPassword')).to_have_attribute('type','text')
    expect(toggle).to_have_attribute('aria-label','Hide password')
    p.keyboard.press('Space')
    expect(p.locator('#registerPassword')).to_have_attribute('type','password')
    p.locator('#registerButton').click()
    expect(p.locator('#confirmPasswordFeedback')).to_have_text('Passwords do not match.')
    assert h.calls('auth.signUp')==0

@case('Registration network failure restores controls and hides provider detail')
def register_failure(h):
    p=h.go('register.html')
    for key,val in [('displayName','Juan'),('registerEmail','juan@example.com'),('registerPassword','PamanaTest123'),('confirmPassword','PamanaTest123')]: p.locator('#'+key).fill(val)
    h.fail('auth.signUp')
    p.locator('#registerButton').click()
    expect(p.locator('#registerMessage')).to_contain_text('internet connection')
    expect(p.locator('#registerButton')).to_be_enabled()
    expect(p.locator('#registerEmail')).to_be_enabled()
    assert len(h.state()['users'])==1

@case('TC-014 Invalid login and network recovery; old-password login stays compatible')
def login_errors(h):
    p=h.go('login.html')
    p.locator('#loginEmail').fill('admin@pamana.test')
    p.locator('#loginPassword').fill('wrong')
    p.locator('#loginButton').click()
    expect(p.locator('#loginMessage')).to_contain_text('Incorrect email or password')
    expect(p.locator('#loginButton')).to_be_enabled()
    h.fail('auth.signInWithPassword')
    p.locator('#loginButton').click()
    expect(p.locator('#loginMessage')).to_contain_text('internet connection')
    h.change("s.users[0].password='legacy'")
    p.locator('#loginPassword').fill('legacy')
    p.locator('#loginButton').click()
    h.wait_for_url('**/admin/dashboard.html')

@case('TC-012 Forgot password generic response, trimmed email and same-app redirect')
def forgot(h):
    p=h.go('forgot-password.html')
    p.locator('#forgotPasswordEmail').fill('  not-an-account@example.com  ')
    h.change('s.delayMs=250')
    p.locator('#forgotPasswordButton').click()
    expect(p.locator('#forgotPasswordButton')).to_be_disabled()
    expect(p.locator('#forgotPasswordMessage')).to_contain_text('Sending reset link')
    p.locator('#forgotPasswordForm').evaluate("f=>f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))")
    expect(p.locator('#forgotPasswordMessage')).to_contain_text('If an account exists')
    assert h.calls('auth.resetPasswordForEmail')==1
    assert h.state()['lastRecovery']=={'email':'not-an-account@example.com','redirectTo':h.base+'/reset-password.html'}
    expect(p.locator('#forgotPasswordButton')).to_be_enabled()

@case('Forgot password retry after connection failure')
def forgot_retry(h):
    p=h.go('forgot-password.html')
    p.locator('#forgotPasswordEmail').fill('juan@example.com')
    h.fail('auth.resetPasswordForEmail')
    p.locator('#forgotPasswordButton').click()
    expect(p.locator('#forgotPasswordMessage')).to_contain_text('internet connection')
    expect(p.locator('#forgotPasswordButton')).to_be_enabled()
    p.locator('#forgotPasswordButton').click()
    expect(p.locator('#forgotPasswordMessage')).to_contain_text('If an account exists')

@case('Reset denies ordinary session, direct visit and expired link')
def reset_denied(h):
    h.role('admin')
    p=h.go('reset-password.html')
    expect(p.locator('#newPassword')).to_be_disabled()
    expect(p.locator('#resetPasswordMessage')).to_contain_text('reset link')
    h.role(None)
    p=h.go('reset-password.html#error=access_denied&error_code=otp_expired')
    expect(p.locator('#newPassword')).to_be_disabled()
    assert '#' not in h.url
    assert h.calls('auth.updateUser')==0

@case('TC-013 Valid recovery, mismatch, duplicate guard, password update and sign-out')
def reset_success(h):
    p=h.go('reset-password.html#access_token=valid-test-recovery-token&refresh_token=test&type=recovery')
    expect(p.locator('#newPassword')).to_be_enabled()
    assert '#' not in h.url
    p.locator('#newPassword').fill('UpdatedPamana123')
    p.locator('#confirmNewPassword').fill('WrongPamana123')
    p.locator('#resetPasswordButton').click()
    expect(p.locator('#confirmNewPasswordFeedback')).to_contain_text('do not match')
    assert h.calls('auth.updateUser')==0
    p.locator('#confirmNewPassword').fill('UpdatedPamana123')
    h.change('s.delayMs=250')
    p.locator('#resetPasswordButton').click()
    expect(p.locator('#resetPasswordButton')).to_be_disabled()
    p.locator('#resetPasswordForm').evaluate("f=>f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))")
    expect(p.locator('#resetPasswordMessage')).to_contain_text('updated successfully')
    assert h.calls('auth.updateUser')==1
    assert h.state()['session'] is None
    expect(p.locator('#newPassword')).to_be_disabled()
    h.login('admin@pamana.test','UpdatedPamana123')

@case('Reset failed update restores form, preserving password for retry')
def reset_failure(h):
    p=h.go('reset-password.html#access_token=valid-test-recovery-token&type=recovery')
    expect(p.locator('#newPassword')).to_be_enabled()
    p.locator('#newPassword').fill('UpdatedPamana123')
    p.locator('#confirmNewPassword').fill('UpdatedPamana123')
    h.fail('auth.updateUser')
    p.locator('#resetPasswordButton').click()
    expect(p.locator('#resetPasswordMessage')).to_contain_text('internet connection')
    expect(p.locator('#resetPasswordButton')).to_be_enabled()
    expect(p.locator('#newPassword')).to_have_value('UpdatedPamana123')
    assert h.state()['users'][0]['password']=='AdminTesting123'

@case('TC-003 Empty story is blocked; counters and original content format preserved')
def story_validation(h):
    p=h.contributor_form()
    p.locator('#storyContent').fill('')
    p.locator('#submissionButton').click()
    expect(p.locator('#storyContentFeedback')).to_have_text('Story content is required.')
    assert h.calls('stories.insert')==0
    p.locator('#storyContent').fill('x'*3001)
    expect(p.locator('#storyContentCounter')).to_contain_text('3001 / 3000')
    p.locator('#submissionButton').click()
    expect(p.locator('#storyContentFeedback')).to_be_visible()
    assert h.calls('stories.insert')==0

@case('TC-006 Oversized photo rejected before insert/upload')
def image_size(h):
    p=h.contributor_form()
    p.locator('#supportingPhoto').set_input_files({'name':'too-large.png','mimeType':'image/png','buffer':b'X'*(5*1024*1024+1)})
    expect(p.locator('#supportingPhotoFeedback')).to_contain_text('5')
    p.locator('#submissionButton').click()
    assert h.calls('storage.upload')==0 and h.calls('stories.insert')==0

@case('TC-007 Unsupported or spoofed photo rejected before insert/upload')
def image_type(h):
    p=h.contributor_form()
    p.locator('#supportingPhoto').set_input_files({'name':'script.svg','mimeType':'image/svg+xml','buffer':b'<svg/>'})
    expect(p.locator('#supportingPhotoFeedback')).to_contain_text('JPG')
    p.locator('#supportingPhoto').set_input_files(str(TESTS/'fixtures/not-an-image.png'))
    p.locator('#submissionButton').click()
    expect(p.locator('#supportingPhotoFeedback')).to_be_visible()
    assert h.calls('storage.upload')==0 and h.calls('stories.insert')==0

@case('Selected photo preview/remove stays local until submission')
def image_preview(h):
    p=h.contributor_form()
    p.locator('#supportingPhoto').set_input_files(str(TESTS/'fixtures/valid-photo.png'))
    expect(p.locator('#supportingPhotoPreview')).to_be_visible()
    assert p.locator('#supportingPhotoPreview img').evaluate('img=>img.complete && img.naturalWidth>0')
    assert h.calls('storage.upload')==0
    p.locator('[data-remove-selected-photo="supportingPhoto"]').click()
    expect(p.locator('#supportingPhotoPreview')).to_be_hidden()
    assert p.locator('#supportingPhoto').evaluate('input=>input.files.length')==0

@case('Story failure restores controls without losing entered content')
def story_failure(h):
    p=h.contributor_form()
    h.fail('stories.insert')
    p.locator('#submissionButton').click()
    expect(p.locator('#submissionMessage')).to_contain_text('internet connection')
    expect(p.locator('#submissionButton')).to_be_enabled()
    expect(p.locator('#storyContent')).to_have_value(STORY)
    assert len(h.state()['stories'])==0

@case('Partial story/photo failure reports saved story, prevents accidental duplicate')
def story_partial(h):
    p=h.contributor_form()
    p.locator('#supportingPhoto').set_input_files(str(TESTS/'fixtures/valid-photo.png'))
    expect(p.locator('#supportingPhotoPreview')).to_be_visible()
    h.fail('storage.upload')
    p.locator('#submissionButton').click()
    expect(p.locator('#submissionMessage')).to_contain_text('submitted')
    expect(p.locator('#submissionMessage')).to_contain_text('photo')
    expect(p.locator('#storyTitle')).to_have_value('')
    assert len(h.state()['stories'])==1
    assert h.calls('stories.insert')==1
    p.locator('#submissionButton').click()
    assert h.calls('stories.insert')==1

@case('Heritage picker failure is not overwritten by ready state')
def picker_failure(h):
    h.role('contributor'); h.fail('heritage_sites.select')
    p=h.go('contribute.html')
    expect(p.locator('#submissionButton')).to_be_disabled()
    expect(p.locator('#submissionMessage')).to_contain_text('internet connection')
    assert 'ready' not in p.locator('#submissionMessage').inner_text().lower()

@case('Publish classification and rejection notes validate before confirmation')
def review_validation(h):
    p=h.seed_story()
    expect(p.locator('#publishStoryButton')).to_be_enabled()
    p.locator('#finalClassification').select_option('')
    p.locator('#publishStoryButton').click()
    expect(p.locator('#finalClassificationFeedback')).to_be_visible()
    p.locator('#rejectStoryButton').click()
    expect(p.locator('#reviewNotesFeedback')).to_contain_text('review notes')
    assert h.calls('stories.update')==0
    assert p.locator('#pamanaConfirmModal').count()==0

@case('Confirmation is keyboard-dismissible, focus returns, no write on Cancel')
def review_cancel(h):
    p=h.seed_story()
    p.locator('#publishStoryButton').click()
    expect(p.locator('#pamanaConfirmCancel')).to_be_focused()
    p.keyboard.press('Escape')
    expect(p.locator('#pamanaConfirmModal')).to_be_hidden()
    expect(p.locator('#publishStoryButton')).to_be_enabled()
    expect(p.locator('#publishStoryButton')).to_be_focused()
    assert h.calls('stories.update')==0

@case('Review network error restores both actions and retains review notes')
def review_error(h):
    p=h.seed_story()
    p.locator('#reviewNotes').fill('Reviewed carefully for this test.')
    h.fail('stories.update')
    p.locator('#publishStoryButton').click()
    p.locator('#pamanaConfirmAccept').click()
    expect(p.locator('#reviewStoryMessage')).to_contain_text('internet connection')
    expect(p.locator('#publishStoryButton')).to_be_enabled()
    expect(p.locator('#rejectStoryButton')).to_be_enabled()
    expect(p.locator('#reviewNotes')).to_have_value('Reviewed carefully for this test.')
    assert h.state()['stories'][0]['status']=='submitted'

@case('TC-010 Rejection stays nonpublic and contributor sees Not published')
def review_reject(h):
    p=h.seed_story()
    p.locator('#reviewNotes').fill('Please provide a clearer source before publication.')
    p.locator('#rejectStoryButton').click()
    expect(p.locator('#pamanaConfirmTitle')).to_have_text('Reject Story?')
    p.locator('#pamanaConfirmAccept').click()
    h.wait_for_url('**/admin/submissions.html?status=submitted')
    assert h.state()['stories'][0]['status']=='rejected'
    h.role('contributor'); h.go('contributor/submissions.html')
    expect(p.locator('main')).to_contain_text('Not published')
    h.role(None); h.go('story.html?id=1')
    expect(p.locator('#storyDetailsMessage')).to_contain_text('not')
    assert TITLE not in p.locator('main').inner_text()

@case('Already-reviewed story remains read-only with honest status')
def review_readonly(h):
    p=h.seed_story(status='published')
    expect(p.locator('#publishStoryButton')).to_be_disabled()
    expect(p.locator('#rejectStoryButton')).to_be_disabled()
    expect(p.locator('#reviewStoryMessage')).to_contain_text('already been reviewed')

@case('Archive Cancel/Activate confirmations and failure recovery')
def archive_checks(h):
    h.role('admin'); p=h.go('admin/heritage-sites.html')
    p.locator('[data-status-toggle]').first.click()
    p.locator('#pamanaConfirmCancel').click()
    expect(p.locator('[data-status-toggle]').first).to_be_enabled()
    assert h.calls('heritage_sites.update')==0
    h.fail('heritage_sites.update')
    p.locator('[data-status-toggle]').first.click(); p.locator('#pamanaConfirmAccept').click()
    expect(p.locator('#heritageManagementMessage')).to_contain_text('internet connection')
    expect(p.locator('[data-status-toggle]').first).to_be_enabled()
    h.change("s.heritage_sites[0].status='archived'"); h.go('admin/heritage-sites.html')
    p.locator('[data-status-toggle]').first.click()
    expect(p.locator('#pamanaConfirmTitle')).to_have_text('Activate Heritage Site?')
    p.locator('#pamanaConfirmAccept').click()
    expect(p.locator('#heritageManagementMessage')).to_contain_text('activated')
    assert h.state()['heritage_sites'][0]['status']=='active'

@case('Heritage name/description bounds and generated slug feedback')
def site_validation(h):
    p=h.site_form()
    expect(p.locator('#siteSlugPreview')).to_contain_text('pamana-test-heritage-plaza')
    p.locator('#siteName').fill('ab')
    p.locator('#heritageFormButton').click()
    expect(p.locator('#siteNameFeedback')).to_be_visible()
    assert h.calls('heritage_sites.insert')==0
    p.locator('#siteName').fill('Pamana Test Heritage Plaza')
    p.locator('#shortDescription').fill('x'*501)
    p.locator('#heritageFormButton').click()
    expect(p.locator('#shortDescriptionFeedback')).to_be_visible()
    assert h.calls('heritage_sites.insert')==0

@case('Saved heritage with failed image is clearly recoverable without second insert')
def site_partial(h):
    p=h.site_form()
    p.locator('#mainPhoto').set_input_files(str(TESTS/'fixtures/valid-photo.png'))
    h.fail('storage.upload')
    p.locator('#heritageFormButton').click()
    expect(p.locator('#heritageFormMessage')).to_contain_text('saved')
    expect(p.locator('#heritageFormMessage')).to_contain_text('photo')
    expect(p.locator('#heritageFormButton')).to_be_disabled()
    assert len(h.state()['heritage_sites'])==2

@case('TC-015 No-results search has working Clear recovery and input remains safe')
def search_empty(h):
    p=h.go('browse.html')
    p.locator('#browseSearchInput').fill('<img src=x onerror=alert(1)>')
    p.locator('#browseSearchForm').evaluate('f=>f.requestSubmit()')
    expect(p.locator('#browseMessage')).to_contain_text('0 results')
    assert p.locator('#heritageList img[src="x"]').count()==0
    p.locator('#clearSearchButton').click()
    expect(p.locator('#heritageList')).to_contain_text('Fort Santiago')

@case('Logout cancellation and service failure preserve session')
def logout_failure(h):
    h.role('admin'); p=h.go('admin/dashboard.html')
    p.locator('[data-logout]:visible').first.click(); p.locator('#pamanaConfirmCancel').click()
    assert h.state()['session'] is not None
    assert h.calls('auth.signOut')==0
    h.fail('auth.signOut')
    p.locator('[data-logout]:visible').first.click(); p.locator('#pamanaConfirmAccept').click()
    expect(p.locator('#pamanaGlobalFeedback')).to_contain_text('internet connection')
    assert h.state()['session'] is not None
    expect(p.locator('[data-logout]:visible').first).to_be_enabled()

@case('E2E-001 Contributor registration -> story/photo -> admin publication -> public view (SIMULATED)')
def e2e_contributor(h):
    p=h.go('register.html')
    for key,value in [('displayName','Juan Dela Cruz'),('registerEmail','juan.e2e@example.com'),('registerPassword','PamanaTest123'),('confirmPassword','PamanaTest123')]: p.locator('#'+key).fill(value)
    h.change('s.delayMs=100')
    p.locator('#registerButton').click()
    p.locator('#registerForm').evaluate("f=>f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))")
    h.wait_for_url('**/login.html')
    assert h.calls('auth.signUp')==1
    assert h.state()['users'][-1]['role']=='contributor'
    h.login('juan.e2e@example.com','PamanaTest123')
    expect(p.locator('#submittedCount')).to_have_text('0')
    h.go('contribute.html')
    expect(p.locator('#submissionButton')).to_be_enabled()
    for key,value in [('storyTitle',TITLE),('storyContent',STORY),('storySourceReference','Personal experience during visit')]: p.locator('#'+key).fill(value)
    p.locator('#heritageSiteId').select_option('1')
    p.locator('#suggestedClassification').select_option('Personal Recollection')
    p.locator('#allowPublicName').check()
    p.locator('#supportingPhoto').set_input_files(str(TESTS/'fixtures/valid-photo.png'))
    expect(p.locator('#supportingPhotoPreview')).to_be_visible()
    p.locator('#submissionButton').click()
    p.locator('#submissionForm').evaluate("f=>f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))")
    expect(p.locator('#submissionMessage')).to_contain_text('successfully')
    assert h.calls('stories.insert')==1
    assert len(h.state()['media'])==1
    story=h.state()['stories'][0]
    assert story['status']=='submitted' and story['classification'] is None
    h.go('contributor/dashboard.html'); expect(p.locator('#submittedCount')).to_have_text('1')
    h.go('contributor/submissions.html'); expect(p.locator('main')).to_contain_text(TITLE)
    h.logout()
    h.go('story.html?id=1'); assert TITLE not in p.locator('main').inner_text()
    h.login('admin@pamana.test','AdminTesting123')
    h.go('admin/submissions.html'); expect(p.locator('main')).to_contain_text(TITLE)
    p.locator('a[href="review-story.html?id=1"]').click()
    h.wait_for_url('**/admin/review-story.html?id=1')
    expect(p.locator('#reviewStoryTitle')).to_have_text(TITLE)
    expect(p.locator('#reviewStoryBody')).to_have_text(STORY)
    expect(p.locator('#reviewContributorName')).to_have_text('Juan Dela Cruz')
    expect(p.locator('#reviewSourceReference')).to_contain_text('Personal experience')
    expect(p.locator('#reviewPhotoBox img')).to_be_visible()
    p.locator('#finalClassification').select_option('Personal Recollection')
    p.locator('#reviewNotes').fill('Content reviewed and appropriate for community publication.')
    p.locator('#publishStoryButton').click()
    expect(p.locator('#pamanaConfirmTitle')).to_have_text('Publish Story?')
    p.locator('#pamanaConfirmAccept').click()
    h.wait_for_url('**/admin/submissions.html?status=submitted')
    assert h.calls('stories.update')==1
    assert h.state()['stories'][0]['status']=='published'
    h.logout()
    h.go('heritage.html?site=fort-santiago-fixture')
    expect(p.locator('#publishedStoriesList')).to_contain_text(TITLE)
    h.go('story.html?id=1')
    expect(p.locator('#storyTitle')).to_have_text(TITLE)
    expect(p.locator('#storyContent')).to_contain_text(STORY)
    expect(p.locator('#storyClassification')).to_contain_text('Personal Recollection')
    p.screenshot(path=str(OUT/'e2e-public-story.png'),full_page=True,timeout=8000,animations='disabled')

@case('E2E-002 Admin create -> QR/export/public -> edit -> archive (SIMULATED)')
def e2e_heritage(h):
    h.login('admin@pamana.test','AdminTesting123')
    p=h.site_form()
    p.locator('#heritageFormButton').click()
    p.locator('#heritageForm').evaluate("f=>f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))")
    h.wait_for_url('**/heritage-sites.html?created=pamana-test-heritage-plaza')
    assert h.calls('heritage_sites.insert')==1
    expect(p.locator('main')).to_contain_text('Pamana Test Heritage Plaza')
    # The production controller, payload and export run; offline test encoder is substituted.
    p.locator('[data-qr-slug="pamana-test-heritage-plaza"]').click()
    expect(p.locator('#qrModal')).to_be_visible()
    target=h.base+'/heritage.html?site=pamana-test-heritage-plaza'
    expect(p.locator('#qrCodeUrl')).to_have_text(target)
    expect(p.locator('#qrOpenPublicLink')).to_have_attribute('href',target)
    p.locator('#regenerateQrButton').click()
    expect(p.locator('#qrMessage')).to_contain_text('regenerated')
    with p.expect_download() as received: p.locator('#saveQrButton').click()
    download=received.value
    assert download.suggested_filename=='pamana-test-heritage-plaza-qr-code.png'
    download.save_as(str(OUT/'test-adapter-qr.png'))
    import cv2
    decoded,_,_=cv2.QRCodeDetector().detectAndDecode(cv2.imread(str(OUT/'test-adapter-qr.png')))
    assert decoded==target, decoded
    with p.expect_popup() as opened: p.locator('#printQrButton').click()
    popup=opened.value
    expect(popup.locator('h1')).to_have_text('Pamana Test Heritage Plaza')
    expect(popup.locator('img')).to_be_visible()
    assert popup.locator('img').evaluate('i=>i.complete && i.naturalWidth>0')
    popup.close()
    p.locator('#qrModal [data-bs-dismiss="modal"]').click()
    h.logout()
    h.go('heritage.html?site=pamana-test-heritage-plaza')
    expect(p.locator('#heritageName')).to_have_text('Pamana Test Heritage Plaza')
    expect(p.locator('#heritageLocation')).to_contain_text('Davao del Norte')
    expect(p.locator('#heritageDetails')).to_contain_text('This test record')
    h.login('admin@pamana.test','AdminTesting123')
    h.go('admin/heritage-form.html?id=2')
    expect(p.locator('#siteName')).to_have_value('Pamana Test Heritage Plaza')
    p.locator('#shortDescription').fill('An updated temporary description used to verify the edit workflow.')
    p.locator('#heritageFormButton').click()
    h.wait_for_url('**/heritage-sites.html?created=pamana-test-heritage-plaza')
    # Confirm the edit through an unauthenticated public page.
    h.logout(); h.go('heritage.html?site=pamana-test-heritage-plaza')
    expect(p.locator('#heritageDetails')).to_contain_text('updated temporary description')
    h.login('admin@pamana.test','AdminTesting123'); h.go('admin/heritage-sites.html')
    p.locator('[data-status-toggle][data-site-id="2"]').click()
    expect(p.locator('#pamanaConfirmTitle')).to_have_text('Archive Heritage Site?')
    p.locator('#pamanaConfirmAccept').click()
    expect(p.locator('#heritageManagementMessage')).to_contain_text('archived')
    assert len(h.state()['heritage_sites'])==2
    assert h.state()['heritage_sites'][1]['status']=='archived'
    h.logout(); h.go('browse.html')
    assert 'Pamana Test Heritage Plaza' not in p.locator('#heritageList').inner_text()
    h.go('heritage.html?site=pamana-test-heritage-plaza')
    expect(p.locator('#heritageDetailsMessage')).to_contain_text('not')

@case('Responsive pages at 320,375,430,768,1024,1440; no page overflow')
def responsive(h):
    h.seed_story(status='submitted',photo=True)
    paths=[('index.html',None),('browse.html',None),('heritage.html?site=fort-santiago-fixture',None),('story.html?id=1',None),('login.html',None),('register.html',None),('forgot-password.html',None),('reset-password.html',None),('contribute.html','contributor'),('contributor/dashboard.html','contributor'),('contributor/submissions.html','contributor'),('admin/login.html',None),('admin/dashboard.html','admin'),('admin/heritage-sites.html','admin'),('admin/heritage-form.html?id=1','admin'),('admin/submissions.html','admin'),('admin/review-story.html?id=1','admin')]
    checks=[]
    for path,role in paths:
        if path.startswith('story.html'): h.change("s.stories[0].status='published';s.stories[0].classification='Personal Recollection'")
        if path.startswith('admin/review'): h.change("s.stories[0].status='submitted'")
        h.role(role)
        p=h.go(path)
        for width in (320,375,430,768,1024,1440):
            p.set_viewport_size({'width':width,'height':900})
            p.wait_for_timeout(35)
            dims=p.evaluate('({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth})')
            checks.append({'page':path,'width':width,'scrollWidth':dims['scroll'],'clientWidth':dims['client']})
            assert dims['scroll']<=dims['client']+1, f'{path}: {width}px {dims}'
        if path in ('register.html','contribute.html','admin/review-story.html?id=1'):
            p.set_viewport_size({'width':375,'height':850})
            p.screenshot(path=str(OUT/(path.split('?')[0].replace('/','-').replace('.html','')+'-mobile.png')),full_page=True,timeout=8000,animations='disabled')
    (OUT/'responsive-results.json').write_text(json.dumps(checks,indent=2))

@case('Mobile confirmation fits and focus remains inside dialog; reduced motion respected')
def mobile_dialog(h):
    p=h.seed_story(); p.set_viewport_size({'width':320,'height':640})
    p.locator('#publishStoryButton').click()
    expect(p.locator('#pamanaConfirmCancel')).to_be_focused()
    box=p.locator('#pamanaConfirmModal .modal-content').bounding_box()
    assert box['x']>=0 and box['x']+box['width']<=321
    for _ in range(8): p.keyboard.press('Tab')
    assert p.evaluate("document.activeElement.closest('#pamanaConfirmModal')!==null")
    assert p.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches")
    p.screenshot(path=str(OUT/'confirmation-mobile.png'),full_page=False,timeout=8000,animations='disabled')
    p.keyboard.press('Escape')
    expect(p.locator('#publishStoryButton')).to_be_focused()


@case('Password maximum is enforced without silently truncating; spaces remain meaningful')
def password_boundaries(h):
    p=h.go('register.html')
    p.locator('#displayName').fill('Juan Dela Cruz'); p.locator('#registerEmail').fill('juan@example.com')
    password='Aa1'+'x'*62
    p.locator('#registerPassword').fill(password); p.locator('#confirmPassword').fill(password)
    p.locator('#registerButton').click()
    expect(p.locator('#registerPassword')).to_have_value(password)
    expect(p.locator('#registerPasswordFeedback')).to_contain_text('64')
    assert h.calls('auth.signUp')==0
    p.evaluate('window.scrollTo(0,0)')
    p.screenshot(path=str(OUT/'registration-validation.png'),full_page=True,timeout=8000,animations='disabled')

@case('Recovery context reload works without storing a raw token in UI marker')
def recovery_reload(h):
    p=h.go('reset-password.html#access_token=valid-test-recovery-token&type=recovery')
    expect(p.locator('#newPassword')).to_be_enabled()
    marker=p.evaluate("sessionStorage.getItem('pamanaRecoveryContext')")
    assert 'access_token' not in marker and 'valid-test-recovery-token' not in marker
    h.go('reset-password.html')
    expect(p.locator('#newPassword')).to_be_enabled()
    p.evaluate("const m=JSON.parse(sessionStorage.getItem('pamanaRecoveryContext'));m.until=0;sessionStorage.setItem('pamanaRecoveryContext',JSON.stringify(m))")
    h.go('reset-password.html')
    expect(p.locator('#newPassword')).to_be_disabled()

@case('Missing Bootstrap fails closed before any moderation write')
def no_bootstrap(h):
    p=h.seed_story(); p.evaluate('window.bootstrap=undefined')
    p.locator('#publishStoryButton').click()
    expect(p.locator('#pamanaGlobalFeedback')).to_contain_text('confirmation')
    expect(p.locator('#publishStoryButton')).to_be_enabled()
    assert h.calls('stories.update')==0

@case('Concurrent/already-reviewed save does not claim publication succeeded')
def concurrent_review(h):
    p=h.seed_story()
    h.change("s.stories[0].status='rejected'")
    p.locator('#publishStoryButton').click(); p.locator('#pamanaConfirmAccept').click()
    expect(p.locator('#reviewStoryMessage')).to_contain_text('already have been reviewed')
    expect(p.locator('#publishStoryButton')).to_be_enabled()
    assert h.state()['stories'][0]['status']=='rejected'

@case('Related photo upload, local preview, cancellation and confirmed removal')
def related_photo(h):
    h.role('admin'); p=h.go('admin/heritage-form.html?id=1')
    expect(p.locator('#siteName')).to_be_enabled()
    p.locator('#relatedPhoto').set_input_files(str(TESTS/'fixtures/valid-photo.png'))
    p.locator('#relatedPhotoCaption').fill('A temporary test photo')
    expect(p.locator('#relatedPhotoPreview')).to_be_visible()
    p.locator('#uploadRelatedPhotoButton').click()
    expect(p.locator('#relatedPhotosMessage')).to_contain_text('uploaded successfully')
    assert len(h.state()['media'])==1
    expect(p.locator('#heritageFormButton')).to_be_enabled()
    remove=p.locator('[data-related-photo-id]').first
    remove.click(); p.locator('#pamanaConfirmCancel').click()
    assert h.calls('storage.remove')==0
    remove.click(); p.locator('#pamanaConfirmAccept').click()
    expect(p.locator('#relatedPhotosMessage')).to_contain_text('removed successfully')
    assert len(h.state()['media'])==0

@case('Unexpected browser photo preparation failure still reports saved story')
def photo_unexpected(h):
    p=h.contributor_form()
    p.locator('#supportingPhoto').set_input_files(str(TESTS/'fixtures/valid-photo.png'))
    expect(p.locator('#supportingPhotoPreview')).to_be_visible()
    p.evaluate("()=>{createStoryImagePath=()=>{throw new Error('TEST ONLY: unavailable browser API')};}")
    p.locator('#submissionButton').click()
    expect(p.locator('#submissionMessage')).to_contain_text('story was submitted')
    assert len(h.state()['stories'])==1
    assert h.calls('storage.upload')==0

@case('Untrusted story content renders as text; public-name consent remains respected')
def safe_public_story(h):
    h.seed_story(status='published')
    h.change("s.stories[0].title='<img src=x onerror=alert(1)> A test story';s.stories[0].content='First line\\n\\n<script>window.xss=true</script>';s.stories[0].allow_public_name=false")
    h.role(None);p=h.go('story.html?id=1')
    expect(p.locator('#storyContent')).to_contain_text('<script>')
    assert p.locator('#storyContent script').count()==0
    assert p.locator('#storyTitle img').count()==0
    assert 'Juan Dela Cruz' not in p.locator('main').inner_text()
    assert not p.evaluate('window.xss || false')

@case('Edit loading error stops progress indicator and does not enable unsafe save')
def edit_load_error(h):
    h.role('admin');h.fail('heritage_sites.select')
    p=h.go('admin/heritage-form.html?id=1')
    expect(p.locator('#heritageFormMessage')).to_contain_text('internet connection')
    expect(p.locator('#heritageFormButton')).to_be_disabled()
    assert p.locator('#heritageForm').get_attribute('data-busy') is None
    expect(p.locator('#heritageFormMessage a')).to_contain_text('Heritage Management')


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--filter', default='')
    parser.add_argument('--chromium',default=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('google-chrome'))
    args=parser.parse_args()
    OUT.mkdir(exist_ok=True)
    handler=functools.partial(QuietHandler,directory=str(ROOT))
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_port}'
    results=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=args.chromium, headless=True,args=['--no-sandbox'])
        for i,(name,fn) in enumerate(CASES):
            if args.filter and args.filter.lower() not in name.lower(): continue
            h=None; start=time.monotonic()
            try:
                h=Harness(browser,base)
                h.page.set_default_timeout(6000)
                fn(h)
                assert not h.errors, '\n'.join(h.errors)
                status='PASS'; detail='All assertions passed in isolated test-double environment.'
            except Exception as error:
                status='FAIL'; detail=str(error)
                if h:
                    try: h.page.screenshot(path=str(OUT/f'failure-{i+1}.png'),full_page=True,timeout=8000,animations='disabled')
                    except Exception: pass
            result={'name':name,'status':status,'actual':detail,'seconds':round(time.monotonic()-start,2),'pageErrors':h.errors if h else [],'consoleLogs':[{'type':kind,'text':text,'count':count} for (kind,text),count in Counter((m['type'],m['text']) for m in h.logs).items()] if h else [],'blockedHosts':sorted(set(h.blocked)) if h else []}
            results.append(result)
            print(f'{status}: {name} ({result["seconds"]}s)',flush=True)
            if status=='FAIL': print(detail[:1500],flush=True)
            if h: h.context.close(reason='isolated test completed')
        browser.close()
    server.shutdown()
    report={'environment':{'scope':'ISOLATED BROWSER TESTS - NOT LIVE SUPABASE','timestampUTC':datetime.now(timezone.utc).isoformat(),'bootstrapRuntime':'5.3.3 unchanged','bootstrapTestSubstitute':'5.3.6','supabase':'stateful local fixture double; no RLS/email/service verification','qr':'offline MIT matrix test adapter, not production qrcodejs','allExternalRequestsBlocked':True,'navigation':'about:blank DOM with in-memory location/history and storage adapters; enterprise browser policy blocks navigation'},'passed':sum(r['status']=='PASS' for r in results),'failed':sum(r['status']=='FAIL' for r in results),'results':results}
    suffix='-'+re.sub('[^a-z0-9]+','-',args.filter.lower()).strip('-') if args.filter else ''
    (OUT/f'browser-results{suffix}.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({'passed':report['passed'],'failed':report['failed']}))
    raise SystemExit(1 if report['failed'] else 0)

if __name__=='__main__': main()
