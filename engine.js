/* Alpha Search engine: indicators, signals and CSV parsing.
   Shared by index.html (loaded as a plain script) and brief.mjs (loaded in Node), so the daily email
   and the website always compute the same numbers. No DOM access in this file. */
const TF=[['1D',1],['1W',5],['1M',21],['3M',63],['6M',126],['1Y',252]];
const CAPCUT={large:100000,mid:30000};
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));

/* ---------- indicators ---------- */
function sma(a,n){const o=Array(a.length).fill(null);let s=0;for(let i=0;i<a.length;i++){s+=a[i];if(i>=n)s-=a[i-n];if(i>=n-1)o[i]=s/n;}return o;}
function rsiArr(c,n=14){const o=Array(c.length).fill(null);if(c.length<=n)return o;let g=0,l=0;for(let i=1;i<=n;i++){const d=c[i]-c[i-1];if(d>=0)g+=d;else l-=d;}g/=n;l/=n;o[n]=l===0?100:100-100/(1+g/l);
  for(let i=n+1;i<c.length;i++){const d=c[i]-c[i-1];g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n;o[i]=l===0?100:100-100/(1+g/l);}return o;}
function atrArr(h,l,c,n=14){const o=Array(c.length).fill(null);if(c.length<=n)return o;const tr=i=>Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1]));let a=0;for(let i=1;i<=n;i++)a+=tr(i);a/=n;o[n]=a;for(let i=n+1;i<c.length;i++){a=(a*(n-1)+tr(i))/n;o[i]=a;}return o;}
function prep(s){s.sma20=sma(s.c,20);s.sma50=sma(s.c,50);s.sma200=sma(s.c,200);s.rsi=rsiArr(s.c);s.atr=atrArr(s.h,s.l,s.c);const va=sma(s.v,20);s.vavg=Array(s.v.length).fill(null);for(let i=1;i<s.v.length;i++)s.vavg[i]=va[i-1];return s;}
function priorHigh(s,i,N){if(i<N)return null;let m=-Infinity;for(let k=i-N;k<i;k++)if(s.h[k]>m)m=s.h[k];return m;}
function brkAt(s,i,N){const ph=priorHigh(s,i,N);return ph!=null&&s.c[i]>ph;}
function volX(s,i){return s.vavg[i]?s.v[i]/s.vavg[i]:null;}

