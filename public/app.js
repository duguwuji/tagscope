'use strict';
/* TagScope — © 2026 Hill (Hill@iotrfid.top) */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt = n => Number(n).toLocaleString('zh-CN');
const tstr = ts => ts ? new Date(ts).toLocaleTimeString('zh-CN',{hour12:false})+'.'+String(ts%1000).padStart(3,'0') : '';
const DEFAULT_MODES=[[0,'Max Throughput'],[1,'Hybrid'],[2,'Dense Reader M4'],[3,'Dense Reader M8'],[4,'MaxMiller'],[1000,'AutoSet Dense Reader'],[1002,'AutoSet Static'],[1003,'AutoSet Static Fast'],[1004,'AutoSet Static DRM']].map(([id,n])=>({id,label:`${id} · ${n}`}));
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),5000);}
// ---------- backends: bridge (node server.js) or in-browser simulator ----------
const CLOUD = !!window.TAGSCOPE_CLOUD || location.protocol==='file:';
const normUrl = u => { u=String(u||'').trim().replace(/\/+$/,''); if(u&&!/^https?:\/\//i.test(u)) u='http://'+u; return u; };
let bridgeUrl = (()=>{ try{ return normUrl(JSON.parse(localStorage.getItem('tagscope.bridge'))); }catch(_){ return ''; } })() || 'http://localhost:8080';
let backend = null;
const handlers = { state: s=>applyState(s), log: l=>addLog(l), tags: b=>ingest(b) };
function api(p,b){ return backend.api(p,b); }
function showOffline(){ const o=$('#offline'); o.innerHTML = CLOUD
  ? `未连接到 TagScope 桥接服务（<span class="mono">${esc(backend.base)}</span>）。请在本机运行 <b>node server.js</b> 并保持窗口打开；如浏览器询问是否允许访问本地网络 / 本设备上的应用，请选择“允许”。仅体验界面可把数据源改为“模拟器”。`
  : '未检测到 TagScope 桥接服务。请在本机运行 <b>node server.js</b>，然后打开 http://localhost:8080 。'; o.hidden=false; }
// Chrome Local Network Access: a public https page needs targetAddressSpace to reach http:// LAN hosts.
function addrSpace(base){ try{ const h=new URL(base).hostname.replace(/^\[|\]$/g,''); if(!base||h==='localhost'||/^127\./.test(h)||h==='::1') return null;
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|f[cd]|fe80:)/i.test(h)||/\.local$/i.test(h)?'local':null; }catch(_){ return null; } }
async function xfetch(url,opt,space){ if(space&&location.protocol==='https:'){ try{ return await fetch(url,{...opt,targetAddressSpace:space}); }catch(e){ if(!/targetAddressSpace|enum/i.test(e.message)) throw e; } } return fetch(url,opt); }
function makeBridge(base){
  const me={kind:'bridge',base,closed:false,ctl:null}, space=CLOUD?addrSpace(base):null;
  const emit=(ev,d)=>{ if(!me.closed&&backend===me) handlers[ev](d); };
  me.api=async(p,b)=>{ let r;
    try{ r=await xfetch(base+'/api/'+p,{method:b===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:b===undefined?undefined:JSON.stringify(b)},space); }
    catch(e){ throw new Error(`无法连接桥接服务 ${base||location.origin}，请确认已在本机运行 node server.js`); }
    const j=await r.json().catch(()=>({error:r.status+' '+r.statusText})); if(!r.ok) throw new Error(j.error||r.statusText); return j; };
  // Server-sent events read over fetch (works cross-origin and with targetAddressSpace); auto-reconnects.
  const lost=()=>{ if(!me.closed&&backend===me){ showOffline(); if(S.connected) handlers.state({connected:false,running:false,info:null}); } };
  me.open=async()=>{ while(!me.closed){ me.ctl=new AbortController();
    try{ const r=await xfetch(base+'/api/events',{headers:{Accept:'text/event-stream'},cache:'no-store',signal:me.ctl.signal},space); if(!r.ok||!r.body) throw new Error(r.status);
      const rd=r.body.pipeThrough(new TextDecoderStream()).getReader(); let buf='';
      for(;;){ const {value,done}=await rd.read(); if(done) break; buf+=value; let i;
        while((i=buf.indexOf('\n\n'))>=0){ const blk=buf.slice(0,i); buf=buf.slice(i+2); let ev='message',data='';
          for(const ln of blk.split('\n')){ if(ln.startsWith('event:')) ev=ln.slice(6).trim(); else if(ln.startsWith('data:')) data+=ln.slice(5).trim(); }
          if(!data||!handlers[ev]) continue; if(ev==='state'&&backend===me) $('#offline').hidden=true; emit(ev,JSON.parse(data)); } } }
    catch(e){ if(me.closed) return; }
    lost(); await new Promise(r=>setTimeout(r,3000)); } };
  me.close=()=>{ me.closed=true; me.ctl&&me.ctl.abort(); };
  return me;
}
function makeLocal(){
  const rnd=(a,b)=>a+Math.random()*(b-a), hex=n=>Array.from({length:n},()=>'0123456789ABCDEF'[Math.random()*16|0]).join('');
  const me={kind:'local',base:'',closed:false};
  let db=[], info=null, connected=false, running=false, timer=null, runTimer=null, startedAt=0, lastCfg=null, batch=new Map(), batchReads=0, abusy=false;
  const emit=(ev,d)=>{ if(!me.closed&&backend===me) handlers[ev](d); };
  const log=(level,msg)=>emit('log',{level,msg,ts:Date.now()});
  const state=()=>({connected,running,info,startedAt,driver:connected?'sim':null,cfg:lastCfg});
  const push=()=>emit('state',state());
  const flush=setInterval(()=>{ if(!batch.size) return; const reads=[...batch.values()]; batch=new Map(); emit('tags',{reads,total:batchReads,ts:Date.now()}); batchReads=0; },200);
  function onTag(t){ batchReads++; const k=t.epc+'|'+t.antenna, b=batch.get(k);
    if(!b) batch.set(k,{...t,count:1,maxRssi:t.rssi,minRssi:t.rssi,rssiSum:t.rssi,rssiN:1,firstTs:t.ts});
    else { b.count++; b.rssi=t.rssi; b.rssiSum+=t.rssi; b.rssiN++; b.maxRssi=Math.max(b.maxRssi,t.rssi); b.minRssi=Math.min(b.minRssi,t.rssi); b.phase=t.phase; b.doppler=t.doppler??b.doppler; b.channel=t.channel; b.freq=t.freq; b.tid=t.tid||b.tid; b.pc=t.pc; b.ts=t.ts; } }
  function simStart(c){ const ants=c.antennas.filter(a=>a.enabled); if(!ants.length) throw new Error('请至少启用一个天线');
    const rate={0:1100,1:800,2:450,3:300,4:600,1000:700,1002:900}[+c.mode]||600; clearInterval(timer);
    timer=setInterval(()=>{ const n=Math.round(rate/20*rnd(0.7,1.3));
      for(let i=0;i<n;i++){ const a=ants[Math.random()*ants.length|0], t=db[Math.random()*db.length|0]; if(t.killed) continue;
        const rssi=t.base+(a.txDbm-30)*0.9-(t.ant===a.id?0:rnd(4,14))+rnd(-2,2); if(rssi<(+a.rxDbm||-80)) continue;
        if(c.filter?.enabled&&c.filter.mask&&c.filter.bank==='epc'){ const m=c.filter.mask.replace(/\s/g,'').toUpperCase(), off=Math.max(0,(+c.filter.pointer-32)/4), hit=t.epc.substr(off,m.length)===m; if(hit===(c.filter.action==='exclude')) continue; }
        t.angle=(t.angle+rnd(-6,6)+360)%360; const ch=1+(Math.random()*50|0);
        onTag({epc:t.epc,tid:c.fastId?t.tid:undefined,antenna:a.id,rssi:Math.round(rssi*2)/2,phase:+t.angle.toFixed(1),doppler:c.doppler?+rnd(-3,3).toFixed(2):undefined,channel:ch,freq:902.75+(ch-1)*0.5,pc:t.pc,count:1,ts:Date.now()}); } },50); }
  async function start(c){ if(!connected) throw new Error('未连接读写器'); lastCfg=c; simStart(c); running=true; startedAt=Date.now();
    log('info',`开始盘点：模式 ${c.mode}，Session ${c.session}，天线 ${c.antennas.filter(a=>a.enabled).map(a=>a.id).join(',')}`);
    clearTimeout(runTimer); if(+c.duration>0) runTimer=setTimeout(()=>stop(),+c.duration*1000); push(); }
  async function stop(){ clearTimeout(runTimer); clearInterval(timer); if(running){ running=false; log('info','盘点已停止'); } push(); }
  async function access(r){ if(!connected) throw new Error('未连接读写器'); if(abusy) throw new Error('上一个标签操作尚未完成'); abusy=true; log('info',`标签操作 ${r.op} → ${r.targetEpc||'任意标签'}`);
    try{ await new Promise(res=>setTimeout(res,150)); const tg=(r.targetEpc||'').replace(/\s/g,'').toUpperCase(), t=tg?db.find(x=>x.epc===tg&&!x.killed):db[0]; let o;
      if(!t) o={ok:false,op:r.op,message:'超时（未找到目标标签）'};
      else if(r.op==='read'){ const m=r.bank==='epc'?'0000'+t.pc+t.epc:r.bank==='tid'?t.tid:r.bank==='user'?t.user:t.reserved, p=(+r.wordPointer||0)*4, c=(+r.wordCount||(m.length/4-(+r.wordPointer||0)))*4; o=p+c>m.length?{ok:false,op:'read',result:4,message:'存储区越界'}:{ok:true,op:'read',epc:t.epc,message:'成功',data:m.substr(p,c)}; }
      else if(r.op==='write'){ const d=(r.data||'').replace(/\s/g,'').toUpperCase(), p=(+r.wordPointer||0)*4;
        if(r.bank==='tid') o={ok:false,op:'write',result:2,message:'存储区已锁定'};
        else { if(r.bank==='user') t.user=(t.user.slice(0,p)+d+t.user.slice(p+d.length)).slice(0,128); else if(r.bank==='reserved') t.reserved=(t.reserved.slice(0,p)+d+t.reserved.slice(p+d.length)).slice(0,16); o={ok:true,op:'write',epc:t.epc,message:'成功',words:d.length/4}; } }
      else if(r.op==='writeEpc'){ const d=(r.data||'').replace(/\s/g,'').toUpperCase(); t.epc=d; t.pc=(((d.length/4)<<11)|0).toString(16).padStart(4,'0').toUpperCase(); o={ok:true,op:'write',epc:d,message:'成功',words:d.length/4}; }
      else if(r.op==='lock') o={ok:true,op:'lock',epc:t.epc,message:'成功'};
      else if(r.op==='kill'){ if(!parseInt(r.password||'0',16)) o={ok:false,op:'kill',result:1,message:'灭活密码为 0'}; else { t.killed=true; o={ok:true,op:'kill',epc:t.epc,message:'成功'}; } }
      else throw new Error('未知操作');
      log(o.ok?'info':'warn',`标签操作 ${r.op}：${o.message}${o.data?' 数据 '+o.data:''}`); return o; } finally{ abusy=false; } }
  const routes={
    state:async()=>state(),
    connect:async o=>{ if(o.driver!=='sim') throw new Error('连接真实读写器需要本机桥接服务（node server.js）');
      db=Array.from({length:Math.max(1,Math.min(2000,+o.simTags||40))},(_,i)=>({epc:'E28011700000'+hex(12),tid:'E28011702000'+hex(12),user:'0'.repeat(128),reserved:'0'.repeat(16),base:rnd(-72,-38),angle:rnd(0,360),ant:1+(i%4),killed:false,pc:'3000'}));
      info={driver:'模拟器（浏览器内）',host:'simulator',model:'模拟读写器（非真实设备）',serial:'SIM-0001',firmware:'sim-1.0',antennaCount:4,txPowerMin:10,txPowerMax:30,
        rxSensitivity:[-80,-75,-70,-65,-60,-55,-50].map((d,i)=>({index:i+1,dbm:d})),modes:[[0,'Max Throughput'],[1,'Hybrid'],[2,'Dense Reader M4'],[3,'Dense Reader M8'],[4,'MaxMiller'],[1000,'AutoSet Dense Reader'],[1002,'AutoSet Static']].map(([id,n])=>({id,label:`${id} · ${n}`})),
        supportsAccess:true,supportsDoppler:true,antennas:[1,2,3,4].map(id=>({id,connected:true}))};
      log('info','正在连接 模拟器（SIM）…'); connected=true; log('info',`已连接：${info.model} · 固件 ${info.firmware}`); push(); return state(); },
    disconnect:async()=>{ if(connected){ await stop(); connected=false; info=null; log('info','已断开连接'); push(); } return state(); },
    start:async c=>{ await start(c); return state(); },
    stop:async()=>{ await stop(); return state(); },
    config:async c=>{ lastCfg=c; if(running) await start(c); return state(); },
    access:async r=>access(r),
  };
  me.api=(p,b)=>routes[p](b);
  me.open=()=>{ $('#offline').hidden=true; push(); };
  me.close=()=>{ me.closed=true; clearInterval(flush); clearInterval(timer); clearTimeout(runTimer); };
  return me;
}
function pickBackend(){
  const local = CLOUD && (!source || source.driver==='sim'), base = CLOUD ? bridgeUrl : '';
  if(backend && (local ? backend.kind==='local' : backend.kind==='bridge'&&backend.base===base)) return;
  if(backend) backend.close();
  backend = local ? makeLocal() : makeBridge(base);
  $('#offline').hidden=true; S={connected:false,running:false,info:null}; backend.open();
}
const store = { get(k,d){ try{ const v=localStorage.getItem('tagscope.'+k); return v==null?d:JSON.parse(v);}catch(_){return d;} }, set(k,v){ localStorage.setItem('tagscope.'+k, JSON.stringify(v)); } };

// ---------- state ----------
let S={connected:false,running:false,info:null}, busy=false;
let source = store.get('source', null);
let cfg = store.get('cfg', { ants:'1', mode:1002, modeCustom:0, pop:32, session:1, search:2, power:30, rx:'', duration:0, fastId:false, doppler:false, per:{}, filter:{enabled:false,bank:'epc',action:'include',pointer:32,len:'',mask:''} });
let profiles = store.get('profiles', {});
let tags=new Map(), order=0, totalReads=0, sec=0, rateNow=0, selected=null, toi=null, readLog=[];
let sort={key:'idx',dir:1}, view='table', elapsed=0;

// ---------- columns (ItemTest names) ----------
const COLS=[
 {k:'idx',l:'#',n:1,on:1},{k:'epc',l:'EPC',m:1,on:1},{k:'tid',l:'TID',m:1,on:1},{k:'pc',l:'PC',m:1,on:0},{k:'count',l:'读取次数',n:1,on:1},
 {k:'from',l:'最后读取自',on:1},{k:'first',l:'首次读取',on:1,f:tstr},{k:'last',l:'最后读取',on:1,f:tstr},{k:'since',l:'距上次读取（秒）',n:1,on:1,f:v=>(v/1000).toFixed(1)},
 {k:'rssi',l:'最近 RSSI',n:1,on:1,f:v=>v.toFixed(1)},{k:'avg',l:'RSSI 平均',n:1,on:1,f:v=>v.toFixed(1)},{k:'max',l:'RSSI 最大',n:1,on:1,f:v=>v.toFixed(1)},{k:'min',l:'RSSI 最小',n:1,on:1,f:v=>v.toFixed(1)},
 {k:'antenna',l:'天线',n:1,on:1},{k:'power',l:'功率',n:1,on:1,f:v=>v.toFixed(2)},{k:'phase',l:'相位角',n:1,on:1,f:v=>(+v).toFixed(1)},{k:'doppler',l:'多普勒频率',n:1,on:1,f:v=>(+v).toFixed(2)},
 {k:'freq',l:'频率 MHz',n:1,on:0,f:v=>(+v).toFixed(2)},{k:'rate',l:'读速 /秒',n:1,on:0,f:v=>v.toFixed(1)}];
let colOn = store.get('cols', Object.fromEntries(COLS.map(c=>[c.k,!!c.on])));
let listOn = store.get('listCols', {tid:true,count:true,antenna:true,rssi:true,last:true,from:false,avg:false,phase:false});

// ---------- navigation ----------
function show(v){ $$('.view').forEach(x=>x.hidden = x.id!=='v-'+v); $$('.nav-i[data-view]').forEach(b=>b.toggleAttribute('aria-current', b.dataset.view===v)); $$('.nav-i[data-view]').forEach(b=>{ if(b.dataset.view===v) b.setAttribute('aria-current','page'); }); if(v==='inventory') render(true); }
$$('.nav-i[data-view]').forEach(b=>b.onclick=()=>show(b.dataset.view));

// ---------- data source ----------
function renderSource(){
  const el=$('#dsList');
  if(!source){ el.innerHTML='<div class="ds-empty">点击 + 添加读写器</div>'; return; }
  const ifn={llrp:'LLRP',rest:'IoT 接口',sim:'模拟器'}[source.driver];
  el.innerHTML=`<div class="ds"><div class="nm" id="ds-open" title="读写器设置" tabindex="0"><b>${esc(source.nick||source.host||'模拟读写器')}</b><span>${ifn}${S.connected?' · '+(S.running?'盘点中':'已连接'):''}</span></div>
   <label class="sw ${busy?'busy':''}" title="启用 / 停用"><input type="checkbox" id="ds-sw" aria-label="启用数据源" ${S.connected?'checked':''} ${busy?'disabled':''}><span></span></label>
   <button class="ib" id="ds-gear" title="读写器设置" aria-label="读写器设置"><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1"/></svg></button><button class="ib" id="ds-del" title="移除数据源" aria-label="移除数据源"><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div>`;
  $('#ds-sw').onchange=e=>toggleSource(e.target.checked);
  $('#ds-gear').onclick=openSettings; $('#ds-open').onclick=openSettings; $('#ds-open').onkeydown=e=>{if(e.key==='Enter')openSettings();};
  $('#ds-del').onclick=async()=>{ if(S.connected) await toggleSource(false); source=null; store.set('source',null); pickBackend(); renderSource(); };
}
async function toggleSource(on){
  busy=true; renderSource();
  try{
    if(on){ const s=source; applyState(await api('connect',{driver:s.driver,host:s.host,port:s.port||undefined,tls:s.tls,user:s.user,pass:s.pass||'impinj',insecure:s.insecure,simTags:s.simTags})); }
    else applyState(await api('disconnect',{}));
  }catch(e){ toast(e.message); }
  busy=false; renderSource();
}
function dsUI(){ const d=$('#d-if').value; $$('.d-rest').forEach(e=>e.hidden=d!=='rest'); $$('.d-sim').forEach(e=>e.hidden=d!=='sim'); $$('.d-nsim').forEach(e=>e.hidden=d==='sim'); $$('.d-bridge').forEach(e=>e.hidden=!CLOUD||d==='sim'); $$('.d-simc').forEach(e=>e.hidden=!CLOUD||d!=='sim'); $('#d-port').placeholder=d==='rest'?($('#d-tls').value==='1'?'443':'80'):'5084'; }
$('#d-if').onchange=dsUI; $('#d-tls').onchange=dsUI;
$('#ds-add').onclick=()=>{ const s=source||{}; $('#d-host').value=s.host||''; $('#d-nick').value=s.nick||''; $('#d-if').value=s.driver||'llrp'; $('#d-port').value=s.port||''; $('#d-tls').value=s.tls===false?'0':'1'; $('#d-user').value=s.user||'root'; $('#d-ins').checked=s.insecure!==false; $('#d-sim').value=s.simTags||40; $('#d-bridge').value=bridgeUrl; dsUI(); openDlg('#dlg-ds'); $('#d-host').focus(); };
$('#d-ok').onclick=async()=>{ const d=$('#d-if').value; if(d!=='sim'&&!$('#d-host').value.trim()) return toast('请输入主机名或 IP 地址');
  if(S.connected) await toggleSource(false);
  if(CLOUD&&d!=='sim'){ bridgeUrl=normUrl($('#d-bridge').value)||'http://localhost:8080'; store.set('bridge',bridgeUrl); }
  source={driver:d,host:$('#d-host').value.trim(),nick:$('#d-nick').value.trim(),port:+$('#d-port').value||0,tls:$('#d-tls').value==='1',user:$('#d-user').value,pass:$('#d-pass').value,insecure:$('#d-ins').checked,simTags:+$('#d-sim').value};
  store.set('source',{...source,pass:''}); closeDlg('#dlg-ds'); pickBackend(); renderSource(); toggleSource(true); };

// ---------- dialogs ----------
function openDlg(id){ $(id).hidden=false; }
function closeDlg(id){ $(id).hidden=true; }
$$('[data-close]').forEach(b=>b.onclick=()=>b.closest('.ov').hidden=true);
$$('.ov').forEach(o=>o.addEventListener('mousedown',e=>{ if(e.target===o) o.hidden=true; }));
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ $$('.ov').forEach(o=>o.hidden=true); hideMenu(); } });
$$('#dlg-set .tabs button').forEach(b=>b.onclick=()=>{ $$('#dlg-set .tabs button').forEach(x=>{x.setAttribute('aria-selected',x===b); $('#'+x.dataset.p).hidden=x!==b;}); });

