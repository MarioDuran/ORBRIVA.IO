import { setupAds, replayWithPossibleAd } from './ads.js';

const $=id=>document.getElementById(id);
const canvas=$('arena'),ctx=canvas.getContext('2d',{alpha:false});
const palette=['#5fe2fd','#d6a5ff','#ffbe7a','#78f5bd','#ff7dc6','#ffe477','#8caeff'];
const TAU=Math.PI*2;
let W=innerWidth,H=innerHeight,DPR=1;
let ws=null,myId='',playing=false,started=false,rounds=0,attempt=0,connecting=false,pendingJoin=false;
let snap=null,serverPlayers=new Map(),drawPlayers=new Map(),pellets=[];
let focus=false,aim=0,mouseActive=false;
let camera={x:1700,y:1700},camTarget={x:1700,y:1700};
let lastFrame=performance.now(),lastInput=0,starfield=[];
let screenW=3400,screenH=3400,adConfigured=false;
const isTouch=matchMedia('(pointer: coarse)').matches;
const fetchConfig=async()=>{try{const r=await fetch('/config.json');if(r.ok){const cfg=await r.json();if(cfg.adsenseClient&&!adConfigured){setupAds(cfg.adsenseClient);adConfigured=true;}}}catch{}};
fetchConfig();
try{$('nickname').value=localStorage.getItem('orbriva-nickname')||'';}catch{}

function resize(){
  W=innerWidth;H=innerHeight;DPR=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.floor(W*DPR);canvas.height=Math.floor(H*DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);
  starfield=Array.from({length:125},(_,i)=>({x:((i*419+127)%997)/997,y:((i*237+43)%991)/991,r:i%8===0?1.4:.7,p:i*.73}));
}
addEventListener('resize',resize);resize();
function toast(text){const el=$('notice');el.textContent=text;el.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.hidden=true,3800);}
function showIntro(){playing=false;myId='';$('intro').classList.remove('is-hidden');$('death').classList.add('is-hidden');$('playerHud').hidden=true;$('leaderboard').hidden=true;$('bottomHud').hidden=true;$('mobileFocus').hidden=true;}
function setGameplayVisible(active){$('playerHud').hidden=!active;$('leaderboard').hidden=!active;$('bottomHud').hidden=!active;$('mobileFocus').hidden=!active||!isTouch;}

function connect(){
  if(ws&&(ws.readyState===WebSocket.OPEN||ws.readyState===WebSocket.CONNECTING))return;
  connecting=true;$('online').textContent='Conectando...';
  const proto=location.protocol==='https:'?'wss':'ws';
  ws=new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen=()=>{connecting=false;attempt=0;$('online').textContent='Servidor conectado';$('play').disabled=false;$('replay').disabled=false;if(pendingJoin){pendingJoin=false;join();}};
  ws.onmessage=({data})=>{
    let m;try{m=JSON.parse(data)}catch{return;}
    if(m.t==='hello')return;
    if(m.t==='joined'){
      myId=m.id;playing=true;started=true;serverPlayers.clear();drawPlayers.clear();
      screenW=m.world[0];screenH=m.world[1];
      $('intro').classList.add('is-hidden');$('death').classList.add('is-hidden');setGameplayVisible(true);
      $('play').disabled=false;$('replay').disabled=false;
    }else if(m.t==='s'){
      snap=m;pellets=m.pellets;
      serverPlayers=new Map(m.players.map(p=>[p[0],p]));
      for(const p of m.players){if(!drawPlayers.has(p[0]))drawPlayers.set(p[0],{x:p[1],y:p[2],mass:p[3],angle:p[4]});}
      for(const id of drawPlayers.keys())if(!serverPlayers.has(id))drawPlayers.delete(id);
      const self=serverPlayers.get(myId);
      if(self){camTarget={x:self[1],y:self[2]};$('mass').textContent=Math.round(self[3]);$('boostPercent').textContent=`${self[9]}%`;$('boostFill').style.width=`${self[9]}%`;$('coords').textContent=`X ${self[1]} · Y ${self[2]}`;}
      $('online').textContent=`${m.humans} humanos · ${m.bots} IA`;
      renderBoard(m.board);
    }else if(m.t==='dead'){
      playing=false;rounds++;
      const best=Math.max(Number(readStorage('orbriva-best')||0),m.score);
      writeStorage('orbriva-best',best);
      $('finalMass').textContent=m.score;$('survival').textContent=`${m.seconds} s`;$('best').textContent=best;
      $('deathReason').textContent=`${m.killer} absorbió tu vórtice. La galaxia sigue girando.`;
      setGameplayVisible(false);$('death').classList.remove('is-hidden');
    }else if(m.t==='error'){
      toast(m.message);$('play').disabled=false;$('replay').disabled=false;
    }
  };
  ws.onclose=()=>{
    const interrupted=playing;
    ws=null;playing=false;myId='';
    $('online').textContent='Sin conexión';
    $('play').disabled=false;$('replay').disabled=false;
    if(interrupted){showIntro();toast('La conexión se interrumpió. Puedes volver a entrar.');}
    const delay=Math.min(1000*2**Math.min(attempt++,5),20000)+Math.random()*500;
    setTimeout(()=>{if(!ws)connect()},delay);
  };
  ws.onerror=()=>{};
}
function readStorage(k){try{return localStorage.getItem(k)}catch{return null}}
function writeStorage(k,v){try{localStorage.setItem(k,String(v))}catch{}}
function renderBoard(board){
  const root=$('leaderRows');root.replaceChildren();
  for(let i=0;i<board.length;i++){
    const p=board[i],div=document.createElement('div');div.className='leader-row'+(p[3]===myId?' is-me':'');
    const num=document.createElement('span');num.className='rank';num.textContent=String(i+1).padStart(2,'0');
    const name=document.createElement('span');name.className='lname';name.textContent=p[0];
    div.append(num,name);
    if(p[2]){const bot=document.createElement('span');bot.className='bot-tag';bot.textContent='IA';div.append(bot);}
    const score=document.createElement('span');score.className='rank-score';score.textContent=p[1];div.append(score);root.append(div);
  }
}
function join(){
  if(!ws||ws.readyState!==WebSocket.OPEN){pendingJoin=true;toast('Conectando al servidor...');connect();return;}
  const nickname=$('nickname').value.trim().replace(/[\u0000-\u001f<>]/g,'').slice(0,18)||'Viajero';
  writeStorage('orbriva-nickname',nickname);
  $('play').disabled=true;$('replay').disabled=true;
  ws.send(JSON.stringify({t:'join',name:nickname}));
}
$('play').addEventListener('click',join);
$('nickname').addEventListener('keydown',e=>{if(e.key==='Enter')join()});
$('replay').addEventListener('click',()=>replayWithPossibleAd(join,rounds));

