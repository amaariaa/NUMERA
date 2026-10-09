/* NUMERA | Pure calculation engine. No lottery prediction is asserted. */
export const ARCHIVE_URL = 'https://raw.githubusercontent.com/daowa89/lottery-archive/main/de/lotto_6aus49/results.csv';
export const COST_PER_TIP = 1.20;

export function parseISO(value) {
  const text = String(value || '').trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return strictDate(+match[1], +match[2], +match[3]);
  match = text.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (match) return strictDate(+match[3], +match[2], +match[1]);
  return null;
}
function strictDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() + 1 === m && dt.getUTCDate() === d
    ? `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}` : null;
}

function csvCells(line, delimiter) {
  const parts = []; let current = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i+1] === '"') { current += '"'; i++; }
      else quoted = !quoted;
    } else if (c === delimiter && !quoted) { parts.push(current.trim()); current = ''; }
    else current += c;
  }
  parts.push(current.trim());
  return parts;
}

export function parseCSV(csv) {
  const lines = String(csv || '').replace(/^\uFEFF/, '').split(/\r?\n/).map(s=>s.trim()).filter(s=>s && !s.startsWith('#') && !/^sep=/.test(s.toLowerCase()));
  if (!lines.length) throw Error('Die Datei enthält keine Daten.');
  const semis = (lines[0].match(/;/g) || []).length;
  const commas = (lines[0].match(/,/g) || []).length;
  const delimiter = semis > commas ? ';' : ',';
  const first = csvCells(lines[0], delimiter);
  const clean = s => String(s).replace(/[^a-z0-9äöü]/gi,'').toLowerCase();
  const names = first.map(clean);
  const dateIndex = names.findIndex(s=>/^(date|datum|ziehungstag|ziehungsdatum)$/.test(s));
  let indices = [1,2,3,4,5,6]; let dateCol = 0;
  if (dateIndex >= 0) {
    dateCol = dateIndex;
    const numericHeader = names.map((n,i)=> ({n,i})).filter(x => /^(n[1-6]|zahl[1-6]|lottozahl[1-6]|gewinnzahl[1-6])$/.test(x.n));
    if (numericHeader.length >= 6) {
      const byNum = new Map(numericHeader.map(x=>[+(x.n.match(/[1-6]$/)||[0])[0],x.i]));
      if ([1,2,3,4,5,6].every(n=>byNum.has(n))) indices = [1,2,3,4,5,6].map(n=>byNum.get(n));
    } else indices = names.map((_,i)=>i).filter(i=>i!==dateCol).slice(0,6);
  }
  const hasHeader = dateIndex >= 0 || !parseISO(first[0]);
  const rows = [], dates = new Set(); let invalid = 0;
  for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
    const cols = csvCells(lines[i],delimiter);
    const date = parseISO(cols[dateCol]);
    const numbers = indices.map(j => Number(String(cols[j] ?? '').replace(/\s/g,'')));
    if (!date || numbers.length !== 6 || numbers.some(n=> !Number.isInteger(n) || n<1 || n>49) || new Set(numbers).size !== 6) { invalid++; continue; }
    if (dates.has(date)) { invalid++; continue; }
    dates.add(date);
    rows.push({date, nums: numbers.sort((a,b)=>a-b)});
  }
  rows.sort((a,b)=>a.date.localeCompare(b.date));
  if (rows.length === 0) throw Error('Keine gültigen Ziehungen gefunden. Erwartet werden Datum und sechs Zahlen von 1 bis 49.');
  return {rows,invalid};
}

export function formatDate(iso) { if (!iso) return '–'; const [y,m,d]=iso.split('-'); return `${d}.${m}.${y}`; }
export function partsOf(date) {
  const [y,m,d] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(y,m-1,d));
  const dayOfWeek = utc.getUTCDay(); // Sunday = 0
  const thursday = new Date(utc);
  thursday.setUTCDate(utc.getUTCDate() + 4 - (dayOfWeek || 7));
  const jan1 = new Date(Date.UTC(thursday.getUTCFullYear(),0,1));
  const week = Math.ceil((((thursday-jan1)/86400000)+1)/7);
  return {y,m,d,week,dayOfWeek};
}
export function digitSum(value) { return String(Math.abs(Number(value)||0)).split('').reduce((s,ch)=>s+(+ch||0),0); }
export function as49(value) { return ((Math.trunc(value) - 1) % 49 + 49) % 49 + 1; }
export function gematria(word, alphabet='ordinal') {
  const str = String(word || 'LOTTO').toUpperCase().replace(/Ä/g,'AE').replace(/Ö/g,'OE').replace(/Ü/g,'UE').replace(/ẞ|ß/g,'SS').replace(/[^A-Z]/g,'');
  return [...str].reduce((sum,ch)=> {
    const v=ch.charCodeAt(0)-64;
    return sum + (alphabet==='reverse' ? 27-v : alphabet==='pythagorean' ? (v-1)%9+1 : v);
  },0);
}
function stableHash(input) {
  let h=2166136261;
  for (let i=0;i<input.length;i++) {h ^= input.charCodeAt(i);h = Math.imul(h,16777619);}
  return h>>>0;
}
export function rngOf(seed) { let x=stableHash(String(seed)) || 27; return ()=>{ x^=x<<13; x^=x>>>17; x^=x<<5; return (x>>>0)/4294967296; }; }