// ---------- reader settings ----------
function fillSettings(c){
  const info=S.info||{}, modes=info.modes&&info.modes.length?info.modes:DEFAULT_MODES;
  $('#s-mode').innerHTML=modes.map(m=>`<option value="${m.id}">${esc(m.label)}</option>`).join('')+'<option value="custom">自定义…</option>';
  $('#s-mode').value=[...$('#s-mode').options].some(o=>o.value==String(c.mode))?String(c.mode):'custom'; $('#s-mc').value=c.mode; $('#s-mc-w').hidden=$('#s-mode').value!=='custom';
  const rx=[...new Set((info.rxSensitivity||[]).map(r=>r.dbm))].sort((a,b)=>a-b);
  const rxOpts='<option value="">最大</option>'+rx.map(d=>`<option value="${d}">${d}</option>`).join('');
  $('#s-rx').innerHTML=rxOpts; $('#s-rx').value=String(c.rx??'');
  $('#s-ants').value=c.ants; $('#s-pop').value=c.pop; $('#s-ses').value=c.session; $('#s-search').value=c.search; $('#s-pwr').value=c.power; $('#s-pwr').min=info.txPowerMin??10; $('#s-pwr').max=info.txPowerMax??32.5;
  $('#s-dur').value=c.duration; $('#s-fastid').checked=c.fastId; $('#s-dop').checked=c.doppler;
  const n=Math.min(info.antennaCount||4,32), conn=Object.fromEntries((info.antennas||[]).map(a=>[a.id,a.connected]));
  $('#antBody').innerHTML=Array.from({length:n},(_,i)=>{const id=i+1,p=c.per[id]||{}; return `<tr data-id="${id}"><td>${id}</td><td>${conn[id]===undefined?'—':conn[id]?'<span style="color:var(--ok)">● 已连接</span>':'<span style="color:var(--mu)">○ 未检测到</span>'}</td>
    <td><input type="number" class="pp" step="0.25" placeholder="${c.power}" value="${p.power??''}" aria-label="天线 ${id} 功率"></td><td><select class="pr" aria-label="天线 ${id} 灵敏度"><option value="">（默认）</option>${rx.map(d=>`<option value="${d}" ${String(p.rx)===String(d)?'selected':''}>${d}</option>`).join('')}</select></td></tr>`;}).join('');
  const f=c.filter; $('#f-on').checked=f.enabled; $('#f-bank').value=f.bank; $('#f-act').value=f.action; $('#f-ptr').value=f.pointer; $('#f-len').value=f.len; $('#f-mask').value=f.mask;
  $('#p-sel').innerHTML='<option value="">（当前设置）</option>'+Object.keys(profiles).map(k=>`<option>${esc(k)}</option>`).join('');
}
$('#s-mode').onchange=()=>$('#s-mc-w').hidden=$('#s-mode').value!=='custom';
$('#p-sel').onchange=()=>{ const p=profiles[$('#p-sel').value]; if(p) fillSettings(JSON.parse(JSON.stringify(p))); };
function readSettings(){
  const m=$('#s-mode').value, per={};
  $$('#antBody tr').forEach(tr=>{ const pw=tr.querySelector('.pp').value, rx=tr.querySelector('.pr').value; if(pw!==''||rx!=='') per[tr.dataset.id]={power:pw===''?undefined:+pw, rx:rx===''?undefined:+rx}; });
  return { ants:$('#s-ants').value, mode:m==='custom'?+$('#s-mc').value:+m, pop:+$('#s-pop').value, session:+$('#s-ses').value, search:+$('#s-search').value, power:+$('#s-pwr').value, rx:$('#s-rx').value===''?'':+$('#s-rx').value,
    duration:+$('#s-dur').value, fastId:$('#s-fastid').checked, doppler:$('#s-dop').checked, per,
    filter:{enabled:$('#f-on').checked,bank:$('#f-bank').value,action:$('#f-act').value,pointer:+$('#f-ptr').value,len:$('#f-len').value,mask:$('#f-mask').value.replace(/\s/g,'')} };
}
function antList(c){ return [...new Set(String(c.ants).split(/[\s,，;]+/).map(Number).filter(n=>n>0&&n<=64))].sort((a,b)=>a-b); }
function wire(c){ const max=Math.max(4,S.info?.antennaCount||4), on=new Set(antList(c));
  return { mode:c.mode, searchMode:c.search, session:c.session, tagPopulation:c.pop, duration:c.duration, fastId:c.fastId, doppler:c.doppler,
    antennas:Array.from({length:max},(_,i)=>{const id=i+1,p=c.per[id]||{}; return {id,enabled:on.has(id),txDbm:p.power??c.power,rxDbm:p.rx??c.rx};}),
    filter:{enabled:c.filter.enabled,bank:c.filter.bank,action:c.filter.action,pointer:c.filter.pointer,maskBits:c.filter.len,mask:c.filter.mask} }; }
