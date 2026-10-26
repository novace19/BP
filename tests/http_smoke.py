"""HTTP scénáře pro čerstvou izolovanou testovací databázi. Jen standardní knihovna."""
import http.cookiejar
import re
import urllib.parse
import urllib.request
import urllib.error
import os
BASE = os.environ.get('TEST_URL', 'http://127.0.0.1:8080/')
checks = 0
class Browser:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
    def get(self, page='home'):
        try:
            response = self.client.open(BASE+'index.php?page='+page, timeout=15)
        except urllib.error.HTTPError as e:
            response = e
        return response.read().decode(), response.code
    def post(self, page, action, values=None, csrf=True):
        text, _ = self.get(page)
        data = dict(values or {}, action=action)
        if csrf:
            data['csrf'] = re.search(r'name="csrf" value="([a-f0-9]+)"', text).group(1)
        response = self.client.open(BASE+'index.php?page='+page, urllib.parse.urlencode(data).encode(), timeout=15)
        return response.read().decode(), response.code

def check(condition, name):
    global checks
    assert condition, name
    checks += 1
    print('OK', name)

admin = Browser()
text, _ = admin.get()
check('První spuštění' in text, 'first run opens installer')
text, _ = admin.post('install','install', {'name':'Test admin','email':'admin@example.test','password':'Admin-test-1234'})
check('Správce je vytvořený' in text, 'admin setup')
text, _ = admin.get('install')
check('Vítejte zpátky' in text, 'installer locked')
text, _ = admin.post('login','login', {'email':'admin@example.test','password':'Admin-test-1234'})
check('Jste přihlášeni' in text and 'Administrace' in text, 'admin login')
for page in ['home','schedule','trainers','reservations','activity','profile','admin','admin-sessions','admin-lessons','admin-trainers','admin-users','admin-reservations']:
    text, code = admin.get(page)
    check(code == 200 and 'Databáze zatím není připravená' not in text, 'render '+page)
client = Browser()
text, _ = client.post('register','register', {'name':'<script>alert(1)</script>','email':'client@example.test','password':'Client-test-1234','role':'admin'})
check('Registrace je hotová' in text, 'client registration')
text, _ = client.post('login','login', {'email':'client@example.test','password':'wrong-password'})
check('Nesprávný e-mail' in text, 'invalid login rejected')
text, _ = client.post('login','login', {'email':'client@example.test','password':'Client-test-1234'})
check('&lt;script&gt;alert(1)&lt;/script&gt;' in text and '<script>alert(1)</script>' not in text, 'stored HTML escaped')
text, code = client.get('admin-users')
check(code == 403, 'registration cannot grant admin')
text, _ = client.get('schedule')
sid = re.search(r'name="session_id" value="(\d+)"', text).group(1)
text, _ = client.post('schedule','book', {'session_id':sid}, csrf=False)
check('Platnost formuláře vypršela' in text, 'CSRF rejected')
text, _ = client.post('schedule','book', {'session_id':sid})
check('Místo na lekci máte rezervované' in text, 'HTTP booking')
bid = re.search(r'name="reservation_id" value="(\d+)"', text).group(1)
other = Browser()
other.post('register','register', {'name':'Other client','email':'other@example.test','password':'Other-test-1234'})
other.post('login','login', {'email':'other@example.test','password':'Other-test-1234'})
text, _ = other.post('reservations','cancel_booking', {'reservation_id':bid})
check('Tato rezervace vám nepatří' in text, 'HTTP ownership enforced')
text, _ = other.post('reservations','cancel_session', {'session_id':sid})
check('K této akci nemáte oprávnění' in text, 'admin POST rejected for client')
text, _ = client.post('reservations','cancel_booking', {'reservation_id':bid})
check('Rezervace je zrušená' in text, 'HTTP cancellation')
text, _ = admin.post('admin-users','save_user', {'id':1,'role':'client'})
check('Svůj správcovský účet nemůžete' in text, 'own admin lockout prevented')
text, _ = client.post('profile','password', {'current_password':'Client-test-1234','password':' New-client-1234 '})
check('Heslo je změněné' in text, 'password change')
client.post('profile','logout')
text, _ = client.post('login','login', {'email':'client@example.test','password':' New-client-1234 '})
check('Jste přihlášeni' in text, 'new password works')
text, _ = admin.post('admin-trainers','save_trainer', {'id':0,'name':'HTTP trenér','specialty':'Kondice','bio':'Popis trenéra','active':1})
check('Trenér je uložený' in text, 'trainer creation via HTTP')
tid = re.search(r'HTTP trenér.*?edit=(\d+)', text, re.S).group(1)
text, _ = admin.post('admin-trainers','save_trainer', {'id':tid,'name':'Upravený trenér','specialty':'Síla','bio':'Nový popis'})
check('Upravený trenér' in text and 'Neaktivní' in text, 'trainer edit and archive')
text, _ = admin.post('admin-lessons','save_lesson', {'id':0,'name':'HTTP lekce','description':'Popis lekce','kind':'group','duration_minutes':45,'active':1})
check('Lekce je uložená' in text, 'lesson creation via HTTP')
lid = re.search(r'HTTP lekce.*?edit=(\d+)', text, re.S).group(1)
text, _ = admin.post('admin-lessons','save_lesson', {'id':lid,'name':'Upravená lekce','description':'Nový popis','kind':'personal','duration_minutes':60})
check('Upravená lekce' in text and 'Neaktivní' in text, 'lesson edit and archive')
text, _ = admin.get('admin-users')
uid = re.search(r'client@example.test.*?name="id" value="(\d+)"', text, re.S).group(1)
text, _ = admin.post('admin-users','save_user', {'id':uid,'role':'client'})
check('Uživatel je uložený' in text, 'account deactivation')
text, _ = client.get('profile')
check('Nejprve se přihlaste' in text, 'deactivation invalidates existing session')
text, code = client.get('no-such-page')
check(code == 404, 'unknown page 404')
print(f'{checks} HTTP checks passed')