export function gematriaSignals(date, keyword='LOTTO', alphabet='ordinal') {
  const {y,m,d,week,dayOfWeek} = partsOf(date);
  const word = (String(keyword).trim()||'LOTTO');
  const g = gematria(word,alphabet);
  const yr = digitSum(y);
  const dateSum = digitSum(`${String(d).padStart(2,'0')}${String(m).padStart(2,'0')}${y}`);
  const monthNames = ['JANUAR','FEBRUAR','MÄRZ','APRIL','MAI','JUNI','JULI','AUGUST','SEPTEMBER','OKTOBER','NOVEMBER','DEZEMBER'];
  const monthWord = gematria(monthNames[m-1],alphabet);
  const entries = [
    ['Tag',d,1.2], ['Monat',m,0.8], ['Tag + Monat',d+m,1.0],
    ['Quersumme des Datums',dateSum,1.5], ['Quersumme des Jahres',yr,0.8],
    ['Wortwert',g,1.6], ['Wortwert + Tag',g+d,1.3],
    ['Wortwert + Monat',g+m,1.2], ['Wortwert + Datumsquersumme',g+dateSum,1.2],
    ['Kalenderwoche',week,1.0], ['Kalenderwoche + Wortwert',week+g,0.8],
    ['Tag × Monat',d*m,0.8], ['Tag × 7 + Monat',d*7+m,0.9],
    ['Letzte zwei Jahresziffern',y%100,0.8],
    ['Jahr + Wortwert',y+g,0.7],
    ['Wochentag + Wortwert',dayOfWeek+g,0.8],
    ['Monatsname als Wortwert',monthWord,1.0],
    ['Monatsname + Tageszahl',monthWord+d,1.0],
    ['Tag × 2 + Jahresquersumme',d*2+yr,0.7],
    ['Wortwert + letzte Jahresziffer',g+y%10,0.7],
    ['Datumsquersumme × 2',dateSum*2,0.7]
  ];
  return entries.map(([label,raw,weight])=>({label,raw,number:as49(raw),weight}));
}

function frequencies(pastDraws, last=156) {
  const sample = pastDraws.slice(-last), counts = Array(50).fill(0);
  for (const d of sample) for (const n of d.nums) counts[n]++;
  const expected = sample.length*6/49;
  const deviation = Math.sqrt(Math.max(1,sample.length*6/49*(43/49)));
  return {counts,sample:sample.length, z:counts.map(c=>(c-expected)/deviation)};
}
export function generate({date,keyword='LOTTO',alphabet='ordinal',mode='gematria',tickets=1,pastDraws=[],seed='standard'}) {
  if (!parseISO(date)) throw Error('Bitte ein gültiges Datum wählen.');
  const maxTickets = Math.max(1,Math.min(12,+tickets||1));
  const sig = gematriaSignals(date,keyword,alphabet);
  const freq = frequencies(pastDraws);
  const reasons = Array.from({length:50},()=>[]);
  const gScores = Array(50).fill(0);
  for (const s of sig) { gScores[s.number]+=s.weight; reasons[s.number].push(s); }
  const usage = Array(50).fill(0), pairs=new Map();
  const output=[];
  for (let row=0;row<maxTickets;row++) {
    const rng=rngOf(`${seed}|${date}|${keyword}|${alphabet}|${mode}|${row}`);
    const numbers=[];
    for (let i=1;i<=49;i++) {
      let value;
      const variation=rng();
      if (mode==='random') value=variation*3;
      else if (mode==='statistics') value=freq.sample > 0 ? 2.5+freq.z[i]*0.8 : variation*3;
      else if (mode==='hybrid') value=(gScores[i]*0.9+variation*.9)*.72+(2.5+freq.z[i]*0.8)*.28;
      else value=gScores[i]+variation*.85;
      numbers.push({n:i,score:value});
    }
    const selected=[];
    for (let j=0;j<6;j++) {
      let best=null;
      for (const choice of numbers) {
        if (selected.includes(choice.n)) continue;
        const pairCost=selected.reduce((sum,n)=>sum+(pairs.get([Math.min(n,choice.n),Math.max(n,choice.n)].join('-'))||0)*.55,0);
        const penalty=usage[choice.n]*(row===0?0:1.65)+pairCost;
        const s=choice.score-penalty;
        if (!best || s>best.s) best={n:choice.n,s};
      }
      selected.push(best.n);
    }
    selected.sort((a,b)=>a-b);
    for (const n of selected) usage[n]++;
    for (let i=0;i<6;i++) for(let j=i+1;j<6;j++) {
      const key=`${selected[i]}-${selected[j]}`;
      pairs.set(key,(pairs.get(key)||0)+1);
    }
    output.push(selected);
  }
  return {tickets:output, reasons, sig, frequency:freq};
}