function openSettings(){ fillSettings(cfg); $$('#dlg-set .tabs button')[0].click(); openDlg('#dlg-set'); }
$('#b-settings').onclick=openSettings;
$('#s-ok').onclick=async()=>{ const c=readSettings(); if(!antList(c).length) return toast('请至少填写一个天线编号'); cfg=c; store.set('cfg',cfg); closeDlg('#dlg-set');
  if(S.connected){ try{ applyState(await api('config',wire(cfg))); addLog({level:'info',msg:'读写器设置已应用'+(S.running?'，盘点已重新启动':''),ts:Date.now()}); }catch(e){ toast(e.message); } } };
$('#p-save').onclick=()=>{ const n=prompt('配置名称',`配置 ${Object.keys(profiles).length+1}`); if(!n) return; profiles[n]=readSettings(); store.set('profiles',profiles); fillSettings(profiles[n]); $('#p-sel').value=n; };

// ---------- state from server ----------
function applyState(s){
  const wasConn=S.connected; S=s;
  $('#b-start').disabled=!s.connected||s.running; $('#b-stop').disabled=!s.running; $('#b-settings').disabled=!source;
  ['#m-read','#m-write','#x-wepc','#x-lock','#x-kill'].forEach(id=>$(id).disabled=!s.connected||!s.info?.supportsAccess);
  $('#sb-dot').className='dot'+(s.running?' run':s.connected?' on':''); $('#sb-state').textContent=s.running?'盘点中':s.connected?`已连接 · ${s.info.model}`:'未连接';
  $('#sb-sim').hidden=s.driver!=='sim';
  $('#aboutReader').innerHTML=s.connected?Object.entries({驱动:s.info.driver,型号:s.info.model,'序列号 / ID':s.info.serial||'—',固件:s.info.firmware||'—',天线端口:s.info.antennaCount,功率范围:`${s.info.txPowerMin} – ${s.info.txPowerMax} dBm`,'Impinj 扩展':s.info.impinjExtensions===undefined?'—':s.info.impinjExtensions?'已启用':'不可用'}).map(([k,v])=>`${k}：<span class="mono">${esc(v)}</span>`).join('<br>'):'未连接';
  if(s.connected&&!wasConn&&S.info&&source&&source.driver!==s.driver){}
  renderSource();
}