/* ---------- metrics ---------- */
function calcOne(s,cfg){
  const n=s.c.length,i=n-1,N=cfg.N,m={sym:s.sym,sector:s.sector||'–',name:s.name||'',cap:s.cap||'–',n};
  m.last=s.c[i];{let tv=0,cnt=0;for(let k=Math.max(0,n-20);k<n;k++){tv+=s.c[k]*s.v[k];cnt++;}m.turn=cnt?tv/cnt/1e7:null;}m.r={};TF.forEach(([k,b])=>{m.r[k]=n>b?s.c[i]/s.c[i-b]-1:null;});
  const w=Math.min(252,n);let hi=-Infinity;for(let k=n-w;k<n;k++)if(s.h[k]>hi)hi=s.h[k];
  m.hi52=hi;m.pctHigh=m.last/hi-1;m.volX=volX(s,i);m.rsi=s.rsi[i];m.atr=s.atr[i];
  m.ext=m.atr&&s.sma20[i]?(m.last-s.sma20[i])/m.atr:null;
  const a50=s.sma50[i],a200=s.sma200[i];m.above50=a50!=null&&m.last>a50;m.above200=a200!=null&&m.last>a200;
  m.trend=a50!=null&&m.last>a50&&(a200==null||a50>a200);
  m.brkAgo=null;m.brkVolOK=false;m.brkVol=null;
  for(let j=0;j<5&&i-j>=N;j++){if(brkAt(s,i-j,N)){m.brkAgo=j;m.brkVol=volX(s,i-j);m.brkVolOK=m.brkVol!=null&&m.brkVol>=cfg.vol;break;}}
  m.fresh=m.brkAgo!=null&&m.brkAgo<=2;
  let vmax=0;for(let j=0;j<3&&i-j>=0;j++){const x=volX(s,i-j);if(x&&x>vmax)vmax=x;}m.volMax3=vmax;
  m.hiNew=m.pctHigh>-0.0001;
  return m;
}
function prRank(vals){const idx=vals.map((v,i)=>[v,i]).filter(x=>x[0]!=null).sort((a,b)=>a[0]-b[0]);const out=Array(vals.length).fill(null);idx.forEach((x,k)=>out[x[1]]=idx.length>1?k/(idx.length-1):.5);return out;}
function detectSetups(s,m){
  const n=s.c.length,i=n-1,T={};
  T.brk=!!(m.fresh&&m.brkVolOK);
  T.hi52=!!(m.pctHigh>-0.01&&m.trend);
  let hc=-Infinity;for(let k=Math.max(0,i-19);k<=i;k++)if(s.c[k]>hc)hc=s.c[k];
  const pb=(hc-s.c[i])/hc;
  T.pull=!!(m.trend&&m.mom>=.6&&pb>=.03&&pb<=.12&&s.sma20[i]!=null&&s.atr[i]&&Math.abs(s.c[i]-s.sma20[i])<=1.5*s.atr[i]&&s.sma50[i]!=null&&s.c[i]>=s.sma50[i]&&m.rsi!=null&&m.rsi<62);
  let h10=-Infinity,l10=Infinity;for(let k=Math.max(0,i-9);k<=i;k++){if(s.h[k]>h10)h10=s.h[k];if(s.l[k]<l10)l10=s.l[k];}
  const atrOld=s.atr[Math.max(14,i-40)];
  T.base=!!(m.trend&&m.pctHigh>-0.08&&s.atr[i]&&(h10-l10)/s.atr[i]<=4.5&&atrOld&&s.atr[i]/atrOld<.95&&!m.fresh);
  T.gap=false;for(let j=0;j<3&&i-j>=1;j++){const k=i-j,gp=s.o[k]/s.c[k-1]-1,vx=volX(s,k);if(gp>=.03&&vx&&vx>=2&&s.c[i]>=s.o[k]){T.gap=true;break;}}
  T.rs=!!(m.mom>=.9&&m.pr3M!=null&&m.pr3M>=.85&&m.trend&&m.pctHigh>-0.10);
  return T;
}
function computeAll(DATA,cfg){
  const syms=Object.keys(DATA),M=syms.map(k=>calcOne(DATA[k],cfg));
  const groups={};M.forEach((m,i)=>{(groups[m.cap]=groups[m.cap]||[]).push(i);});
  ['1M','3M','6M'].forEach(k=>{const all=prRank(M.map(m=>m.r[k]));M.forEach((m,i)=>m['pr'+k]=all[i]);
    Object.values(groups).forEach(ix=>{if(ix.length<5)return;const rk=prRank(ix.map(i=>M[i].r[k]));ix.forEach((i,q)=>{M[i]['pr'+k]=rk[q];});});});
  M.forEach(m=>{
    const parts=[[.3,m.pr1M],[.4,m.pr3M],[.3,m.pr6M]].filter(p=>p[1]!=null);const ws=parts.reduce((a,p)=>a+p[0],0)||1;
    m.mom=parts.reduce((a,p)=>a+p[0]*p[1],0)/ws;
    const prox=clamp(1+m.pctHigh/.15,0,1), vs=clamp(m.volMax3/2,0,1);
    let sc=40*m.mom+20*prox+15*vs+15*(m.trend?1:0)+10*(m.fresh?1:0);
    if(m.ext!=null)sc-=clamp(m.ext-3,0,2)*5;
    m.score=clamp(sc,0,100);
    if(m.fresh&&m.brkVolOK)m.sig=['Breakout','brk'];
    else if(m.fresh)m.sig=['Breakout, light volume','blue'];
    else if(m.pctHigh>-0.03)m.sig=['Near high','blue'];
    else if(m.trend)m.sig=['Uptrend',''];
    else if(!m.above50)m.sig=['Below 50DMA','bad'];
    else m.sig=['Neutral',''];
    m.T=detectSetups(DATA[m.sym],m);
  });
  return M;
}

/* ---------- CSV import ---------- */
function splitLine(line,d){const o=[];let cur='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){q=!q;}else if(ch===d&&!q){o.push(cur);cur='';}else cur+=ch;}o.push(cur);return o;}
const MON={jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
function pdate(s){s=String(s).trim().replace(/"/g,'');let m;
  if((m=s.match(/^(\d{4})-(\d{2})-(\d{2})/)))return m[1]+'-'+m[2]+'-'+m[3];
  if((m=s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/)))return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
  if((m=s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s](\d{4})/))&&MON[m[2].toLowerCase()])return m[3]+'-'+MON[m[2].toLowerCase()]+'-'+m[1].padStart(2,'0');
  return null;}