export function matches(numbers, winningNumbers) { const result=new Set(winningNumbers); return numbers.reduce((sum,n)=>sum+Number(result.has(n)),0); }
export function compareDraws({draws,model='gematria',keyword='LOTTO',alphabet='ordinal',ticketCount=1,size=250}) {
  if (!draws || draws.length < 40) throw Error('Für einen Rückwärtstest werden mindestens 40 Ziehungen benötigt.');
  const end=draws.length;
  const start=Math.max(30,end-Math.max(40,Math.min(1000,Number(size)||250)));
  const results=[];
  for (let i=start;i<end;i++) {
    const d=draws[i]; const history=draws.slice(0,i);
    const ours=generate({date:d.date,keyword,alphabet,mode:model,tickets:ticketCount,pastDraws:history,seed:'test-v1'}).tickets;
    const random=generate({date:d.date,keyword,alphabet,mode:'random',tickets:ticketCount,pastDraws:history,seed:'chance-v1'}).tickets;
    const maxHits=Math.max(...ours.map(t=>matches(t,d.nums)));
    const randomMax=Math.max(...random.map(t=>matches(t,d.nums)));
    results.push({date:d.date,maxHits,randomMax,winning:d.nums});
  }
  const summarize=(key)=> {
    const wins=results.filter(r=>r[key]>=3).length;
    return {wins,rate:wins/results.length*100,better:results.filter(r=>r[key]>=4).length,
      avg:results.reduce((s,r)=>s+r[key],0)/results.length,
      hist:[0,1,2,3,4,5,6].map(j=>results.filter(r=>r[key]===j).length)};
  };
  return {count:results.length,from:results[0].date,to:results.at(-1).date,ours:summarize('maxHits'),random:summarize('randomMax'),results};
}
export function getCalendarPatterns(draws,referenceDate) {
  const {m,dayOfWeek}=partsOf(referenceDate);
  const counts=Array(50).fill(0), weekday=Array(50).fill(0), months=Array(50).fill(0), day=Array(50).fill(0), dateSum=Array(50).fill(0);
  let weekdaysCount=0,monthsCount=0,daysCount=0,dateSumsCount=0;
  const referenceDay=partsOf(referenceDate).d, referenceDigitSum=digitSum(referenceDate.replace(/-/g,''));
  for (const dr of draws) {
    const p=partsOf(dr.date);
    if (p.dayOfWeek===dayOfWeek) { weekdaysCount++; for(const n of dr.nums) weekday[n]++; }
    if (p.m===m) {monthsCount++;for(const n of dr.nums) months[n]++;}
    if (p.d===referenceDay) {daysCount++;for(const n of dr.nums) day[n]++;}
    if (digitSum(dr.date.replace(/-/g,''))===referenceDigitSum) {dateSumsCount++;for(const n of dr.nums) dateSum[n]++;}
    for(const n of dr.nums) counts[n]++;
  }
  const sortedTop=arr=>Array.from({length:49},(_,i)=>i+1).sort((a,b)=>arr[b]-arr[a]||a-b).slice(0,10).map(n=>({n,count:arr[n]}));
  return {overall:sortedTop(counts),weekday:sortedTop(weekday),month:sortedTop(months),day:sortedTop(day),dateSum:sortedTop(dateSum),total:draws.length,weekdaysCount,monthsCount,daysCount,dateSumsCount};
}
export function chooseNextDrawDate(today=new Date()) {
  const date = new Date(today.getFullYear(),today.getMonth(),today.getDate());
  while (![3,6].includes(date.getDay()) || date.getTime()<=new Date(today.getFullYear(),today.getMonth(),today.getDate()).getTime()) date.setDate(date.getDate()+1);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function theoreticalSingleTicket() {
  const c=(n,k)=>{let r=1;for(let i=1;i<=k;i++)r=r*(n-i+1)/i;return r;};
  return [3,4,5,6].reduce((s,k)=>s+c(6,k)*c(43,6-k),0)/c(49,6);
}
