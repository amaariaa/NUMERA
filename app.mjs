import { ARCHIVE_URL, COST_PER_TIP, parseCSV, parseISO, formatDate, gematria, generate, compareDraws, getCalendarPatterns, chooseNextDrawDate, theoreticalSingleTicket, partsOf } from './engine.mjs';

const $ = id => document.getElementById(id);
const state = {draws:[],tickets:[],analysis:null,generatedConfig:null,selected:0,source:'',lastLoad:'',loading:false};
const euro = value=>value.toLocaleString('de-DE',{style:'currency',currency:'EUR'});
const integer=value=>Number(value).toLocaleString('de-DE');
const percent=value=>Number(value).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' %';
const dateToday = ()=> { const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const config = ()=>({date:$('draw-date').value,keyword:$('keyword').value.trim() || 'LOTTO',alphabet:$('alphabet').value,mode:$('mode').value,tickets:+$('ticket-count').value});
const systemName = {ordinal:'A=1 … Z=26',pythagorean:'Pythagoreisch',reverse:'Z=1 … A=26'};
const modelName = {gematria:'Gematria & Kalender',hybrid:'Gematria + Häufigkeit',statistics:'Historische Häufigkeit',random:'Zufall'};
let toastTimer;
function toast(message) {
  const el=$('toast');el.textContent=message;el.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3000);
}
function switchTab(tab) {
  document.querySelectorAll('[data-panel]').forEach(p=>p.classList.toggle('active',p.dataset.panel===tab));
  document.querySelectorAll('[data-tab]').forEach(b=>{const active=b.dataset.tab===tab;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false');});
  window.scrollTo({top:0,behavior:'smooth'});
}
function setDataStatus(message,good=false) {
  $('top-status').textContent=message;
  $('sidebar-data-count').textContent=message;
  $('source-status').textContent=message;
  $('top-status-led').classList.toggle('connected',good);
  document.querySelector('.sidebar-bottom .status-pulse')?.classList.toggle('connected',good);
}
function updateCost(){ $('cost-label').textContent=euro(config().tickets*COST_PER_TIP); }
function updateArchiveUI(){
  const {draws}=state;
  $('metric-total').textContent=integer(draws.length);
  $('metric-first').textContent=draws.length?formatDate(draws[0].date):'–';
  $('metric-last').textContent=draws.length?formatDate(draws.at(-1).date):'–';
  $('source-range').textContent=draws.length ? `Von ${formatDate(draws[0].date)} bis ${formatDate(draws.at(-1).date)} · ${integer(draws.length)} Ziehungen · ${state.source}` : 'Noch keine Ziehungen importiert';
  setDataStatus(draws.length ? `${integer(draws.length)} Ziehungen verfügbar` : 'Archiv nicht geladen',draws.length>0);
  drawPatterns();
}
function saveCache(csv,source){try{localStorage.setItem('numera:archive:csv',csv);localStorage.setItem('numera:archive:source',source);localStorage.setItem('numera:archive:time',new Date().toISOString());}catch(e){ console.warn('Cache nicht verfügbar',e);}}
function loadCSV(csv,source='CSV-Datei',save=true){
  const parsed=parseCSV(csv);
  const today=dateToday();
  // Draw dates in the future are not usable as historical evidence.
  const records=parsed.rows.filter(r=>r.date<=today);
  if (!records.length)throw Error('Die Datei enthält keine vergangenen Ziehungen.');
  state.draws=records;state.source=source;
  if(save)saveCache(csv,source);
  updateArchiveUI();
  if(parsed.invalid)toast(`${integer(records.length)} Datensätze geladen, ${parsed.invalid} Zeilen übersprungen.`);
  return records.length;
}
async function fetchData(showMessage=true){
  if(state.loading)return;
  state.loading=true; $('refresh-data').disabled=true;
  if(showMessage)setDataStatus('Datenabruf läuft …');
  const abort=new AbortController(); const timeout=setTimeout(()=>abort.abort(),16000);
  try{
    const response=await fetch(ARCHIVE_URL,{signal:abort.signal,cache:'no-store'});
    if(!response.ok)throw Error('HTTP '+response.status);
    const csv=await response.text();
    const count=loadCSV(csv,'GitHub-Datenarchiv',true);
    if(showMessage)toast(`${integer(count)} Ziehungen aktualisiert.`);
    $('csv-feedback').textContent='Onlinearchiv erfolgreich geladen.';
  } catch(err){
    if(!state.draws.length)setDataStatus('Ohne Archiv · CSV importieren');else updateArchiveUI();
    $('csv-feedback').textContent='Onlineabruf fehlgeschlagen. Du kannst stattdessen eine CSV-Datei importieren.';
    if(showMessage)toast('Onlineabruf fehlgeschlagen. CSV-Import ist möglich.');
  } finally{clearTimeout(timeout);state.loading=false;$('refresh-data').disabled=false;}
}
function makeTicketCards(){
  const output=$('ticket-list');output.replaceChildren();
  state.tickets.forEach((nums,ix)=>{
    const card=document.createElement('article');card.className='ticket-card'+(ix===state.selected?' selected':'');
    const left=document.createElement('div');left.className='ticket-left';
    const index=document.createElement('span');index.className='ticket-index';index.textContent=`REIHE ${String(ix+1).padStart(2,'0')}`;
    const balls=document.createElement('div');balls.className='balls';balls.setAttribute('aria-label',nums.join(', '));
    nums.forEach(num=>{const ball=document.createElement('span');ball.className='ball';ball.textContent=String(num);balls.append(ball);});
    left.append(index,balls);
    const detail=document.createElement('button');detail.type='button';detail.className='ticket-right';detail.textContent=ix===state.selected?'Berechnung geöffnet':'Berechnung ansehen ↗';detail.setAttribute('aria-label',`Berechnung für Reihe ${ix+1} ansehen`);
    detail.addEventListener('click',()=>{state.selected=ix;makeTicketCards();renderReasons();});
    card.append(left,detail);output.append(card);
  });
  $('copy-tickets').disabled=!state.tickets.length;
}
function reasonBlock(number){
  const cfg=state.generatedConfig||config();const match=state.analysis.reasons[number];const count=state.analysis.frequency.counts[number];const n=state.analysis.frequency.sample;
  const shell=document.createElement('div');shell.className='reason-item';
  const value=document.createElement('div');value.className='reason-number';value.textContent=String(number);
  const label=document.createElement('span');label.className='reason-label';
  const small=document.createElement('small');
  if (cfg.mode==='random') {
    label.textContent='Zufallsmodell';small.textContent='Per reproduzierbarer Zufallszahl ausgewählt, keine Gematria-Bedeutung.';
  } else if (cfg.mode==='statistics') {
    label.textContent='Historische Häufigkeit';small.textContent=n?`${count} Treffer in den letzten ${n} früheren Ziehungen.`:'Keine früheren Ziehungen geladen. Diese Reihe beruht nur auf einer technischen Ersatzsortierung.';
  } else if(match.length){
    const ranked=[...match].sort((a,b)=>b.weight-a.weight);const s=ranked[0];
    label.textContent=s.label;
    small.textContent=`${integer(s.raw)} ergibt ${number} (Modulo 49, Zahlenbereich 1 bis 49). ${match.length} passende Rechenregel${match.length===1?'':'n'}.`;
    if(cfg.mode==='hybrid' && n)small.textContent+=` In ${n} früheren Ziehungen kam ${number} ${count} Mal vor.`;
  }else {
    label.textContent='Ergänzende Auswahl';small.textContent='Diese Zahl ergibt sich aus der Sortierung und Streuung der Reihen, nicht aus einer direkten Gleichheit zu einem Gematria-Wert.';
    if(cfg.mode==='hybrid' && n)small.textContent+=` Historisch: ${count} von ${n} Ziehungen.`;
  }
  shell.append(value,label,small);return shell;
}
function renderReasons(){
  const box=$('reason-card');if(!state.analysis||!state.tickets.length){box.hidden=true;return;}
  box.hidden=false;box.replaceChildren();
  const title=document.createElement('h3');title.textContent=`Warum diese Zahlen? · Reihe ${state.selected+1}`;
  const cfg=state.generatedConfig||config();const info=document.createElement('p');info.className='hint';info.style.margin='0 0 19px';
  info.textContent=`${modelName[cfg.mode]} · ${systemName[cfg.alphabet]} · Wortwert „${cfg.keyword}“ = ${gematria(cfg.keyword,cfg.alphabet)} · Ziehungsdatum ${formatDate(cfg.date)}.`;
  const grid=document.createElement('div');grid.className='reason-grid';state.tickets[state.selected].forEach(n=>grid.append(reasonBlock(n)));
  box.append(title,info,grid);
}
function handleGenerate(){
  const c=config();
  if(!parseISO(c.date)){toast('Bitte ein gültiges Datum eingeben.');return;}
  const historical=state.draws.filter(r=>r.date<c.date);
  if((c.mode==='statistics'||c.mode==='hybrid')&&historical.length===0){toast('Keine früheren Ziehungen: Statistikmodell derzeit eingeschränkt.');}
  state.analysis=generate({date:c.date,keyword:c.keyword,alphabet:c.alphabet,mode:c.mode,tickets:c.tickets,pastDraws:historical});
  state.tickets=state.analysis.tickets;state.selected=0;state.generatedConfig={...c};
  $('generate-message').textContent=`${state.tickets.length} Reihe${state.tickets.length!==1?'n':''} für ${formatDate(c.date)} erstellt.`;
  makeTicketCards();renderReasons();
  document.getElementById('ticket-list').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function barList(el,items,denominator){
  el.replaceChildren();if(!items||!items.length){el.textContent='Bitte zuerst Ziehungsdaten laden.';return;}
  const max=Math.max(...items.map(x=>x.count),1);
  for(const entry of items){
    const row=document.createElement('div');row.className='bar-row';
    const num=document.createElement('span');num.className='bar-number';num.textContent=entry.n;
    const bar=document.createElement('div');bar.className='bar-track';
    const fill=document.createElement('div');fill.className='bar-fill';fill.style.width=(entry.count/max*100)+'%';bar.append(fill);
    const count=document.createElement('span');count.className='bar-count';count.textContent=denominator ? `${(entry.count/denominator*100).toLocaleString('de-DE',{maximumFractionDigits:1})}%` : entry.count;
    row.append(num,bar,count);el.append(row);
  }
}
function drawPatterns(){
  if(!state.draws.length)return;
  const chosen=parseISO($('draw-date').value)||dateToday();
  const p=getCalendarPatterns(state.draws,chosen);
  barList($('chart-overall'),p.overall,p.total);
  const filter=$('pattern-filter').value;
  const same=({month:p.month,weekday:p.weekday,day:p.day,digits:p.dateSum})[filter];
  const num=({month:p.monthsCount,weekday:p.weekdaysCount,day:p.daysCount,digits:p.dateSumsCount})[filter];
  const week=['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'][partsOf(chosen).dayOfWeek];
  const month=new Intl.DateTimeFormat('de-DE',{month:'long',timeZone:'UTC'}).format(new Date(chosen+'T12:00:00Z'));
  $('pattern-title').textContent=({month:`Monat: ${month}`,weekday:`Wochentag: ${week}`,day:`Monatstag: ${partsOf(chosen).d}.`,digits:`Datumsquersumme: ${chosen.replace(/-/g,'').split('').reduce((n,c)=>n+(+c),0)}`})[filter];
  $('pattern-note').textContent=`${integer(num)} Ziehungen in dieser Teilmenge. Balken zeigen die jeweils beobachtete Häufigkeit je Ziehung, nicht die Chance der nächsten Ziehung.`;
  barList($('chart-filter'),same,num);
}
function metricElement(label,value){const el=document.createElement('div');el.className='stat-chip';const l=document.createElement('span'),v=document.createElement('strong');l.textContent=label;v.textContent=value;el.append(l,v);return el;}
async function runTest(){
  if(state.draws.length<40){toast('Bitte zuerst mindestens 40 Ziehungen laden.');switchTab('data');return;}
  const button=$('run-test');button.disabled=true;button.textContent='Berechnung läuft …';
  await new Promise(resolve=>setTimeout(resolve,35));
  try {
    const c=config();const size=+$('test-size').value;
    const test=compareDraws({draws:state.draws,model:c.mode,alphabet:c.alphabet,keyword:c.keyword,ticketCount:c.tickets,size});
    const root=$('test-results');root.replaceChildren();root.hidden=false;$('test-placeholder').hidden=true;
    const heading=document.createElement('div');heading.className='section-heading';
    const label=document.createElement('div');label.innerHTML='<span class="eyebrow">ERGEBNIS</span><h2>Treffer im Vergleich</h2>';heading.append(label);
    root.append(heading);
    const summary=document.createElement('div');summary.className='test-summary';
    for (const [name,stats,random] of [['Gewähltes Modell',test.ours,false],['Zufallsvergleich',test.random,true]]) {
      const card=document.createElement('div');card.className='result-metric'+(random?' random-metric':'');
      const t=document.createElement('div');t.className='eyebrow';t.textContent=name;
      const value=document.createElement('div');value.className='big-rate';value.textContent=percent(stats.rate);
      const note=document.createElement('div');note.className='stats-note';note.textContent=`${stats.wins} von ${test.count} Ziehungen: mindestens 3 Richtige in wenigstens einem Tippfeld`;
      const foot=document.createElement('p');foot.textContent=random?'Reproduzierbarer Vergleich mit gleich vielen Zufallsreihen.':`${modelName[c.mode]} · ${c.tickets} Tippfeld${c.tickets>1?'er':''} pro Ziehung`;
      card.append(t,value,note,foot);summary.append(card);
    }
    root.append(summary);
    const extra=document.createElement('div');extra.className='test-extra';
    extra.append(metricElement('Untersuchter Zeitraum',`${formatDate(test.from)} – ${formatDate(test.to)}`),metricElement('Mindestens 4 Richtige · Modell',`${test.ours.better} Ziehungen`),metricElement('Reiner Testspieleinsatz',euro(test.count*c.tickets*COST_PER_TIP)));
    root.append(extra);
    const chart=document.createElement('div');chart.className='panel-card test-chart';
    const title=document.createElement('h3');title.textContent='Treffer pro Ziehung (bester Tipp je Ziehung)';chart.append(title);
    const compare=document.createElement('div');compare.className='comparisons';
    const max=Math.max(...test.ours.hist,...test.random.hist,1);
    for(let hit=0;hit<=6;hit++){
      for(const random of [false,true]){
        const count=(random?test.random:test.ours).hist[hit];
        const row=document.createElement('div');row.className='comparison-row';
        const lbl=document.createElement('span');lbl.textContent=`${hit} ${random?'Zufall':'Modell'}`;
        const track=document.createElement('div');track.className='bar-track';const fill=document.createElement('div');fill.className='bar-fill'+(random?' random':'');fill.style.width=`${100*count/max}%`;track.append(fill);
        const val=document.createElement('strong');val.textContent=count;row.append(lbl,track,val);compare.append(row);
      }
    }
    chart.append(compare);root.append(chart);
    const foot=document.createElement('p');foot.className='test-footnote';
    foot.textContent=`Für jede der ${test.count} Ziehungen wurden nur ältere Ziehungen für Häufigkeitsberechnungen verwendet. Gematria und Kalender benutzen das Datum der jeweiligen Ziehung. Das Zufallsmodell ist reproduzierbar. Ein nachträglich ausgewähltes Muster ist kein unabhängiger Beleg für eine erhöhte Gewinnchance. Bearbeitungsgebühren und Gewinne wurden nicht berechnet.`;
    root.append(foot);
    const observation=document.createElement('div');observation.className='notice';
    const icon=document.createElement('span');icon.className='notice-icon';icon.textContent='i';
    const p=document.createElement('p');p.textContent=test.ours.rate > test.random.rate ? 'Das gewählte Modell lag in dieser Stichprobe über dem Zufallsvergleich. Das kann Zufall oder das Ergebnis vieler getesteter Einstellungen sein. Eine künftige Treffersteigerung ist daraus nicht ableitbar.' : 'Das gewählte Modell lag in dieser Stichprobe nicht über dem Zufallsvergleich. Auch ein positiver Einzelvergleich könnte keine zukünftigen Treffer garantieren.';
    observation.append(icon,p);root.append(observation);
    root.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(error){toast(error.message);}finally{button.disabled=false;button.textContent='Rückwärtstest starten';}
}
function markStale(){if(state.tickets.length){$('generate-message').textContent='Einstellungen geändert. Bitte neu berechnen.';} $('test-results').hidden=true;$('test-placeholder').hidden=false; }
function wireEvents(){
  document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>switchTab(button.dataset.tab)));
  document.querySelectorAll('[data-tab-link]').forEach(link=>link.addEventListener('click',e=>{e.preventDefault();switchTab(link.dataset.tabLink);}));
  $('hero-generate').addEventListener('click',handleGenerate);
  $('hero-backtest').addEventListener('click',()=>switchTab('backtest'));
  $('generate-btn').addEventListener('click',handleGenerate);
  $('run-test').addEventListener('click',runTest);
  $('refresh-data').addEventListener('click',()=>fetchData(true));
  $('pattern-filter').addEventListener('change',drawPatterns);
  $('ticket-count').addEventListener('change',updateCost);
  ['draw-date','keyword','alphabet','mode','ticket-count'].forEach(id=>$(id).addEventListener('change',()=>{markStale();if(id==='draw-date')drawPatterns();}));
  $('copy-tickets').addEventListener('click',async()=>{
    const c=config();const content=`NUMERA · ${formatDate(c.date)} · ${modelName[c.mode]}\n`+state.tickets.map((t,i)=>`Reihe ${i+1}: ${t.join(' · ')}`).join('\n');
    try{await navigator.clipboard.writeText(content);toast('Zahlenreihen kopiert.');}
    catch(error){toast('Kopieren nicht verfügbar.');}
  });
  $('csv-file').addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file)return;
    if(file.size > 10_000_000){$('csv-feedback').textContent='Datei zu groß (maximal 10 MB).';return;}
    try{const count=loadCSV(await file.text(),`Lokaler Import (${file.name})`);$('csv-feedback').textContent=`${integer(count)} gültige Ziehungen importiert.`;toast('CSV erfolgreich importiert.');}
    catch(error){$('csv-feedback').textContent=error.message;toast('CSV konnte nicht geladen werden.');}
  });
}
function init(){
  $('draw-date').value=chooseNextDrawDate();
  $('math-chance').textContent=percent(theoreticalSingleTicket()*100);
  $('chance-inline').textContent=percent(theoreticalSingleTicket()*100);
  updateCost();wireEvents();
  try{
    const cache=localStorage.getItem('numera:archive:csv');
    if(cache)loadCSV(cache,localStorage.getItem('numera:archive:source')||'Browsercache',false);
  }catch(error){console.warn('Cache nicht lesbar',error);}
  if (!state.source.startsWith('Lokaler Import')) fetchData(!state.draws.length);
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
}
init();
