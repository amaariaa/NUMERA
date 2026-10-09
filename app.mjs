import { ARCHIVE_URL, COST_PER_TIP, EURO_ARCHIVE_URL, EURO_COST_PER_TIP, parseCSV, parseEuroCSV, parseISO, formatDate, gematria, generate, generateEuro, compareDraws, compareEuroDraws, euroWinningClass, getCalendarPatterns, nextDateForGame, theoreticalSingleTicket, partsOf, matches } from './engine.mjs?v=1.2.0';

const $ = id => document.getElementById(id);
const state = {game:'lotto',draws:[],drawsByGame:{lotto:[],euro:[]},sourceByGame:{lotto:'',euro:''},tickets:[],extraTickets:[],analysis:null,generatedConfig:null,selected:0,source:'',lastLoad:'',loadingGames:new Set(),saved:[],budget:10};
const euro = value=>value.toLocaleString('de-DE',{style:'currency',currency:'EUR'});
const integer=value=>Number(value).toLocaleString('de-DE');
const percent=value=>Number(value).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' %';
const dateToday = ()=> { const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const config = ()=>({date:$('draw-date').value,keyword:$('keyword').value.trim() || 'LOTTO',hebrewKeyword:$('hebrew-keyword').value.trim(),alphabet:$('alphabet').value,mode:$('mode').value,tickets:+$('ticket-count').value});
const systemName = {ordinal:'A=1 … Z=26',pythagorean:'Pythagoreisch',reverse:'Z=1 … A=26'};
const modelName = {research:'Gesamtanalyse (Gematria, Numerologie, Kalender und Historie)',gematria:'Gematria & Kalender',hybrid:'Gematria + Häufigkeit',statistics:'Historische Häufigkeit',random:'Zufall'};
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
const currentCost=()=>state.game==='euro'?EURO_COST_PER_TIP:COST_PER_TIP;
function updateCost(){ $('cost-label').textContent=euro(config().tickets*currentCost()); }
function updateArchiveUI(){
  const {draws}=state;
  $('metric-total').textContent=integer(draws.length);
  $('metric-first').textContent=draws.length?formatDate(draws[0].date):'–';
  $('metric-last').textContent=draws.length?formatDate(draws.at(-1).date):'–';
  $('source-range').textContent=draws.length ? `Von ${formatDate(draws[0].date)} bis ${formatDate(draws.at(-1).date)} · ${integer(draws.length)} Ziehungen · ${state.source}` : 'Noch keine Ziehungen importiert';
  setDataStatus(draws.length ? `${integer(draws.length)} Ziehungen verfügbar` : 'Archiv nicht geladen',draws.length>0);
  drawPatterns();
}
function saveCache(csv,source,game){try{localStorage.setItem(`numera:archive:csv:${game}`,csv);localStorage.setItem(`numera:archive:source:${game}`,source);localStorage.setItem(`numera:archive:time:${game}`,new Date().toISOString());}catch(e){ console.warn('Cache nicht verfügbar',e);}}
function loadCSV(csv,source='CSV-Datei',save=true,game=state.game){
  const parsed=game==='euro'?parseEuroCSV(csv):parseCSV(csv);
  const today=dateToday();
  // Draw dates in the future are not usable as historical evidence.
  const records=parsed.rows.filter(r=>r.date<=today);
  if (!records.length)throw Error('Die Datei enthält keine vergangenen Ziehungen.');
  state.drawsByGame[game]=records;state.sourceByGame[game]=source;
  if(save)saveCache(csv,source,game);
  if(game===state.game){state.draws=records;state.source=source;updateArchiveUI();}
  if(parsed.invalid)toast(`${integer(records.length)} Datensätze geladen, ${parsed.invalid} Zeilen übersprungen.`);
  return records.length;
}
async function fetchData(showMessage=true,game=state.game){
  if(state.loadingGames.has(game))return;
  state.loadingGames.add(game);
  if(game===state.game){$('refresh-data').disabled=true;if(showMessage)setDataStatus('Datenabruf läuft …');}
  const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),16000);
  try{
    const url=game==='euro'?EURO_ARCHIVE_URL:ARCHIVE_URL;
    const response=await fetch(url,{signal:abort.signal,cache:'no-store'});
    if(!response.ok)throw Error('HTTP '+response.status);
    const csv=await response.text();
    const count=loadCSV(csv,game==='euro'?'Eurojackpot-GitHub-Archiv':'Lotto-GitHub-Archiv',true,game);
    if(game===state.game){if(showMessage)toast(`${integer(count)} Ziehungen aktualisiert.`);$('csv-feedback').textContent='Onlinearchiv erfolgreich geladen. Bitte mit den offiziellen Ergebnissen abgleichen.';}
  }catch(err){
    if(game===state.game){if(!state.draws.length)setDataStatus('Ohne Archiv · CSV importieren');else updateArchiveUI();
    $('csv-feedback').textContent='Onlineabruf fehlgeschlagen. Du kannst stattdessen eine CSV-Datei importieren.';
    if(showMessage)toast('Onlineabruf fehlgeschlagen. CSV-Import ist möglich.');}
  }finally{clearTimeout(timeout);state.loadingGames.delete(game);if(game===state.game)$('refresh-data').disabled=false;}
}
function changeGame(game){
  if(!['lotto','euro'].includes(game)||game===state.game)return;
  state.game=game;state.draws=state.drawsByGame[game];state.source=state.sourceByGame[game];
  state.analysis=null;state.tickets=[];state.extraTickets=[];state.generatedConfig=null;state.selected=0;
  const isEuro=game==='euro';
  for(const el of document.querySelectorAll('[data-game]')){const active=el.dataset.game===game;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));}
  $('game-title').textContent=isEuro?'Eurojackpot':'LOTTO 6aus49';
  $('game-rules').textContent=isEuro?'5 aus 50 + 2 aus 12':'6 aus 49 + Superzahl';
  $('lottery-spec').textContent=isEuro?'Eurojackpot · 5 + 2':'6 aus 49 · Deutschland';
  $('orb-game-number').textContent=isEuro?'50':'49';
  $('orb-subtitle').textContent=isEuro?'PLUS 2 EURO':'ZAHLEN';
  document.body.classList.toggle('game-euro',isEuro);
  $('draw-date').value=nextDateForGame(game);
  $('source-game-title').textContent=isEuro?'Eurojackpot · 5 aus 50 + 2 aus 12':'Deutsches Lotto 6 aus 49';
  $('source-explanation').textContent=isEuro?'Unabhängiges Eurojackpot-Archiv von protomultix. Die Daten sind nicht amtlich geprüft.':'Unabhängiges Lotto-Archiv von daowa89. Die Daten sind nicht amtlich geprüft.';
  $('archive-link').href=isEuro?'https://github.com/protomultix/eurojackpot-api':'https://github.com/daowa89/lottery-archive';
  $('csv-schema').textContent=isEuro?'CSV: date,main_1,main_2,main_3,main_4,main_5,euro_1,euro_2. Historische Daten ab 25.03.2022.':'CSV: date,n1,n2,n3,n4,n5,n6,superzahl.';
  $('chance-description').textContent=isEuro?'Jackpot-Chance mit einem Eurojackpot-Tipp: 1 zu 139.838.160. Ein Gewinn in anderen Klassen ist wahrscheinlicher.':'Mit einem Tipp liegt die Chance auf mindestens drei Richtige bei rund '+percent(theoreticalSingleTicket()*100)+'.';
  $('pattern-pool').value='nums';$('pattern-pool').disabled=!isEuro;
  $('winning-extra-wrap').hidden=!isEuro;
  $('winning-main').placeholder=isEuro?'z. B. 4, 12, 23, 29, 41':'z. B. 4, 12, 23, 29, 41, 48';
  $('winning-main').value='';$('winning-extra').value='';$('check-results').replaceChildren();
  $('generate-message').textContent='Noch keine Zahlen berechnet.';
  $('ticket-list').innerHTML='<div class="empty"><div class="empty-symbol">✳</div><strong>Dein nächstes Experiment</strong><span>Starte den Generator für das gewählte Spiel.</span></div>';
  $('reason-card').hidden=true;$('copy-tickets').disabled=true;$('save-tickets').disabled=true;
  $('test-results').hidden=true;$('test-placeholder').hidden=false;
  $('csv-feedback').textContent='';updateCost();updateArchiveUI();updateDrawStrip();renderSaved();
  if(!state.draws.length)fetchData(true,game);
}
function updateDrawStrip(){
  const iso=nextDateForGame(state.game);
  const dow=['So','Mo','Di','Mi','Do','Fr','Sa'][partsOf(iso).dayOfWeek];
  $('next-draw').textContent=`${dow}, ${formatDate(iso)}`;
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
    if(state.game==='euro'){const euroBox=document.createElement('div');euroBox.className='euro-balls';
      const caption=document.createElement('span');caption.textContent='EURO';caption.className='euro-caption';euroBox.append(caption);
      (state.extraTickets[ix]||[]).forEach(n=>{const ball=document.createElement('span');ball.className='ball euro-ball';ball.textContent=n;euroBox.append(ball);});left.append(euroBox);}
    const detail=document.createElement('button');detail.type='button';detail.className='ticket-right';detail.textContent=ix===state.selected?'Berechnung geöffnet':'Berechnung ansehen ↗';detail.setAttribute('aria-label',`Berechnung für Reihe ${ix+1} ansehen`);
    detail.addEventListener('click',()=>{state.selected=ix;makeTicketCards();renderReasons();});
    card.append(left,detail);output.append(card);
  });
  $('copy-tickets').disabled=!state.tickets.length;$('save-tickets').disabled=!state.tickets.length;
}
function reasonBlock(number,extra=false){
  const cfg=state.generatedConfig||config();const reasonSet=extra?state.analysis.extraReasons:state.analysis.reasons;
  const freq=extra?state.analysis.extraFrequency:state.analysis.frequency;
  const match=reasonSet[number];const count=freq.counts[number];const n=freq.sample;
  const shell=document.createElement('div');shell.className='reason-item';
  const value=document.createElement('div');value.className='reason-number';value.textContent=String(number);
  const label=document.createElement('span');label.className='reason-label';
  const small=document.createElement('small');
  if (cfg.mode==='research') {
    const scores=extra?state.analysis.extraScoreDetails:state.analysis.scoreDetails;
    const data=scores[number];
    const names={gematria:'Gematria',numerologie:'Numerologie',kalender:'Kalender',kabbala:'Hebräisch',historie:'Häufigkeit',datumsarchiv:'Datumsarchiv'};
    const ranked=Object.entries(data.breakdown).filter(([,v])=>v!==0).sort((a,b)=>b[1]-a[1]);
    label.textContent=`${data.total.toLocaleString('de-DE',{maximumFractionDigits:2})} Modellpunkte`;
    small.textContent=ranked.map(([key,score])=>`${names[key]} ${score>=0?'+':''}${score.toLocaleString('de-DE',{maximumFractionDigits:2})}`).join(' · ')+'. Punkte sind KEINE Gewinnwahrscheinlichkeit.';
  } else if (cfg.mode==='random') {
    label.textContent='Zufallsmodell';small.textContent='Per reproduzierbarer Zufallszahl ausgewählt, keine Gematria-Bedeutung.';
  } else if (cfg.mode==='statistics') {
    label.textContent='Historische Häufigkeit';small.textContent=n?`${count} Treffer in den letzten ${n} früheren Ziehungen.`:'Keine früheren Ziehungen geladen. Diese Reihe beruht nur auf einer technischen Ersatzsortierung.';
  } else if(match.length){
    const ranked=[...match].sort((a,b)=>b.weight-a.weight);const s=ranked[0];
    label.textContent=s.label;
    small.textContent=`${integer(s.raw)} ergibt ${number} (Modulo ${extra?12:state.game==='euro'?50:49}). ${match.length} passende Rechenregel${match.length===1?'':'n'}.`;
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
  if(cfg.mode==='research'){const note=document.createElement('p');note.className='hint';note.textContent='Alle Zahlen nach festem Gesamtmodell bewertet, ohne Zufallsvariationen. Die Reihen 2 bis 5 berücksichtigen zusätzlich die Streuung. Die Modellpunkte sind keine Gewinnchancen. '+(state.analysis.analysisMeta.hebrew?`Hebräischer Wortwert: ${state.analysis.analysisMeta.hebrew}.`:'Für echte kabbalistische Gematria optional ein Wort in hebräischer Schrift eingeben.');box.append(note);}
  const grid=document.createElement('div');grid.className='reason-grid';state.tickets[state.selected].forEach(n=>grid.append(reasonBlock(n)));
  if(state.game==='euro'){const label=document.createElement('h4');label.textContent='Eurozahlen';label.className='extra-reason-title';grid.append(label);state.extraTickets[state.selected].forEach(n=>grid.append(reasonBlock(n,true)));}
  box.append(title,info,grid);
}
function handleGenerate(){
  const c=config();
  if(!parseISO(c.date)){toast('Bitte ein gültiges Datum eingeben.');return;}
  const historical=state.draws.filter(r=>r.date<c.date);
  if((c.mode==='statistics'||c.mode==='hybrid')&&historical.length===0){toast('Keine früheren Ziehungen: Statistikmodell derzeit eingeschränkt.');}
  state.analysis=(state.game==='euro'?generateEuro:generate)({date:c.date,keyword:c.keyword,alphabet:c.alphabet,hebrewKeyword:c.hebrewKeyword,mode:c.mode,tickets:c.tickets,pastDraws:historical});
  state.tickets=state.analysis.tickets;state.extraTickets=state.analysis.extraTickets||[];state.selected=0;state.generatedConfig={...c,game:state.game};
  if(c.mode==='research' && historical.length===0)toast('Ohne Archiv: historische Häufigkeiten konnten nicht einfließen.');
  $('generate-message').textContent=c.mode==='research'?`${state.tickets.length} berechnete Reihen nach sechs festgelegten Teilmodellen erstellt (keine Gewinnprognose).`:`${state.tickets.length} Reihe${state.tickets.length!==1?'n':''} für ${formatDate(c.date)} erstellt.`;
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
  const pool=state.game==='euro'&&$('pattern-pool').value==='extras'?'extras':'nums';
  const historical=state.draws.filter(r=>r.date<chosen);
  const p=getCalendarPatterns(historical,chosen,{max:pool==='extras'?12:state.game==='euro'?50:49,field:pool});
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
    const isEuro=state.game==='euro';
    const test=(isEuro?compareEuroDraws:compareDraws)({draws:state.draws,model:c.mode,alphabet:c.alphabet,keyword:c.keyword,hebrewKeyword:c.hebrewKeyword,ticketCount:c.tickets,size});
    const root=$('test-results');root.replaceChildren();root.hidden=false;$('test-placeholder').hidden=true;
    const heading=document.createElement('div');heading.className='section-heading';
    const label=document.createElement('div');label.innerHTML='<span class="eyebrow">ERGEBNIS</span><h2>Treffer im Vergleich</h2>';heading.append(label);
    root.append(heading);
    const summary=document.createElement('div');summary.className='test-summary';
    for (const [name,stats,random] of [['Gewähltes Modell',test.ours,false],['Zufallsvergleich',test.random,true]]) {
      const card=document.createElement('div');card.className='result-metric'+(random?' random-metric':'');
      const t=document.createElement('div');t.className='eyebrow';t.textContent=name;
      const value=document.createElement('div');value.className='big-rate';value.textContent=percent(stats.rate);
      const note=document.createElement('div');note.className='stats-note';note.textContent=isEuro?`${stats.wins} von ${test.count} Ziehungen: mindestens eine rechnerische Eurojackpot-Gewinnklasse`:`${stats.wins} von ${test.count} Ziehungen: mindestens 3 Richtige in wenigstens einem Tippfeld`;
      const foot=document.createElement('p');foot.textContent=random?'Reproduzierbarer Vergleich mit gleich vielen Zufallsreihen.':`${modelName[c.mode]} · ${c.tickets} Tippfeld${c.tickets>1?'er':''} pro Ziehung`;
      card.append(t,value,note,foot);summary.append(card);
    }
    root.append(summary);
    const extra=document.createElement('div');extra.className='test-extra';
    extra.append(metricElement('Untersuchter Zeitraum',`${formatDate(test.from)} – ${formatDate(test.to)}`),metricElement('Mindestens 4 Richtige · Modell',`${test.ours.better} Ziehungen`),metricElement('Reiner Testspieleinsatz',euro(test.count*c.tickets*currentCost())));
    root.append(extra);
    const chart=document.createElement('div');chart.className='panel-card test-chart';
    const title=document.createElement('h3');title.textContent='Treffer pro Ziehung (bester Tipp je Ziehung)';chart.append(title);
    const compare=document.createElement('div');compare.className='comparisons';
    const max=Math.max(...test.ours.hist,...test.random.hist,1);
    for(let hit=0;hit<=(isEuro?5:6);hit++){
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
    foot.textContent=`Für jede der ${test.count} Ziehungen wurden nur ältere Ziehungen für Häufigkeitsberechnungen verwendet. Gematria und Kalender benutzen das Datum der jeweiligen Ziehung. Das Zufallsmodell ist reproduzierbar. ${isEuro?'Die 12 Eurojackpot-Gewinnklassen werden gemeinsam berücksichtigt. ':''}Ein nachträglich ausgewähltes Muster ist kein unabhängiger Beleg für eine erhöhte Gewinnchance. Bearbeitungsgebühren und Gewinne wurden nicht berechnet.`;
    root.append(foot);
    const observation=document.createElement('div');observation.className='notice';
    const icon=document.createElement('span');icon.className='notice-icon';icon.textContent='i';
    const p=document.createElement('p');p.textContent=test.ours.rate > test.random.rate ? 'Das gewählte Modell lag in dieser Stichprobe über dem Zufallsvergleich. Das kann Zufall oder das Ergebnis vieler getesteter Einstellungen sein. Eine künftige Treffersteigerung ist daraus nicht ableitbar.' : 'Das gewählte Modell lag in dieser Stichprobe nicht über dem Zufallsvergleich. Auch ein positiver Einzelvergleich könnte keine zukünftigen Treffer garantieren.';
    observation.append(icon,p);root.append(observation);
    root.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(error){toast(error.message);}finally{button.disabled=false;button.textContent='Rückwärtstest starten';}
}
function markStale(){if(state.tickets.length){$('generate-message').textContent='Einstellungen geändert. Bitte neu berechnen.';} $('test-results').hidden=true;$('test-placeholder').hidden=false; }
function persistSaved(){try{localStorage.setItem('numera:tips:v1',JSON.stringify(state.saved));}catch(e){toast('Lokaler Speicher nicht verfügbar.');}}
function saveCurrentTickets(){
  if(!state.tickets.length)return;
  const c=state.generatedConfig;
  let added=0;
  state.tickets.forEach((nums,i)=>{
    const entry={game:state.game,date:c.date,nums:[...nums],extras:state.game==='euro'?[...state.extraTickets[i]]:[],mode:c.mode,created:new Date().toISOString()};
    if(state.saved.some(s=>s.game===entry.game&&s.date===entry.date&&JSON.stringify(s.nums)===JSON.stringify(entry.nums)&&JSON.stringify(s.extras)===JSON.stringify(entry.extras)))return;
    state.saved.unshift(entry);added++;
  });
  state.saved=state.saved.slice(0,200);persistSaved();renderSaved();toast(added?`${added} Tipps gespeichert.`:'Diese Tipps sind bereits gespeichert.');
}
function saveBudget(){
  const value=Number($('budget').value);
  if(!Number.isFinite(value)||value<0||value>500){toast('Bitte ein Limit zwischen 0 und 500 Euro wählen.');return;}
  state.budget=value;
  try{localStorage.setItem('numera:weekly-budget',String(value));}catch(e){}
  renderSaved();toast('Wochenlimit gespeichert.');
}
function renderSaved(){
  const filtered=state.saved.filter(r=>r.game===state.game);
  $('saved-count').textContent=integer(filtered.length);
  const now=new Date(),day=(now.getDay()+6)%7;
  const monday=new Date(now.getFullYear(),now.getMonth(),now.getDate()-day,12);
  const sunday=new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()+6,12);
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const planned=filtered.filter(t=>t.date>=iso(monday)&&t.date<=iso(sunday)).length*currentCost();
  $('saved-total').textContent=euro(planned);
  $('budget-display').textContent=euro(state.budget);
  const message=$('budget-message');message.classList.toggle('warning',planned>state.budget);
  message.textContent=planned>state.budget?`Das geplante Tippvolumen von ${euro(planned)} überschreitet dein Wochenlimit von ${euro(state.budget)}. Nicht alle gemerkten Tipps müssen gespielt werden.`:`Geplantes Tippvolumen in dieser Kalenderwoche: ${euro(planned)} von ${euro(state.budget)}. Nicht gespielte Tipps zählen hier nur als Planung.`;
  const output=$('saved-list');output.replaceChildren();
  if(!filtered.length){const empty=document.createElement('div');empty.className='empty';empty.innerHTML='<div class="empty-symbol">◎</div><strong>Noch keine Tipps gespeichert</strong><span>Erstelle Zahlen im Generator und wähle „Tipps merken“.</span>';output.append(empty);return;}
  const map=new Map();filtered.forEach((item)=>{const a=map.get(item.date)||[];a.push(item);map.set(item.date,a);});
  for(const [date,entries] of map){
    const group=document.createElement('div');group.className='saved-group';
    const heading=document.createElement('div');heading.className='saved-heading';heading.textContent=`Ziehung ${formatDate(date)} · ${entries.length} Reihen`;
    group.append(heading);
    for(const item of entries){const row=document.createElement('div');row.className='saved-ticket';
      const nums=document.createElement('span');nums.className='saved-nums';nums.textContent=item.nums.join(' · ')+(item.extras.length?'    |    Euro '+item.extras.join(' · '):'');
      const del=document.createElement('button');del.type='button';del.className='delete-ticket';del.textContent='Entfernen';
      del.addEventListener('click',()=>{const i=state.saved.indexOf(item);if(i>=0)state.saved.splice(i,1);persistSaved();renderSaved();});
      row.append(nums,del);group.append(row);
    }output.append(group);
  }
}
function numberInput(value,count,max){
  const text=value.trim();if(!/^\d+(?:[\s,;]+\d+)*$/.test(text))throw Error('Bitte Zahlen nur durch Leerzeichen oder Komma trennen.');
  const nums=text.split(/[\s,;]+/).map(Number);
  if(nums.length!==count||new Set(nums).size!==count||nums.some(n=>!Number.isInteger(n)||n<1||n>max))throw Error(`Bitte genau ${count} verschiedene Zahlen von 1 bis ${max} eingeben.`);
  return nums;
}
function checkSaved(){
  const root=$('check-results');root.replaceChildren();
  const saved=state.saved.filter(s=>s.game===state.game);
  if(!saved.length){toast('Bitte zuerst Tipps speichern.');return;}
  try{
    const main=numberInput($('winning-main').value,state.game==='euro'?5:6,state.game==='euro'?50:49);
    const extras=state.game==='euro'?numberInput($('winning-extra').value,2,12):[];
    const label=document.createElement('p');label.className='check-header';label.textContent='Rechnerischer Treffervergleich deiner gespeicherten Tipps';root.append(label);
    for(const item of saved){const m=matches(item.nums,main),e=state.game==='euro'?matches(item.extras,extras):0;
      const cls=state.game==='euro'?euroWinningClass(m,e):null;
      const row=document.createElement('div');row.className='checked-row';
      const left=document.createElement('span');left.textContent=`${formatDate(item.date)} · ${item.nums.join(', ')}${item.extras.length?' | '+item.extras.join(', '):''}`;
      const right=document.createElement('strong');right.textContent=state.game==='euro'?`${m} + ${e}${cls?' · Klasse '+cls:''}`:`${m} Richtige (ohne Superzahl)`;
      row.append(left,right);root.append(row);
    }
    const caveat=document.createElement('p');caveat.className='hint';caveat.textContent='Die eingegebenen Zahlen werden nicht online verifiziert. Gleiche Zahlen können für verschiedene Ziehungsdaten gespeichert sein; prüfe deshalb das Datum selbst.';root.append(caveat);
  }catch(error){toast(error.message);root.textContent=error.message;}
}
function wireEvents(){
  document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>switchTab(button.dataset.tab)));
  document.querySelectorAll('[data-game]').forEach(button=>button.addEventListener('click',()=>changeGame(button.dataset.game)));
  document.querySelectorAll('[data-tab-link]').forEach(link=>link.addEventListener('click',e=>{e.preventDefault();switchTab(link.dataset.tabLink);}));
  $('hero-generate').addEventListener('click',handleGenerate);
  $('hero-backtest').addEventListener('click',()=>switchTab('backtest'));
  $('generate-btn').addEventListener('click',handleGenerate);
  $('run-test').addEventListener('click',runTest);
  $('refresh-data').addEventListener('click',()=>fetchData(true));
  $('pattern-filter').addEventListener('change',drawPatterns);
  $('pattern-pool').addEventListener('change',drawPatterns);
  $('ticket-count').addEventListener('change',updateCost);
  ['draw-date','keyword','hebrew-keyword','alphabet','mode','ticket-count'].forEach(id=>$(id).addEventListener('change',()=>{markStale();if(id==='draw-date')drawPatterns();}));
  $('copy-tickets').addEventListener('click',async()=>{
    const c=config();const content=`NUMERA · ${state.game==='euro'?'Eurojackpot':'Lotto 6aus49'} · ${formatDate(c.date)} · ${modelName[c.mode]}\n`+state.tickets.map((t,i)=>`Reihe ${i+1}: ${t.join(' · ')}${state.game==='euro'?' | Euro: '+state.extraTickets[i].join(' · '):''}`).join('\n');
    try{await navigator.clipboard.writeText(content);toast('Zahlenreihen kopiert.');}
    catch(error){toast('Kopieren nicht verfügbar.');}
  });
  $('save-tickets').addEventListener('click',saveCurrentTickets);
  $('save-budget').addEventListener('click',saveBudget);
  $('check-tickets').addEventListener('click',checkSaved);
  $('clear-tickets').addEventListener('click',()=>{if(!state.saved.some(s=>s.game===state.game))return; if(!confirm('Alle gespeicherten Tipps für dieses Spiel löschen?'))return;state.saved=state.saved.filter(s=>s.game!==state.game);persistSaved();renderSaved();toast('Tipps gelöscht.');});
  $('csv-file').addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file)return;
    if(file.size > 10_000_000){$('csv-feedback').textContent='Datei zu groß (maximal 10 MB).';return;}
    try{const count=loadCSV(await file.text(),`Lokaler Import (${file.name})`);$('csv-feedback').textContent=`${integer(count)} gültige Ziehungen importiert.`;toast('CSV erfolgreich importiert.');}
    catch(error){$('csv-feedback').textContent=error.message;toast('CSV konnte nicht geladen werden.');}
  });
}
function init(){
  $('draw-date').value=nextDateForGame();
  $('math-chance').textContent=percent(theoreticalSingleTicket()*100);
  $('chance-inline').textContent=percent(theoreticalSingleTicket()*100);
  updateCost();wireEvents();$('pattern-pool').disabled=true;updateDrawStrip();
  try{state.saved=JSON.parse(localStorage.getItem('numera:tips:v1')||'[]');if(!Array.isArray(state.saved))state.saved=[];}catch(e){state.saved=[];}
  try{state.budget=Number(localStorage.getItem('numera:weekly-budget')||10);if(!Number.isFinite(state.budget)||state.budget<0)state.budget=10;}catch(e){state.budget=10;}
  $('budget').value=state.budget;renderSaved();
  for(const game of ['lotto','euro']){try{const cache=localStorage.getItem(`numera:archive:csv:${game}`)||(game==='lotto'?localStorage.getItem('numera:archive:csv'):null);
    if(cache)loadCSV(cache,localStorage.getItem(`numera:archive:source:${game}`)||'Browsercache',false,game);
    }catch(error){console.warn('Cache nicht lesbar',game,error);}}
  if (!state.source.startsWith('Lokaler Import')) fetchData(!state.draws.length);
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
}
init();
