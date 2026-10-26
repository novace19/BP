/* Client-side rendering. All authoritative access and capacity checks run on the server. */
const $ = (s) => document.querySelector(s);
const escape = (s='') => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={home:'M3 10l9-7 9 7v10H3z M9 20v-7h6v7',calendar:'M5 5h14v16H5z M8 2v6 M16 2v6 M5 10h14',ticket:'M4 5h16v5a2 2 0 000 4v5H4v-5a2 2 0 000-4z M15 6v12',chart:'M4 20V9 M11 20V4 M18 20v-7',users:'M16 21v-3a4 4 0 00-4-4H6a4 4 0 00-4 4v3 M9 10a4 4 0 100-8 4 4 0 000 8 M17 3a4 4 0 010 8 M22 21v-3a4 4 0 00-3-4',user:'M20 21v-2a7 7 0 00-14 0v2 M13 11a4 4 0 100-8 4 4 0 000 8',settings:'M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2 M16 12a4 4 0 11-8 0 4 4 0 018 0',arrow:'M4 12h15 M13 6l6 6-6 6',clock:'M12 8v5l3 2 M21 12a9 9 0 11-18 0 9 9 0 0118 0',pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1116 0z M15 10a3 3 0 11-6 0 3 3 0 016 0',plus:'M12 5v14 M5 12h14',check:'M5 12l4 4L20 5',logout:'M9 4H3v16h6 M8 12h13 M16 7l5 5-5 5',chevron:'M9 5l7 7-7 7',close:'M6 6l12 12 M18 6L6 18',bolt:'M13 2L4 14h7l-1 8 10-13h-7z',dumbbell:'M6 5v14 M3 8v8 M18 5v14 M21 8v8 M6 12h12',leaf:'M20 4C6 2 2 13 8 18S22 14 20 4z M6 21l10-12'};
const icon=(name)=>`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[name]||icons.bolt}"/></svg>`;
const fmt=(n,options)=>new Intl.DateTimeFormat('cs-CZ',options).format(new Date(n));
const date=(n)=>fmt(n,{day:'numeric',month:'long'});
const time=(n)=>fmt(n,{hour:'2-digit',minute:'2-digit'});
const shortDate=(n)=>fmt(n,{day:'numeric',month:'numeric',year:'numeric'});
const dateKey=(n)=>{const d=new Date(n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const localInput=(n)=>`${dateKey(n)}T${new Date(n).toTimeString().slice(0,5)}`;
const weekStart=()=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-(d.getDay()+6)%7);return d.getTime();};
const state={user:null,csrf:'',page:'overview',sessions:[],lessons:[],trainers:[],rooms:[],bookings:[],visits:[],adminUsers:[],adminBookings:[],adminVisits:[],audit:[],adminTab:'sessions',week:weekStart(),day:'',kind:'all',trainer:'',busy:false};
const nav=[['overview','home','Přehled'],['schedule','calendar','Rozvrh lekcí'],['bookings','ticket','Moje rezervace'],['activities','chart','Moje aktivity'],['trainers','users','Naši trenéři']];
const labels={draft:'Koncept',published:'Publikováno',cancelled:'Zrušeno',active:'Potvrzeno',client:'Klient',admin:'Správce',group:'Skupinová lekce',personal:'Osobní trénink'};

async function api(path,{method='GET',body}={}) {
  const response=await fetch('/api'+path,{method,headers:method==='GET'?{}:{'Content-Type':'application/json','X-CSRF-Token':state.csrf},body:body===undefined?undefined:JSON.stringify(body)});
  const result=await response.json();if(result.csrf)state.csrf=result.csrf;
  if(!response.ok) {const error=new Error(result.error||'Požadavek se nezdařil.');error.status=response.status;throw error;}
  return result;
}
let toastTimer;
function toast(message) {$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,5000);}
async function refresh() {
  const me=await api('/me');state.user=me.user;
  const [catalogs,sessions]=await Promise.all([api('/catalogs'),api('/schedule')]);Object.assign(state,catalogs,{sessions});
  if(state.user) [state.bookings,state.visits]=await Promise.all([api('/reservations'),api('/visits')]);
  else {state.bookings=[];state.visits=[];}
  if(state.user?.role==='admin') [state.adminUsers,state.adminBookings,state.adminVisits,state.audit]=await Promise.all([api('/admin/users'),api('/admin/reservations'),api('/admin/visits'),api('/admin/audit')]);
  else {state.adminUsers=[];state.adminBookings=[];state.adminVisits=[];state.audit=[];}
}
function empty(title,detail,button='') {return `<div class="empty">${icon('calendar')}<h3>${escape(title)}</h3><p>${escape(detail)}</p>${button}</div>`;}
const navButton=(page,name,label)=>`<button class="nav-link ${state.page===page?'selected':''}" data-page="${page}" ${state.page===page?'aria-current="page"':''}>${icon(name)}<span>${label}</span>${state.page===page?'<span class="nav-dot"></span>':''}</button>`;
function render() {
  const user=state.user;
  const title=nav.find(x=>x[0]===state.page)?.[2]||({profile:'Můj profil',admin:'Správa centra'}[state.page]);
  const initials=(user?.name||'Návštěvník').split(' ').slice(0,2).map(s=>s[0]).join('');
  $('#app').innerHTML=`<aside class="sidebar"><a class="brand" href="#overview" aria-label="Forma úvod"><span class="brand-symbol">f<span>.</span></span><span>forma<span class="brand-dot">.</span><small>FITNESS & WELLNESS</small></span></a>
  <div class="side-label">VAŠE MÍSTO PRO POHYB</div><nav aria-label="Hlavní navigace">${nav.map(n=>navButton(...n)).join('')}${user?.role==='admin'?`<div class="nav-divider"></div>${navButton('admin','settings','Správa centra')}`:''}</nav>
  <div class="side-bottom"><div class="motivation"><span class="spark">✦</span><strong>Malé kroky.<br>Velká změna.</strong><p>Najděte si čas pro sebe.<br>My vám podržíme místo.</p><button class="btn lime" data-page="schedule">Najít svou lekci ${icon('arrow')}</button></div>
  ${user?`<button class="account" data-page="profile"><span class="avatar">${escape(initials)}</span><span><strong>${escape(user.name)}</strong><small>${labels[user.role]}</small></span>${icon('chevron')}</button>`:`<button class="btn dark wide" data-action="login">Přihlásit se ${icon('arrow')}</button>`}</div></aside>
  <div class="workspace"><header class="topbar"><span class="breadcrumb">Moje fitness <span>/</span> <strong>${escape(title)}</strong></span><div class="top-actions"><span class="today">${fmt(Date.now(),{weekday:'long',day:'numeric',month:'long'})}</span>${user?`<button class="icon-button" data-page="profile" aria-label="Můj profil" title="Můj profil">${icon('user')}</button><button class="icon-button" data-action="logout" aria-label="Odhlásit se" title="Odhlásit se">${icon('logout')}</button>`:`<button class="btn small primary" data-action="register">Vytvořit účet</button>`}</div></header>
  <main id="main" tabindex="-1">${pageContent()}</main><footer>Forma fitness centrum <span>Časy: ${escape(Intl.DateTimeFormat().resolvedOptions().timeZone)} · Bakalářský prototyp</span></footer></div>`;
  document.title=`${title} | Forma fitness`;
}
function pageHead(kicker,title,detail,action='') {return `<div class="page-heading"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${detail}</p></div>${action}</div>`;}
function pageContent() {
  if(state.page==='overview')return overview();
  if(state.page==='schedule')return schedule();
  if(state.page==='trainers')return trainers();
  if(!state.user)return pageHead('JENOM PRO VÁS','Váš pohyb. Na jednom místě.','Přihlaste se a mějte své rezervace i aktivity vždy po ruce.')+empty('Začněte svým účtem','Registrace je zdarma a zabere jen chvilku.',`<button class="btn primary" data-action="login">Přihlásit se</button>`);
  if(state.page==='bookings')return bookings();
  if(state.page==='activities')return activities();
  if(state.page==='profile')return profile();
  if(state.page==='admin'&&state.user.role==='admin')return admin();
  return empty('Tato stránka není dostupná','Zvolte jinou položku v navigaci.');
}
function overview() {
  const first=escape(state.user?.name.split(' ')[0]||'sportovče');
  const upcoming=state.bookings.filter(b=>b.status==='active'&&b.start_at>Date.now()).sort((a,b)=>a.start_at-b.start_at);
  const monthVisits=state.visits.filter(v=>new Date(v.visited_at).getMonth()===new Date().getMonth()&&new Date(v.visited_at).getFullYear()===new Date().getFullYear()).length;
  const sessions=state.sessions.filter(s=>s.status==='published'&&s.start_at>Date.now()).slice(0,3);
  return pageHead('VÁŠ OSOBNÍ PROSTOR',`Ahoj, ${first}<span class="greeting">✦</span>`,'Každý pohyb se počítá. Co pro sebe uděláte dnes?')+
  `<section class="hero"><div class="hero-copy"><span class="tag">VÁŠ ČAS. VAŠE TEMPO.</span><h2>Silnější tělo.<br>Lehčí hlava.</h2><p>Objevte lekce, které vás budou bavit.<br>Rezervujte si místo a udělejte první krok.</p><button class="btn lime" data-page="schedule">Prozkoumat rozvrh ${icon('arrow')}</button></div><div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><span class="art-plus">✦</span><div class="art-center">MOVE<br><em>YOUR</em><br>WAY.</div><span class="art-dot"></span></div></section>
  <div class="stats-grid"><div class="stat"><span class="stat-icon purple">${icon('ticket')}</span><div><span>Nadcházející rezervace</span><strong>${upcoming.length}<small>naplánovaných lekcí</small></strong></div></div><div class="stat"><span class="stat-icon green">${icon('chart')}</span><div><span>Návštěvy tento měsíc</span><strong>${monthVisits}<small>chvil pro sebe</small></strong></div></div><div class="stat"><span class="stat-icon orange">${icon('bolt')}</span><div><span>Celkem absolvováno</span><strong>${state.visits.length}<small>návštěv centra</small></strong></div></div></div>
  <div class="section-heading"><div><h2>Váš další trénink</h2><p>Malý plán, dobrý pocit.</p></div><button class="text-button" data-page="bookings">Všechny rezervace ${icon('arrow')}</button></div>
  ${upcoming[0]?`<div class="next-session"><div class="next-date"><strong>${new Date(upcoming[0].start_at).getDate()}</strong><span>${fmt(upcoming[0].start_at,{month:'short'})}</span></div><div><span class="subtle">${labels[upcoming[0].kind]}</span><h3>${escape(upcoming[0].name)}</h3><p>${time(upcoming[0].start_at)} · ${escape(upcoming[0].trainer_name)} · ${escape(upcoming[0].room_name)}</p></div><span class="badge green">${icon('check')} Potvrzeno</span></div>`:empty('Místo pro další dobrý začátek','Zatím nemáte naplánovaný trénink. Vyberte si z rozvrhu.',`<button class="btn outline" data-page="schedule">Vybrat lekci ${icon('arrow')}</button>`)}
  <div class="section-heading"><div><h2>Najděte svůj pohyb</h2><p>Jóga, síla i osobní přístup. Co vás láká?</p></div><button class="text-button" data-page="schedule">Celý rozvrh ${icon('arrow')}</button></div><div class="class-grid">${sessions.map(sessionCard).join('')||empty('Rozvrh se připravuje','Nové termíny tu budou brzy.')}</div>`;
}
function sessionCard(s) {
  const free=Math.max(0,s.capacity-s.booked),own=!!s.reservation_id,past=s.start_at<=Date.now(),off=s.status!=='published'||past;
  return `<article class="class-card"><div class="class-banner ${escape(s.color)}"><span class="class-glyph">${icon(s.kind==='personal'?'dumbbell':s.color==='purple'?'leaf':s.color==='orange'?'bolt':'dumbbell')}</span><span class="badge white">${labels[s.kind]}</span></div><div class="class-body"><div class="class-date">${escape(fmt(s.start_at,{weekday:'short',day:'numeric',month:'short'}))}<span>${time(s.start_at)}–${time(s.end_at)}</span></div><h3>${escape(s.name)}</h3><p class="trainer-line">${icon('user')} ${escape(s.trainer_name)}</p><p class="trainer-line">${icon('pin')} ${escape(s.room_name)} <span>· ${Math.round((s.end_at-s.start_at)/60000)} min</span></p><div class="class-bottom"><span class="availability ${!free?'full':''}">${own?'Vaše místo je jisté':off?labels[s.status]||'Ukončeno':free?`${free} ${free===1?'volné místo':free<5?'volná místa':'volných míst'}`:'Plně obsazeno'}</span><button class="btn ${own?'soft':'primary'} small" data-detail="${s.id}" ${(!free&&!own)||off?'disabled':''}>${own?'Moje rezervace':'Rezervovat'} ${icon(own?'check':'plus')}</button></div></div></article>`;
}
function schedule() {
  const weekEnd=new Date(state.week);weekEnd.setDate(weekEnd.getDate()+7);
  const rows=state.sessions.filter(s=>s.status==='published'&&s.start_at>Date.now()&&s.start_at>=state.week&&s.start_at<weekEnd.getTime()&&(!state.day||dateKey(s.start_at)===state.day)&&(state.kind==='all'||s.kind===state.kind)&&(!state.trainer||s.trainer_id===Number(state.trainer)));
  const days=Array.from({length:7},(_,n)=>{const d=new Date(state.week);d.setDate(d.getDate()+n);return d;});
  return pageHead('ČAS NA POHYB','Rozvrh lekcí','Vyberte si, co vám sedí. Své místo máte na pár kliknutí.')+
  `<section class="schedule-panel"><div class="schedule-toolbar"><div class="segmented" role="group" aria-label="Typ lekce">${[['all','Všechny lekce'],['group','Skupinové'],['personal','Osobní tréninky']].map(([k,label])=>`<button data-kind="${k}" class="${state.kind===k?'active':''}" aria-pressed="${state.kind===k}">${label}</button>`).join('')}</div><label class="filter-label">Trenér <select id="trainer-filter"><option value="">Všichni trenéři</option>${state.trainers.map(t=>`<option value="${t.id}" ${state.trainer===String(t.id)?'selected':''}>${escape(t.name)}</option>`).join('')}</select></label></div>
  <div class="week-heading"><div><h2>${date(state.week)} – ${date(days[6].getTime())}</h2><span>${new Date(state.week).getFullYear()}</span></div><div class="week-controls"><button class="btn outline small" data-week="0">Tento týden</button><button class="icon-button" data-week="-1" aria-label="Předchozí týden">‹</button><button class="icon-button" data-week="1" aria-label="Další týden">›</button></div></div>
  <div class="week-days"><button class="day ${!state.day?'active':''}" data-day=""><span>CELÝ</span><strong>Týden</strong></button>${days.map(d=>`<button class="day ${state.day===dateKey(d)?'active':''} ${dateKey(d)===dateKey(Date.now())?'is-today':''}" data-day="${dateKey(d)}"><span>${fmt(d,{weekday:'short'})}</span><strong>${d.getDate()}</strong></button>`).join('')}</div></section>
  <div class="results-heading"><span>${rows.length} ${rows.length===1?'dostupný termín':'dostupných termínů'}</span><span>${icon('clock')} Storno nejpozději 2 hodiny předem</span></div><div class="class-grid">${rows.map(sessionCard).join('')||empty('Tady je zatím volno','Zkuste jiný den, trenéra nebo další týden.',`<button class="btn outline" data-action="reset-filters">Zrušit filtry</button>`)}</div>`;
}
function bookings() {
  const upcoming=state.bookings.filter(b=>b.status==='active'&&b.start_at>Date.now()).sort((a,b)=>a.start_at-b.start_at);
  const history=state.bookings.filter(b=>!upcoming.some(u=>u.id===b.id));
  return pageHead('VÁŠ PLÁN','Moje rezervace','Všechno, na co se můžete těšit. A co už máte za sebou.',`<button class="btn primary" data-page="schedule">${icon('plus')} Nová rezervace</button>`)+
  `<div class="section-heading"><h2>Nadcházející <span class="count">${upcoming.length}</span></h2></div>${bookingList(upcoming)}<div class="section-heading"><h2>Historie rezervací</h2></div>${bookingList(history)}`;
}
function bookingList(rows) {
  if(!rows.length)return empty('Žádné rezervace','Až si vyberete lekci, najdete ji právě tady.');
  return `<div class="booking-list">${rows.map(b=>`<article class="booking-row"><div class="booking-mark ${escape(b.color)}">${icon(b.kind==='personal'?'dumbbell':'calendar')}</div><div class="booking-title"><h3>${escape(b.name)}</h3><p>${date(b.start_at)} · ${time(b.start_at)}–${time(b.end_at)}</p><small>${escape(b.trainer_name)} · ${escape(b.room_name)}</small></div><span class="badge ${b.status==='cancelled'?'grey':b.visit_id?'purple':'green'}">${b.status==='cancelled'?'Zrušeno':b.visit_id?'Absolvováno':b.start_at<Date.now()?'Ukončeno':'Potvrzeno'}</span>${b.status==='active'&&!b.visit_id&&b.start_at>Date.now()?Date.now()<=b.start_at-7200000?`<button class="btn outline small" data-cancel="${b.id}">Zrušit</button>`:'<span class="subtle">Storno lhůta uplynula</span>':''}</article>`).join('')}</div>`;
}
function activities() {
  const now=new Date(),months=Array.from({length:6},(_,i)=>new Date(now.getFullYear(),now.getMonth()-5+i,1));
  const counts=months.map(m=>state.visits.filter(v=>new Date(v.visited_at).getMonth()===m.getMonth()&&new Date(v.visited_at).getFullYear()===m.getFullYear()).length);
  const max=Math.max(1,...counts);
  // Bar heights use fixed classes, avoiding inline styles under the strict CSP.
  return pageHead('KAŽDÝ KROK SE POČÍTÁ','Moje aktivity','Přehled skutečných návštěv a absolvovaných tréninků.')+
  `<div class="activity-layout"><section class="panel"><div class="section-heading"><h2>Vaše pravidelnost</h2><span class="subtle">Posledních 6 měsíců</span></div><div class="chart" role="img" aria-label="Návštěvy za posledních šest měsíců: ${escape(months.map((m,i)=>`${fmt(m,{month:'long'})} ${counts[i]}`).join(', '))}">${months.map((m,i)=>`<div class="chart-col"><strong>${counts[i]}</strong><div class="bar-track"><div class="bar height-${Math.round(counts[i]/max*10)}"></div></div><span>${fmt(m,{month:'short'})}</span></div>`).join('')}</div></section><section class="activity-total"><span class="spark">✦</span><span>VÁŠ POHYB V ČÍSLECH</span><strong>${state.visits.length}</strong><h3>návštěv centra</h3><p>Účast eviduje správce centra.<br>Rezervace sama o sobě není návštěva.</p></section></div>
  <div class="section-heading"><h2>Deník návštěv</h2></div>${state.visits.length?`<div class="booking-list">${state.visits.map(v=>`<article class="booking-row"><span class="booking-mark green">${icon('check')}</span><div class="booking-title"><h3>${escape(v.lesson_name||'Návštěva posilovny')}</h3><p>${date(v.visited_at)} · ${time(v.visited_at)}</p>${v.note?`<small>${escape(v.note)}</small>`:''}</div><span class="badge green">Absolvováno</span></article>`).join('')}</div>`:empty('Váš příběh teprve začíná','Po první zaznamenané návštěvě se zde objeví vaše aktivita.')}`;
}
function trainers() {return pageHead('LIDÉ, KTEŘÍ VÁS POSUNOU','Naši trenéři','Zkušenosti, podpora a osobní přístup. Seznamte se.')+`<div class="trainer-grid">${state.trainers.filter(t=>t.active).map((t,i)=>`<article class="trainer-card"><div class="trainer-avatar ${['purple','green','orange'][i%3]}">${escape(t.name.split(' ').map(x=>x[0]).join(''))}<span>✦</span></div><span class="eyebrow">${escape(t.specialty||'TRENÉR CENTRA')}</span><h2>${escape(t.name)}</h2><p>${escape(t.bio)}</p><button class="text-button" data-trainer="${t.id}">Lekce s trenérem ${icon('arrow')}</button></article>`).join('')||empty('Tým připravujeme','Trenéry sem doplní správce centra.')}</div>`;}
function profile() {return pageHead('VAŠE ÚDAJE','Můj profil','Udržujte svůj účet aktuální a v bezpečí.')+`<div class="profile-grid"><section class="panel"><h2>Osobní údaje</h2><form data-form="profile">${field('Jméno a příjmení','name','text',state.user.name)}<label>E-mail<input type="email" value="${escape(state.user.email)}" disabled></label><p class="hint">Změnu přihlašovacího e-mailu řešte se správcem.</p><div class="form-error" role="alert"></div><button class="btn primary" type="submit">Uložit změny</button></form></section><section class="panel"><h2>Změnit heslo</h2><form data-form="password">${field('Současné heslo','current_password','password','',true,'current-password')}${field('Nové heslo · minimálně 12 znaků','password','password','',true,'new-password')}<p class="hint">Po změně budou ostatní přihlášená zařízení odhlášena.</p><div class="form-error" role="alert"></div><button class="btn outline" type="submit">Změnit heslo</button></form></section></div>`;}
function field(label,name,type='text',value='',required=true,autocomplete='') {return `<label>${label}<input name="${name}" type="${type}" value="${escape(value)}" ${required?'required':''} ${autocomplete?`autocomplete="${autocomplete}"`:''} ${type==='password'&&autocomplete==='new-password'?'minlength="12" maxlength="128"':''} ${type==='number'?'min="1" max="500"':''}></label>`;}
function selectField(label,name,rows,value,allowBlank=false) {return `<label>${label}<select name="${name}" required>${allowBlank?'<option value="">Vyberte…</option>':''}${rows.map(([id,label])=>`<option value="${escape(id)}" ${String(id)===String(value)?'selected':''}>${escape(label)}</option>`).join('')}</select></label>`;}
function textarea(label,name,value='') {return `<label>${label}<textarea name="${name}" rows="3" maxlength="2000">${escape(value)}</textarea></label>`;}
const editButton=(entity,id,label='Upravit')=>`<button class="btn outline small" data-edit="${entity}" data-id="${id}">${label}</button>`;
function adminTable(head,rows) {return `<div class="table-wrap"><table><thead><tr>${head.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${head.length}">Zatím žádné záznamy.</td></tr>`}</tbody></table></div>`;}
const adminTabs={sessions:'Termíny',lessons:'Lekce',trainers:'Trenéři',rooms:'Sály',users:'Uživatelé',reservations:'Rezervace',visits:'Návštěvy',audit:'Historie změn'};
function admin() {
  const tab=state.adminTab,canAdd=['sessions','lessons','trainers','rooms','visits','reservations'].includes(tab);
  let body='';
  if(tab==='sessions')body=adminTable(['Lekce','Začátek','Trenér a sál','Místa','Stav','Akce'],state.sessions.slice().reverse().map(s=>[escape(s.name),`${shortDate(s.start_at)}<br>${time(s.start_at)}`,`${escape(s.trainer_name)}<br><small>${escape(s.room_name)}</small>`,`${s.booked} / ${s.capacity}`,`<span class="badge ${s.status==='published'?'green':'grey'}">${labels[s.status]}</span>`,s.start_at>Date.now()&&s.status!=='cancelled'?editButton('sessions',s.id):'—']));
  if(tab==='lessons')body=adminTable(['Lekce','Typ','Délka','Aktivní','Akce'],state.lessons.map(l=>[escape(l.name),labels[l.kind],`${l.duration} min`,l.active?'Ano':'Ne',editButton('lessons',l.id)]));
  if(tab==='trainers')body=adminTable(['Jméno','Specializace','Aktivní','Akce'],state.trainers.map(t=>[escape(t.name),escape(t.specialty),t.active?'Ano':'Ne',editButton('trainers',t.id)]));
  if(tab==='rooms')body=adminTable(['Sál','Maximální kapacita','Akce'],state.rooms.map(r=>[escape(r.name),r.capacity,editButton('rooms',r.id)]));
  if(tab==='users')body=adminTable(['Jméno','E-mail','Role','Aktivní','Akce'],state.adminUsers.map(u=>[escape(u.name),escape(u.email),labels[u.role],u.active?'Ano':'Ne',editButton('users',u.id)]));
  if(tab==='reservations')body=adminTable(['Klient','Lekce','Termín','Stav','Akce'],state.adminBookings.map(b=>[escape(b.user_name),escape(b.name),`${shortDate(b.start_at)} ${time(b.start_at)}`,b.status==='cancelled'?'Zrušeno':b.visit_id?'Absolvováno':'Aktivní',b.status==='active'&&!b.visit_id?`${Date.now()>=b.start_at-1800000?`<button class="btn soft small" data-attend="${b.id}">Potvrdit účast</button>`:''} <button class="btn outline small" data-cancel="${b.id}">Zrušit</button>`:'—']));
  if(tab==='visits')body=adminTable(['Klient','Návštěva','Vazba na rezervaci','Poznámka'],state.adminVisits.map(v=>[escape(v.user_name),`${shortDate(v.visited_at)} ${time(v.visited_at)}`,v.reservation_id?`#${v.reservation_id}`:'Volný vstup',escape(v.note)]));
  if(tab==='audit')body=adminTable(['Čas','Správce','Operace','Objekt'],state.audit.map(a=>[`${shortDate(a.created_at)} ${time(a.created_at)}`,escape(a.actor_name),escape(a.action),`${escape(a.entity)} #${a.entity_id}`]));
  return pageHead('VŠECHNO POD KONTROLOU','Správa centra','Rozvrh, lidé a rezervace přehledně na jednom místě.',canAdd?`<button class="btn primary" data-edit="${tab}" data-id="0">${icon('plus')} Přidat záznam</button>`:'')+
  `<nav class="admin-tabs" aria-label="Evidence centra">${Object.entries(adminTabs).map(([key,label])=>`<button data-admin-tab="${key}" class="${tab===key?'active':''}" ${tab===key?'aria-current="page"':''}>${label}</button>`).join('')}</nav><section class="admin-panel">${tab==='sessions'?'<p class="admin-note">Při přesunu nebo zrušení termínu informujte klienty. Aplikace automaticky neposílá e-maily.</p>':''}${body}</section>`;
}
function showModal(title,content) {$('#modal-content').innerHTML=`<div class="modal-header"><h2 id="modal-title">${title}</h2><button class="icon-button" data-action="close-modal" aria-label="Zavřít">${icon('close')}</button></div>${content}`;if(!$('#modal').open)$('#modal').showModal();}
function authModal(kind) {
  const register=kind==='register';
  showModal(register?'Váš dobrý začátek':'Vítejte zpátky',`<p class="modal-intro">${register?'Vytvořte si účet a najděte svůj pohyb.':'Přihlaste se ke svým rezervacím a aktivitám.'}</p><form data-form="${kind}">${register?field('Jméno a příjmení','name','text','',true,'name'):''}${field('E-mail','email','email','',true,'username')}${field(register?'Heslo · minimálně 12 znaků':'Heslo','password','password','',true,register?'new-password':'current-password')}<div class="form-error" role="alert"></div><button class="btn primary wide" type="submit">${register?'Vytvořit účet':'Přihlásit se'} ${icon('arrow')}</button></form><p class="modal-switch">${register?'Už máte účet?':'Ještě nemáte účet?'} <button class="text-button" data-action="${register?'login':'register'}">${register?'Přihlásit se':'Zaregistrovat se'}</button></p>`);
}
function detail(id) {
  const s=state.sessions.find(s=>s.id===id);if(!s)return;
  showModal(escape(s.name),`<span class="badge ${escape(s.color)}">${labels[s.kind]}</span><p class="detail-description">${escape(s.description)}</p><div class="detail-grid"><div>${icon('calendar')} ${date(s.start_at)}</div><div>${icon('clock')} ${time(s.start_at)}–${time(s.end_at)}</div><div>${icon('user')} ${escape(s.trainer_name)}</div><div>${icon('pin')} ${escape(s.room_name)}</div></div><p class="hint">Bezplatné storno nejpozději 2 hodiny před začátkem. Rezervace platí až po potvrzení serverem.</p>${s.reservation_id?'<p class="success-note">Na tuto lekci už máte rezervaci.</p><button class="btn primary wide" data-page="bookings">Moje rezervace</button>':`<form data-form="book" data-session="${s.id}"><div class="form-error" role="alert"></div><button class="btn primary wide" type="submit">Potvrdit rezervaci ${icon('check')}</button></form>`}`);
}
function editModal(entity,id) {
  let item={},fields='';
  const activeOptions=[[1,'Ano'],[0,'Ne']];
  if(entity==='lessons') {item=state.lessons.find(x=>x.id===id)||{duration:60,kind:'group',color:'purple',active:1};fields=field('Název lekce','name','text',item.name)+textarea('Popis','description',item.description)+selectField('Typ','kind',[['group','Skupinová lekce'],['personal','Osobní trénink']],item.kind)+field('Délka v minutách','duration','number',item.duration)+selectField('Barva','color',[['purple','Fialová'],['green','Zelená'],['orange','Oranžová'],['blue','Modrá']],item.color)+selectField('Aktivní','active',activeOptions,item.active);}
  if(entity==='trainers') {item=state.trainers.find(x=>x.id===id)||{active:1};fields=field('Jméno','name','text',item.name)+field('Specializace','specialty','text',item.specialty,false)+textarea('Veřejný profil','bio',item.bio)+selectField('Aktivní','active',activeOptions,item.active);}
  if(entity==='rooms') {item=state.rooms.find(x=>x.id===id)||{capacity:12};fields=field('Název sálu','name','text',item.name)+field('Maximální kapacita','capacity','number',item.capacity);}
  if(entity==='users') {item=state.adminUsers.find(x=>x.id===id);fields=field('Jméno','name','text',item.name)+selectField('Oprávnění','role',[['client','Klient'],['admin','Správce']],item.role)+selectField('Aktivní účet','active',activeOptions,item.active)+'<p class="hint">Deaktivace zneplatní přihlášení, ale nezruší dřívější rezervace. Ty vyřešte samostatně.</p>';}
  if(entity==='sessions') {
    const start=new Date(Date.now()+86400000);start.setHours(16,0,0,0);
    item=state.sessions.find(x=>x.id===id)||{start_at:start.getTime(),end_at:start.getTime()+3600000,capacity:12,status:'published'};
    fields=selectField('Lekce','lesson_id',state.lessons.filter(x=>x.active).map(x=>[x.id,x.name]),item.lesson_id,true)+selectField('Trenér','trainer_id',state.trainers.filter(x=>x.active).map(x=>[x.id,x.name]),item.trainer_id,true)+selectField('Sál','room_id',state.rooms.map(x=>[x.id,`${x.name} · max. ${x.capacity}`]),item.room_id,true)+field('Začátek','start_at','datetime-local',localInput(item.start_at))+field('Konec','end_at','datetime-local',localInput(item.end_at))+field('Kapacita · osobní trénink = 1','capacity','number',item.capacity)+selectField('Stav','status',id&&item.status==='published'?[['published','Publikováno'],['cancelled','Zrušit celý termín']]:[['draft','Koncept'],['published','Publikováno']],item.status)+`<p class="hint">Časy se zadávají v pásmu vašeho zařízení (${escape(Intl.DateTimeFormat().resolvedOptions().timeZone)}). Přesun potvrzujete uložením; klienty informujte samostatně.</p>`;
  }
  if(entity==='visits')fields=selectField('Klient','user_id',state.adminUsers.filter(x=>x.active).map(x=>[x.id,`${x.name} (${x.email})`]),'',true)+textarea('Poznámka k návštěvě posilovny','note')+'<p class="hint">Tímto zaznamenáte samostatný vstup právě teď. Účast na lekci potvrďte v přehledu rezervací.</p>';
  if(entity==='reservations')fields=selectField('Klient','user_id',state.adminUsers.filter(x=>x.active).map(x=>[x.id,`${x.name} (${x.email})`]),'',true)+selectField('Termín','session_id',state.sessions.filter(x=>x.start_at>Date.now()&&x.status==='published').map(x=>[x.id,`${shortDate(x.start_at)} ${time(x.start_at)} · ${x.name} (${x.booked}/${x.capacity})`]),'',true);
  showModal(`${id?'Upravit':'Nový záznam'} · ${adminTabs[entity]}`,`<form data-form="admin" data-entity="${entity}" data-id="${id}">${fields}<div class="form-error" role="alert"></div><div class="form-actions"><button type="button" class="btn outline" data-action="close-modal">Zpět</button><button type="submit" class="btn primary">Uložit ${icon('check')}</button></div></form>`);
}