// ---------- events ----------

function ingest(b){
  totalReads+=b.total; sec+=b.total; const from=source?.nick||source?.host||'模拟读写器';
  for(const r of b.reads){
    let t=tags.get(r.epc);
    if(!t){ t={idx:++order,epc:r.epc,count:0,first:r.firstTs,sum:0,n:0,max:-999,min:999}; tags.set(r.epc,t); }
    t.count+=r.count; t.last=r.ts; t.from=from; t.antenna=r.antenna; t.rssi=r.rssi; t.sum+=r.rssiSum||0; t.n+=r.rssiN||0;
    if(r.maxRssi!=null) t.max=Math.max(t.max,r.maxRssi); if(r.minRssi!=null) t.min=Math.min(t.min,r.minRssi);
    t.tid=r.tid||t.tid; t.pc=r.pc||t.pc; t.phase=r.phase; t.doppler=r.doppler; t.freq=r.freq;
    const w=wire(cfg).antennas.find(a=>a.id===r.antenna); t.power=w?+w.txDbm:undefined;
    if($('#lg-on').checked){ readLog.push([new Date(r.ts).toISOString(),r.epc,r.tid||'',r.antenna,r.count,r.rssi??'',r.phase??'',r.freq??'']); if(readLog.length>500000) readLog.shift(); }
  }
}
setInterval(()=>{ rateNow=sec; sec=0; $('#lg-info').textContent=`已记录 ${fmt(readLog.length)} 条读取。`; },1000);

