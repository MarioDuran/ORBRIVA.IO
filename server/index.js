import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { World, CONFIG } from './world.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');
const PORT=Number(process.env.PORT)||3000;
const world=new World({minPopulation:process.env.MIN_POPULATION,maxHumans:process.env.MAX_HUMANS});
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'};
const publisher=/^ca-pub-\d{16}$/.test(process.env.ADSENSE_CLIENT||'')?process.env.ADSENSE_CLIENT:'';
function sendJson(res,body){res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body));}
const server=http.createServer((req,res)=>{
  let pathname;
  try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
  if(pathname==='/health'){sendJson(res,{ok:true,humans:world.humanCount,bots:world.botCount,players:world.players.size});return;}
  if(pathname==='/config.json'){sendJson(res,{adsenseClient:publisher,world:[CONFIG.width,CONFIG.height]});return;}
  if(pathname==='/ads.txt'){
    if(!publisher){res.writeHead(404);res.end('Adsense no configurado');return;}
    res.writeHead(200,{'content-type':'text/plain; charset=utf-8'});res.end(`google.com, ${publisher.replace('ca-','')}, DIRECT, f08c47fec0942fa0\n`);return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const pathnameSafe=pathname==='/'?'/index.html':pathname;
  const full=path.resolve(root,'.'+pathnameSafe);
  if(!full.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.stat(full,(err,stat)=>{
    if(err||!stat.isFile()){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'content-type':mime[path.extname(full)]||'application/octet-stream','cache-control':path.extname(full)==='.html'?'no-cache':'public, max-age=900','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin'});
    if(req.method==='HEAD'){res.end();return;}
    fs.createReadStream(full).pipe(res);
  });
});
const wss=new WebSocketServer({server,path:'/ws',maxPayload:512,perMessageDeflate:false,clientTracking:true});
const clients=new Map();
const parseName=name=>String(name||'').trim().replace(/[\u0000-\u001f<>]/g,'').slice(0,18)||'Viajero';
const safeSend=(ws,data)=>{if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<300_000)ws.send(JSON.stringify(data));};
wss.on('connection',(ws)=>{
  const state={playerId:null,lastInputAt:0,windowSince:Date.now(),inputCount:0,lastSeen:Date.now(),lastPong:Date.now(),sessionStarted:Date.now()};
  clients.set(ws,state);
  safeSend(ws,{t:'hello',version:1});
  ws.on('pong',()=>{state.lastPong=Date.now();});
  ws.on('message',buffer=>{
    state.lastSeen=Date.now();
    let msg;try{msg=JSON.parse(buffer.toString());}catch{return;}
    if(!msg||typeof msg!=='object')return;
    if(msg.t==='join'){
      if(state.playerId && world.players.has(state.playerId))return;
      if(Date.now()-state.sessionStarted<350 && state.playerId)return;
      const p=world.spawn({name:parseName(msg.name),ws});
      if(!p){safeSend(ws,{t:'error',message:'La arena está llena. Inténtalo luego.'});return;}
      state.playerId=p.id;state.sessionStarted=Date.now();
      safeSend(ws,{t:'joined',id:p.id,world:[CONFIG.width,CONFIG.height]});
    } else if(msg.t==='i'){
      if(!state.playerId||!world.players.has(state.playerId))return;
      const now=Date.now();if(now-state.windowSince>1000){state.windowSince=now;state.inputCount=0;}
      if(++state.inputCount>40)return;
      if(typeof msg.a==='number'&&Number.isFinite(msg.a))world.input(state.playerId,msg.a,msg.f===1);
    }
  });
  ws.on('close',()=>{if(state.playerId)world.remove(state.playerId);clients.delete(ws);});
  ws.on('error',()=>{});
});
let last=performance.now();
setInterval(()=>{
  const now=performance.now();const dt=Math.min((now-last)/1000,.085);last=now;
  world.update(dt);
},1000/CONFIG.tickRate);
setInterval(()=>{
  for(const [ws,state] of clients){
    if(ws.readyState!==WebSocket.OPEN||!state.playerId||!world.players.has(state.playerId))continue;
    // Per-player snapshots: only entities within the vicinity are transmitted.
    safeSend(ws,world.snapshot(state.playerId));
  }
},1000/CONFIG.snapshotRate);
setInterval(()=>{
  const now=Date.now();
  for(const [ws,state] of clients){
    if(now-state.lastPong>55_000){ws.terminate();continue;}
    if(ws.readyState===WebSocket.OPEN)ws.ping();
  }
},20000);
const shutdown=()=>{for(const ws of clients.keys())ws.close(1001,'Servidor reiniciando');server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),10000).unref();};
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
server.listen(PORT,'0.0.0.0',()=>console.log(`Orbriva.io listo en http://localhost:${PORT}`));