document.addEventListener('click',async e=>{
  const button=e.target.closest('button,a.brand');if(!button||button.disabled)return;
  try {
    if(button.matches('a.brand')){e.preventDefault();state.page='overview';render();}
    if(button.dataset.page){state.page=button.dataset.page;$('#modal').close();render();$('#main').focus();}
    if(button.dataset.action==='close-modal')$('#modal').close();
    if(['login','register'].includes(button.dataset.action))authModal(button.dataset.action);
    if(button.dataset.action==='logout'){await api('/auth/logout',{method:'POST',body:{}});state.page='overview';await refresh();render();toast('Jste odhlášeni. Brzy na viděnou.');}
    if(button.dataset.action==='reset-filters'){state.trainer='';state.kind='all';state.day='';render();}
    if(button.dataset.kind){state.kind=button.dataset.kind;render();}
    if('day' in button.dataset){state.day=button.dataset.day;render();}
    if('week' in button.dataset){const v=Number(button.dataset.week);if(!v)state.week=weekStart();else{const d=new Date(state.week);d.setDate(d.getDate()+v*7);state.week=d.getTime();}state.day='';render();}
    if(button.dataset.trainer){state.trainer=button.dataset.trainer;state.kind='all';state.day='';state.week=weekStart();state.page='schedule';render();}
    if(button.dataset.detail) {if(!state.user)authModal('login');else detail(Number(button.dataset.detail));}
    if(button.dataset.adminTab){state.adminTab=button.dataset.adminTab;render();}
    if(button.dataset.edit)editModal(button.dataset.edit,Number(button.dataset.id));
    if(button.dataset.cancel){const id=Number(button.dataset.cancel);showModal('Zrušit rezervaci?',`<p class="modal-intro">Vaše místo se uvolní pro někoho dalšího. Tuto akci potvrdíte tlačítkem níže.</p><form data-form="cancel" data-id="${id}"><div class="form-error" role="alert"></div><div class="form-actions"><button type="button" class="btn outline" data-action="close-modal">Ponechat rezervaci</button><button class="btn danger" type="submit">Zrušit rezervaci</button></div></form>`);}
    if(button.dataset.attend){button.disabled=true;const b=state.adminBookings.find(x=>x.id===Number(button.dataset.attend));await api('/admin/visits',{method:'POST',body:{user_id:b.user_id,reservation_id:b.id}});await refresh();render();toast('Účast byla zaznamenána.');}
  } catch(error){toast(error.message);button.disabled=false;}
});
document.addEventListener('change',e=>{if(e.target.id==='trainer-filter'){state.trainer=e.target.value;render();}});
document.addEventListener('submit',async e=>{
  const form=e.target.closest('form[data-form]');if(!form)return;e.preventDefault();
  const button=form.querySelector('[type="submit"]');button.disabled=true;
  const data=Object.fromEntries(new FormData(form));let message='Změny byly uloženy.';
  const errorBox=form.querySelector('.form-error');errorBox.textContent='';
  try {
    const kind=form.dataset.form;
    if(['login','register'].includes(kind)){await api('/auth/'+kind,{method:'POST',body:data});message=kind==='login'?'Vítejte zpátky.':'Váš účet je připravený.';}
    if(kind==='book'){await api('/reservations',{method:'POST',body:{session_id:Number(form.dataset.session)}});message='Místo je vaše. Rezervace byla potvrzena.';}
    if(kind==='cancel'){await api(`/reservations/${form.dataset.id}/cancel`,{method:'POST',body:{}});message='Rezervace byla zrušena.';}
    if(kind==='profile')await api('/profile',{method:'PATCH',body:data});
    if(kind==='password'){await api('/profile/password',{method:'POST',body:data});message='Heslo bylo změněno.';}
    if(kind==='admin') {
      const entity=form.dataset.entity,id=Number(form.dataset.id);
      for(const key of ['capacity','duration','active','lesson_id','trainer_id','room_id','user_id','session_id'])if(key in data)data[key]=Number(data[key]);
      for(const key of ['start_at','end_at'])if(key in data)data[key]=new Date(data[key]).getTime();
      const route=entity==='reservations'?'/reservations':'/admin/'+entity+(id?'/'+id:'');
      await api(route,{method:id?'PUT':'POST',body:data});
    }
    $('#modal').close();await refresh();render();toast(message);
  } catch(error){errorBox.textContent=error.message;button.disabled=false;if(error.status===401)toast('Vaše přihlášení vypršelo. Přihlaste se znovu.');}
});
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=$('#modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('#modal').close();}});
async function init(){try{await refresh();render();}catch(e){$('#app').innerHTML=`<main class="loading"><h1>Aplikace se nemohla načíst</h1><p>${escape(e.message)}</p><p>Ověřte, že běží server, a obnovte stránku.</p></main>`;}}
init();