// ---------- table ----------
function cell(t,c){ let v = c.k==='since'?Date.now()-t.last : c.k==='avg'?(t.n?t.sum/t.n:undefined) : c.k==='max'?(t.max>-999?t.max:undefined) : c.k==='min'?(t.min<999?t.min:undefined) : c.k==='rate'?t.count/Math.max(1,(t.last-t.first)/1000) : t[c.k];
  return v; }
function rowsData(){ let r=[...tags.values()];
  if(toi){ if($('#toiOnly').checked) r=r.filter(t=>toi.set.has(t.epc)); if($('#toiOnly').checked) for(const e of toi.set) if(!tags.has(e)) r.push({idx:'',epc:e,miss:true}); }
  const c=COLS.find(x=>x.k===sort.key)||COLS[0];
  r.sort((a,b)=>{ if(a.miss!==b.miss) return a.miss?1:-1; const x=cell(a,c),y=cell(b,c); if(x==null) return 1; if(y==null) return -1; return (x>y?1:x<y?-1:0)*sort.dir; }); return r; }
function renderHead(){ $('#thead').innerHTML=COLS.filter(c=>colOn[c.k]).map(c=>`<th data-k="${c.k}" scope="col" ${sort.key===c.k?`aria-sort="${sort.dir>0?'ascending':'descending'}"`:''}>${c.l}</th>`).join(''); }
function shade(t){ if(t.miss) return '#fff'; const fade=(+$('#as-fade').value||10)*1000, age=Date.now()-t.last; if(age<1000) return '#fff'; const k=Math.min(1,(age-1000)/Math.max(1,fade-1000)); const v=Math.round(255-k*(255-160)); return `rgb(${v},${v},${v-2})`; }
function render(force){
  if($('#v-inventory').hidden) return;
  const r=rowsData(); $('#empty').hidden=r.length>0;
  $('#c-uniq').textContent=fmt(tags.size); $('#c-total').textContent=fmt(totalReads); $('#c-rate').textContent=fmt(rateNow);
  if(S.running&&S.startedAt) elapsed=Date.now()-S.startedAt; const s=Math.floor(elapsed/1000);
  $('#c-time').textContent=[s/3600,s%3600/60,s%60].map(x=>String(Math.floor(x)).padStart(2,'0')).join(':');
  if(toi){ const found=[...toi.set].filter(e=>tags.has(e)).length; $('#toiTxt').textContent=`关注标签（${toi.name}）：已读到 ${found} / ${toi.set.size}`; }
  const lim=r.slice(0,2000), vis=COLS.filter(c=>colOn[c.k]);
  if(view==='table'){
    $('#tbody').innerHTML=lim.map(t=>{ const bg=shade(t); return `<tr data-epc="${t.epc}" class="${t.epc===selected?'sel':''} ${t.miss?'miss':''}">`+vis.map(c=>{ if(t.miss) return `<td class="${c.m?'m':''}" style="background:${bg}">${c.k==='epc'?t.epc:c.k==='count'?'未读到':''}</td>`; const v=cell(t,c); return `<td class="${c.m?'m':''}${c.n?' n':''}" style="background:${bg}">${v==null||v===''?'':esc(c.f?c.f(v):v)}</td>`; }).join('')+'</tr>'; }).join('');
  } else {
    const F=[['tid','TID'],['count','次数'],['antenna','天线'],['rssi','RSSI'],['avg','RSSI 平均'],['phase','相位'],['from','读取自'],['last','最后读取']];
    $('#cards').innerHTML=lim.map(t=>`<div class="card ${t.epc===selected?'sel':''}" data-epc="${t.epc}" style="background:${shade(t)}"><div class="e">${t.epc}</div><div class="r">${t.miss?'未读到':F.filter(([k])=>listOn[k]).map(([k,l])=>{const c=COLS.find(x=>x.k===k),v=cell(t,c);return v==null?'':`<span>${l} <b>${esc(c.f?c.f(v):v)}</b></span>`;}).join('')}</div></div>`).join('');
  }
}
renderHead(); setInterval(render,333);
$('#thead').addEventListener('click',e=>{ const th=e.target.closest('th'); if(!th) return; const k=th.dataset.k; sort={key:k,dir:sort.key===k?-sort.dir:(['epc','tid','from','idx','first'].includes(k)?1:-1)}; renderHead(); render(); });
$('#thead').addEventListener('contextmenu',e=>{ e.preventDefault(); showMenu(e.clientX,e.clientY, COLS.map(c=>`<label><input type="checkbox" data-col="${c.k}" ${colOn[c.k]?'checked':''}>${c.l}</label>`).join(''), m=>m.querySelectorAll('input').forEach(i=>i.onchange=()=>{ colOn[i.dataset.col]=i.checked; store.set('cols',colOn); renderHead(); render(); buildColSettings(); })); });
function pick(e){ const r=e.target.closest('[data-epc]'); if(!r) return null; selected=r.dataset.epc; render(); return selected; }
['#tbody','#cards'].forEach(id=>{ $(id).addEventListener('click',pick); $(id).addEventListener('dblclick',e=>{ if(pick(e)) openMemory(selected); });
  $(id).addEventListener('contextmenu',e=>{ const epc=pick(e); if(!epc) return; e.preventDefault(); const t=tags.get(epc)||{};
    showMenu(e.clientX,e.clientY,`<button data-a="mem">标签存储访问</button><hr><button data-a="epc">复制 EPC</button>${t.tid?'<button data-a="tid">复制 TID</button>':''}<button data-a="flt">以此 EPC 设置过滤</button>`, m=>m.querySelectorAll('button').forEach(b=>b.onclick=()=>{ hideMenu(); const a=b.dataset.a;
      if(a==='mem') openMemory(epc); if(a==='epc') navigator.clipboard?.writeText(epc); if(a==='tid') navigator.clipboard?.writeText(t.tid);
      if(a==='flt'){ cfg.filter={...cfg.filter,enabled:true,bank:'epc',pointer:32,mask:epc,len:''}; store.set('cfg',cfg); openSettings(); $$('#dlg-set .tabs button')[2].click(); } })); }); });
