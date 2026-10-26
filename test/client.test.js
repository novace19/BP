import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('klientské šablony vykreslí obrazovky a kódují nedůvěryhodný text',()=>{
  // This checks JS templates, not layout or a real browser accessibility tree.
  const elements=new Map();
  const el=key=>{if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',hidden:true,open:false,addEventListener(){},focus(){},close(){this.open=false;},showModal(){this.open=true;}});return elements.get(key);};
  const context=vm.createContext({console,Intl,Date,URL,setTimeout,clearTimeout,document:{querySelector:el,addEventListener(){}},fetch(){throw new Error('Network not expected');}});
  const script=readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/\ninit\(\);\s*$/,'');
  vm.runInContext(script,context);
  vm.runInContext(`state.user={id:1,name:'<img src=x onerror=alert(1)>',email:'a@test.cz',role:'admin'};
    state.trainers=[{id:1,name:'Trenér',specialty:'Síla',bio:'Profil',active:1}];
    state.lessons=[{id:1,name:'Jóga',description:'Popis',kind:'group',color:'purple',duration:60,active:1}];
    state.rooms=[{id:1,name:'Studio',capacity:10}];
    state.sessions=[{id:1,name:'Jóga',description:'<script>alert(1)</script>',kind:'group',color:'purple',trainer_name:'Trenér',room_name:'Studio',trainer_id:1,capacity:10,booked:0,start_at:Date.now()+86400000,end_at:Date.now()+90000000,status:'published'}];
    state.adminUsers=[{id:1,name:'Správce',email:'admin@test.cz',role:'admin',active:1}];`,context);
  for(const page of ['overview','schedule','bookings','activities','trainers','profile','admin']) {
    vm.runInContext(`state.page='${page}';render();`,context);
    const html=el('#app').innerHTML;assert.match(html,/<main id="main"/);assert.ok(!html.includes('<img src=x onerror='),page);
    assert.ok(html.includes('&lt;img'),page);
  }
  for(const tab of ['sessions','lessons','trainers','rooms','users','reservations','visits','audit']) {
    vm.runInContext(`state.adminTab='${tab}';render();`,context);assert.match(el('#app').innerHTML,/<table>/);
  }
  for(const entity of ['sessions','lessons','trainers','rooms','visits','reservations']) {
    vm.runInContext(`editModal('${entity}',0)`,context);assert.match(el('#modal-content').innerHTML,/<form data-form="admin"/);
  }
  vm.runInContext('detail(1)',context);assert.ok(!el('#modal-content').innerHTML.includes('<script>'));
  vm.runInContext("authModal('register')",context);assert.match(el('#modal-content').innerHTML,/minlength="12"/);
});