function normCap(x){x=String(x).toLowerCase();return x.includes('large')||x.includes('blue')?'Large':x.includes('mid')?'Mid':x.includes('small')||x.includes('micro')?'Small':'–';}
function capFromMcap(x){return x==null?'–':x>=CAPCUT.large?'Large':x>=CAPCUT.mid?'Mid':'Small';}
function parseCSV(text,fallbackSym){
  const lines=text.replace(/\r/g,'').split('\n').filter(x=>x.trim());if(lines.length<2)return {err:'The file has no data rows.'};
  const d=lines[0].includes('\t')?'\t':lines[0].includes(';')&&!lines[0].includes(',')?';':',';
  const head=splitLine(lines[0],d).map(x=>x.toLowerCase().replace(/[^a-z]/g,''));
  const col=names=>{for(const n of names){const k=head.indexOf(n);if(k>-1)return k;}return -1;};
  const ci={sym:col(['symbol','ticker','code','scrip']),nm:col(['name','companyname','company','securityname']),cap:col(['cap','capclass','capcategory','segment','marketcapcategory']),mc:col(['marketcapcr','mcapcr','mcap','marketcap']),date:col(['date','timestamp','datetime']),o:col(['open']),h:col(['high']),l:col(['low']),c:col(['close','last','price']),ac:col(['adjclose','adjustedclose']),v:col(['volume','vol','totalvolume','totaltradedquantity']),sec:col(['sector','industry'])};
  if(ci.date<0||(ci.c<0&&ci.ac<0)||ci.h<0||ci.l<0)return {err:'Header must include date, high, low and close (open and volume are strongly recommended).'};
  if(ci.sym<0&&!fallbackSym)return {err:'This file has no symbol column. Type a symbol name in the box, then load it again.'};
  const map={};let bad=0;
  for(let r=1;r<lines.length;r++){
    const f=splitLine(lines[r],d), dt=pdate(f[ci.date]);const num=k=>k<0?NaN:parseFloat(String(f[k]).replace(/,/g,''));
    const close=ci.c>=0?num(ci.c):num(ci.ac);
    if(!dt||!isFinite(close)||!isFinite(num(ci.h))||!isFinite(num(ci.l))){bad++;continue;}
    const sym=(ci.sym>=0?f[ci.sym]:fallbackSym).trim().toUpperCase().replace(/"/g,'');if(!sym){bad++;continue;}
    const o=map[sym]||(map[sym]={sym,sector:'–',rows:[]});
    if(ci.sec>=0&&f[ci.sec]&&f[ci.sec].trim())o.sector=f[ci.sec].trim().replace(/"/g,'');
    if(ci.nm>=0&&f[ci.nm]&&f[ci.nm].trim())o.name=f[ci.nm].trim().replace(/"/g,'');
    if(ci.cap>=0&&f[ci.cap])o.cap=normCap(f[ci.cap]);
    if(ci.mc>=0){const x=parseFloat(String(f[ci.mc]).replace(/,/g,''));if(isFinite(x)&&x>0)o.mcap=x>1e8?x/1e7:x;}
    const op=ci.o>=0?num(ci.o):close, vol=ci.v>=0?num(ci.v):0;
    o.rows.push([dt,isFinite(op)?op:close,num(ci.h),num(ci.l),close,isFinite(vol)?vol:0]);
  }
  const out={};let skipped=0;
  Object.keys(map).forEach(k=>{const rows=map[k].rows.sort((a,b)=>a[0]<b[0]?-1:1).filter((x,i,a)=>i===0||x[0]!==a[i-1][0]);
    if(rows.length<40){skipped++;return;}
    out[k]={sym:k,sector:map[k].sector,name:map[k].name||'',cap:map[k].cap&&map[k].cap!=='–'?map[k].cap:capFromMcap(map[k].mcap),mcap:map[k].mcap||null,d:rows.map(x=>x[0]),o:rows.map(x=>x[1]),h:rows.map(x=>x[2]),l:rows.map(x=>x[3]),c:rows.map(x=>x[4]),v:rows.map(x=>x[5])};});
  return {data:out,bad,skipped};
}
if(typeof module!=='undefined')module.exports={TF,CAPCUT,clamp,sma,rsiArr,atrArr,prep,priorHigh,brkAt,volX,calcOne,prRank,detectSetups,computeAll,splitLine,pdate,normCap,capFromMcap,parseCSV};