function showMenu(x,y,html,bind){ const m=$('#menu'); m.innerHTML=html; m.hidden=false; const w=m.offsetWidth,h=m.offsetHeight; m.style.left=Math.min(x,innerWidth-w-8)+'px'; m.style.top=Math.min(y,innerHeight-h-8)+'px'; bind(m); }
function hideMenu(){ $('#menu').hidden=true; }
document.addEventListener('mousedown',e=>{ if(!e.target.closest('#menu')) hideMenu(); });
$('#vw-table').onclick=()=>{ view='table'; $('#vw-table').setAttribute('aria-pressed',true); $('#vw-list').setAttribute('aria-pressed',false); $('#grid').hidden=false; $('#cards').hidden=true; render(); };
$('#vw-list').onclick=()=>{ view='list'; $('#vw-list').setAttribute('aria-pressed',true); $('#vw-table').setAttribute('aria-pressed',false); $('#grid').hidden=true; $('#cards').hidden=false; render(); };

// ---------- inventory actions ----------
$('#b-start').onclick=async()=>{ try{ if(!antList(cfg).length) throw new Error('请在读写器设置中填写天线编号'); $('#b-start').disabled=true; applyState(await api('start',wire(cfg))); }catch(e){ toast(e.message); applyState(S); } };
$('#b-stop').onclick=async()=>{ try{ applyState(await api('stop',{})); }catch(e){ toast(e.message); } };
$('#b-clear').onclick=()=>{ tags.clear(); order=0; totalReads=0; selected=null; elapsed=0; if(S.running) S.startedAt=Date.now(); render(); };
function dl(name,lines){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv'})); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
function uniqueCsv(){ const vis=COLS.filter(c=>colOn[c.k]); return [vis.map(c=>c.l).join(',')].concat(rowsData().filter(t=>!t.miss).map(t=>vis.map(c=>{const v=cell(t,c); return v==null?'':(c.k==='first'||c.k==='last')?new Date(v).toISOString():c.f?c.f(v):v;}).join(','))); }
$('#b-csv').onclick=()=>dl(`TagScope-${stamp()}.csv`,uniqueCsv());
$('#lg-dl').onclick=()=>dl(`${$('#lg-prefix').value||'TagScope'}-reads-${stamp()}.csv`,['Time,EPC,TID,Antenna,Count,RSSI,Phase,FreqMHz',...readLog.map(r=>r.join(','))]);
$('#lg-dlu').onclick=()=>dl(`${$('#lg-prefix').value||'TagScope'}-unique-${stamp()}.csv`,uniqueCsv());
$('#lg-clr').onclick=()=>{ readLog=[]; $('#lg-info').textContent='已记录 0 条读取。'; };

// ---------- tags of interest ----------
$('#toi-add').onclick=()=>$('#toi-file').click();
$('#toi-file').onchange=async e=>{ const f=e.target.files[0]; if(!f) return; const txt=await f.text(); const set=new Set((txt.match(/[0-9A-Fa-f]{8,}/g)||[]).map(x=>x.toUpperCase()));
  if(!set.size) return toast('文件中没有找到 EPC（每行一个十六进制 EPC）'); toi={name:f.name,set}; e.target.value=''; renderToi(); };
function renderToi(){ $('#toiBar').hidden=!toi; $('#toiList').innerHTML=toi?`<div class="ds"><div class="nm"><b>${esc(toi.name)}</b><span>${toi.set.size} 个标签</span></div><button class="ib" id="toi-del" aria-label="移除关注标签"><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div>`:'<div class="ds-empty">未载入文件</div>'; if(toi) $('#toi-del').onclick=()=>{ toi=null; $('#toiOnly').checked=false; renderToi(); }; render(); }
$('#toiOnly').onchange=()=>render();

// ---------- tag memory showcase ----------
for(let i=1;i<=32;i++) $('#m-cnt').insertAdjacentHTML('beforeend',`<option ${i===8?'selected':''}>${i}</option>`);
for(let i=0;i<32;i++) $('#m-off').insertAdjacentHTML('beforeend',`<option>${i}</option>`);
function memGrid(data, fail){ const off=+$('#m-off').value, n=+$('#m-cnt').value, bank=$('#m-bank').value; let h='';
  for(let r=0;r<n;r+=8){ const words=[]; for(let i=r;i<Math.min(n,r+8);i++){ const w=fail?'XXXX':(data?data.substr(i*4,4):''); words.push(`<input type="text" maxlength="4" data-w="${i}" value="${w}" class="${fail?'x':''}${bank==='epc'&&off+i<2?' c':''}" aria-label="字 ${off+i}" title="${bank==='epc'&&off+i===0?'CRC-16':bank==='epc'&&off+i===1?'PC':'字 '+(off+i)}">`); }
    const hex=data&&!fail?data.substr(r*4,32):''; const asc=hex.replace(/(..)/g,(m)=>{const c=parseInt(m,16);return c>=32&&c<127?String.fromCharCode(c):'.';});
    h+=`<div class="wl">${off+r}</div><div class="ws">${words.join('')}</div><div class="asc">${esc(asc)}</div>`; }
  $('#mem').innerHTML=h; }
['#m-cnt','#m-off','#m-bank'].forEach(id=>$(id).addEventListener('change',()=>memGrid()));
function openMemory(epc){ $('#m-epc').value=epc; $('#x-epc').value=epc; show('memory'); }
async function access(req,btn){ const out=$('#m-res'); btn.disabled=true; out.className='res'; out.textContent='执行中…';
  try{ const r=await api('access',{targetEpc:$('#m-epc').value.replace(/\s/g,''),password:$('#m-pwd').value.replace(/\s/g,''),timeout:+$('#m-to').value,antenna:0,...req});
    out.className='res '+(r.ok?'ok':'bad'); out.textContent=`${r.ok?'✓':'✗'} ${r.message}${r.epc?' · EPC '+r.epc:''}${r.antenna?' · 天线 '+r.antenna:''}${r.words!=null?' · 写入 '+r.words+' 字':''}`; return r; }
  catch(e){ out.className='res bad'; out.textContent='✗ '+e.message; return null; } finally{ applyState(S); } }
const hexOk=(v,w)=>/^[0-9a-f]*$/i.test(v)&&(!w||v.length%4===0);
$('#m-read').onclick=async e=>{ if(!hexOk($('#m-pwd').value)) return toast('访问密码必须是十六进制'); const r=await access({op:'read',bank:$('#m-bank').value,wordPointer:+$('#m-off').value,wordCount:+$('#m-cnt').value},e.currentTarget); memGrid(r&&r.ok?r.data:null, !(r&&r.ok)); };
$('#m-write').onclick=async e=>{ const ws=$$('#mem input').map(i=>i.value.trim().toUpperCase()); if(!ws.length||ws.some(w=>!/^[0-9A-F]{4}$/.test(w))) return toast('每个字必须是 4 位十六进制，请先读取或填写全部字');
  if($('#m-bank').value==='tid') return toast('TID 存储区通常为只读');
  let ptr=+$('#m-off').value, data=ws.join(''); if($('#m-bank').value==='epc'&&ptr<2){ const skip=2-ptr; data=data.slice(skip*4); ptr=2; if(!data) return toast('CRC 和 PC 字不能直接写入'); }
  if(!confirm(`确定写入 ${data.length/4} 个字到 ${$('#m-bank').value.toUpperCase()} 存储区（从字 ${ptr} 开始）？`)) return;
  await access({op:'write',bank:$('#m-bank').value,wordPointer:ptr,data},e.currentTarget); };
$('#x-wepc').onclick=async e=>{ const d=$('#x-epc').value.replace(/\s/g,''); if(!d||!hexOk(d,true)) return toast('新 EPC 必须是十六进制，长度为 4 的倍数'); const r=await access({op:'writeEpc',data:d},e.currentTarget); if(r&&r.ok){ $('#m-epc').value=d; } };
$('#x-lock').onclick=async e=>{ const p=$('#x-priv').value; if(p.startsWith('perma')&&!confirm('永久锁定 / 永久解锁不可撤销，确定执行？')) return; await access({op:'lock',field:$('#x-field').value,privilege:p},e.currentTarget); };
$('#x-kill').onclick=async e=>{ const k=$('#x-kpwd').value.replace(/\s/g,''); if(!k||!hexOk(k)||!parseInt(k,16)) return toast('灭活密码必须是非零十六进制'); if(!confirm(`确定永久灭活标签 ${$('#m-epc').value||'（任意标签）'}？`)) return; await access({op:'kill',password:k},e.currentTarget); };
memGrid();

// ---------- application settings ----------
function buildColSettings(){
  $('#colsTable').innerHTML=COLS.map(c=>`<label class="chk"><input type="checkbox" data-c="${c.k}" ${colOn[c.k]?'checked':''}>${c.l}</label>`).join('');
  $('#colsTable').querySelectorAll('input').forEach(i=>i.onchange=()=>{ colOn[i.dataset.c]=i.checked; store.set('cols',colOn); renderHead(); });
  const F={tid:'TID',count:'读取次数',antenna:'天线',rssi:'最近 RSSI',avg:'RSSI 平均',phase:'相位角',from:'最后读取自',last:'最后读取'};
  $('#colsList').innerHTML=Object.entries(F).map(([k,l])=>`<label class="chk"><input type="checkbox" data-c="${k}" ${listOn[k]?'checked':''}>${l}</label>`).join('');
  $('#colsList').querySelectorAll('input').forEach(i=>i.onchange=()=>{ listOn[i.dataset.c]=i.checked; store.set('listCols',listOn); });
}
buildColSettings(); $('#as-fade').value=store.get('fade',10); $('#as-fade').onchange=()=>store.set('fade',+$('#as-fade').value);

// ---------- log ----------
const logEl=$('#log'); let logs=[];
function addLog(l){ logs.push(l); if(logs.length>800) logs.shift(); if(l.level!=='debug'){ const m=$('#sb-msg'); m.textContent=l.msg; m.className='msg '+l.level; } if(l.level==='debug'&&!$('#lgDebug').checked) return; appendLog(l); }
function appendLog(l){ const at=logEl.scrollTop+logEl.clientHeight>=logEl.scrollHeight-20; const d=document.createElement('div'); d.className=l.level; d.innerHTML=`<span class="t">${tstr(l.ts)}</span> ${esc(l.msg)}`; logEl.appendChild(d); while(logEl.childElementCount>800) logEl.firstChild.remove(); if(at) logEl.scrollTop=logEl.scrollHeight; }
$('#lgDebug').onchange=()=>{ logEl.innerHTML=''; logs.filter(l=>l.level!=='debug'||$('#lgDebug').checked).forEach(appendLog); };
$('#lgClear').onclick=()=>{ logs=[]; logEl.innerHTML=''; };
$('#sb-log').onclick=()=>{ $('#drawer').hidden=!$('#drawer').hidden; }; $('#lgClose').onclick=()=>$('#drawer').hidden=true;
renderSource(); pickBackend();