function steer(clientX,clientY){const dx=clientX-W/2,dy=clientY-H/2;if(Math.hypot(dx,dy)>18)aim=Math.atan2(dy,dx);mouseActive=true;}
canvas.addEventListener('pointermove',e=>{if(!isTouch||e.buttons)steer(e.clientX,e.clientY)});
canvas.addEventListener('pointerdown',e=>{
  steer(e.clientX,e.clientY);
  if(!isTouch&&e.button===0)focus=true;
});
addEventListener('pointerup',()=>{focus=false});
addEventListener('pointercancel',()=>{focus=false});
addEventListener('keydown',e=>{if(e.code==='Space'&&playing){e.preventDefault();focus=true}});
addEventListener('keyup',e=>{if(e.code==='Space')focus=false});
addEventListener('blur',()=>{focus=false});
$('mobileFocus').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();focus=true;$('mobileFocus').setPointerCapture(e.pointerId)});
$('mobileFocus').addEventListener('pointerup',e=>{e.preventDefault();focus=false});
$('mobileFocus').addEventListener('pointercancel',()=>{focus=false});
// Input is rate-capped independently of animation frames.
function sendInput(now){if(!playing||!ws||ws.readyState!==WebSocket.OPEN||now-lastInput<50)return;lastInput=now;ws.send(JSON.stringify({t:'i',a:Number(aim.toFixed(3)),f:focus?1:0}));}
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const lerp=(a,b,f)=>a+(b-a)*f;
function sceneScale(){return clamp(Math.min(W/1100,H/750),.52,1.22);}
function circle(x,y,r,color,alpha=1){ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,Math.max(.5,r),0,TAU);ctx.fill();ctx.globalAlpha=1;}
function ring(x,y,r,color,alpha=1,width=1){ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.stroke();ctx.globalAlpha=1;}
function renderBackground(now,scale){
  ctx.fillStyle='#070d1e';ctx.fillRect(0,0,W,H);
  const glow=ctx.createRadialGradient(W*.56,H*.47,30,W*.56,H*.47,Math.max(W,H)*.8);
  glow.addColorStop(0,'#112549');glow.addColorStop(.48,'#0a1630');glow.addColorStop(1,'#050a17');ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
  for(const s of starfield){let x=s.x*W-camera.x*.016%W,y=s.y*H-camera.y*.012%H;
    x=(x+W)%W;y=(y+H)%H;circle(x,y,s.r,'#b9d5fa',.12+.18*(1+Math.sin(now/2300+s.p))*.5);
  }
  const grid=120*scale,offX=((-(camera.x*scale)%grid)+grid)%grid,offY=((-(camera.y*scale)%grid)+grid)%grid;
  ctx.strokeStyle='#70a0de0e';ctx.lineWidth=1;ctx.beginPath();
  for(let x=offX;x<W;x+=grid){ctx.moveTo(x,0);ctx.lineTo(x,H)}
  for(let y=offY;y<H;y+=grid){ctx.moveTo(0,y);ctx.lineTo(W,y)}ctx.stroke();
}
function glowVortex(x,y,r,base,focusOn,shield,angle,now){
  const t=now*.001;
  if(focusOn)ring(x,y,r+52,base,.45,2.7);
  if(focusOn)ring(x,y,r+61+Math.sin(t*8)*6,base,.15,1.2);
  const halo=ctx.createRadialGradient(x,y,r*.35,x,y,r*3.5);
  halo.addColorStop(0,base+'65');halo.addColorStop(.33,base+'31');halo.addColorStop(1,base+'00');ctx.fillStyle=halo;
  ctx.beginPath();ctx.arc(x,y,r*3.5,0,TAU);ctx.fill();
  for(let arm=0;arm<3;arm++){
    ctx.beginPath();ctx.strokeStyle=base;ctx.globalAlpha=.18;ctx.lineWidth=clamp(r*.20,2,7);
    for(let q=0;q<=18;q++){
      const k=q/18,dist=r*(.54+.6*k),a=t*(1.4+arm*.1)+arm*TAU/3+k*4.1+angle*.35;
      const sx=x+Math.cos(a)*dist,sy=y+Math.sin(a)*dist;
      if(q===0)ctx.moveTo(sx,sy);else ctx.lineTo(sx,sy);
    }ctx.stroke();ctx.globalAlpha=1;
  }
  const sphere=ctx.createRadialGradient(x-r*.3,y-r*.4,r*.05,x,y,r*1.1);
  sphere.addColorStop(0,'#eafcff');sphere.addColorStop(.16,base);sphere.addColorStop(.49,'#27387f');sphere.addColorStop(.83,'#080d29');sphere.addColorStop(1,'#020614');
  ctx.fillStyle=sphere;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
  ring(x,y,r+1,base,.65,1.4);
  if(shield)ring(x,y,r+14+Math.sin(t*4)*2,'#edfbff',.55,1.5);
}
function render(now){
  const dt=Math.min((now-lastFrame)/1000,.05);lastFrame=now;
  const f=1-Math.exp(-dt*9),scale=sceneScale();
  camera.x=lerp(camera.x,camTarget.x,f*.95);camera.y=lerp(camera.y,camTarget.y,f*.95);
  renderBackground(now,scale);
  const project=(x,y)=>({x:W*.5+(x-camera.x)*scale,y:H*.5+(y-camera.y)*scale});
  if(snap&&playing){
    const tl=project(0,0),br=project(screenW,screenH);
    ctx.fillStyle='#05091644';
    if(tl.x>0)ctx.fillRect(0,0,tl.x,H);if(tl.y>0)ctx.fillRect(0,0,W,tl.y);
    if(br.x<W)ctx.fillRect(br.x,0,W-br.x,H);if(br.y<H)ctx.fillRect(0,br.y,W,H-br.y);
    ctx.strokeStyle='#85caff38';ctx.lineWidth=3;ctx.strokeRect(tl.x,tl.y,screenW*scale,screenH*scale);
    for(const p of pellets){const {x,y}=project(p[0],p[1]);if(x<-20||x>W+20||y<-20||y>H+20)continue;
      const r=(2.6+p[3]*.52)*scale;circle(x,y,r*2.2,palette[p[2]],.11);circle(x,y,r,palette[p[2]],.85);
    }
    const visible=[];
    for(const [id,p] of serverPlayers){let d=drawPlayers.get(id);if(!d)continue;
      d.x=lerp(d.x,p[1],f*1.45);d.y=lerp(d.y,p[2],f*1.45);d.mass=lerp(d.mass,p[3],f*2);
      const z=project(d.x,d.y);visible.push({p,z,r:(9+Math.sqrt(d.mass)*1.32)*scale});
    }
    visible.sort((a,b)=>b.r-a.r);
    for(const {p,z,r} of visible){
      if(z.x<-120||z.x>W+120||z.y<-120||z.y>H+120)continue;
      glowVortex(z.x,z.y,r,palette[p[5]],!!p[8],!!p[10],p[4],now);
      ctx.textAlign='center';ctx.textBaseline='bottom';ctx.font=`${p[0]===myId?'700':'600'} ${clamp(11*scale,10,14)}px 'DM Sans',sans-serif`;
      ctx.fillStyle=p[0]===myId?'#c9f9ff':'#e3ebfa';ctx.fillText(p[6]+(p[7]?' · IA':''),z.x,z.y-r-15);
      if(p[0]===myId){ring(z.x,z.y,r+8,'#bff9ff',.65,1.6);}
    }
    if(focus&&playing){const self=serverPlayers.get(myId);if(self){const d=drawPlayers.get(myId);if(d){const z=project(d.x,d.y);ring(z.x,z.y,scale*165,palette[self[5]],.13,1);}}}
  }else if(!playing){
    const x=W*.72,y=H*.52,r=clamp(Math.min(W,H)*.15,38,140);
    for(let n=0;n<54;n++){
      const a=n*2.39996+now*.00007*(n%3+1),rr=r*(.7+n/54*3.5);
      const xx=x+Math.cos(a)*rr,yy=y+Math.sin(a)*rr*.72;
      circle(xx,yy,(n%5===0?2.4:1.25),palette[n%palette.length],.10+(1-n/54)*.36);
    }
    glowVortex(x,y,r,'#6ba9ff',false,false,0,now);
  }
  if(!isTouch)sendInput(now);
  else sendInput(now);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
connect();
