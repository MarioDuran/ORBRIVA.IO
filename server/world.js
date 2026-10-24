import { randomUUID } from 'node:crypto';

export const CONFIG = Object.freeze({
  width: 3400, height: 3400, tickRate: 20, snapshotRate: 8,
  pelletCount: 850, cellSize: 250, viewRadius: 1050,
  minMass: 27, maxMass: 650,
});
const COLORS = ['#5fe2fd', '#d6a5ff', '#ffbe7a', '#78f5bd', '#ff7dc6', '#ffe477', '#8caeff'];
export const BOT_NAMES = ['Nebula','Kira','Orbit','Nox','Pixel','Vega','Glitch','Cosmo','Luna','Astro','Mako','Quark','Sol','Nova','Tiko','Zed','Nyx','Rift','Milo','Sora','Comet','Lyra','Delta','Flux','Astra','Zen','Juno','Boreal','Iris','Echo','Rocco','Faye','Rumi','Kai'];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const sq = x => x * x;
export const radiusFor = mass => 9 + Math.sqrt(mass) * 1.32;
export const speedFor = mass => clamp(258 - 8.4 * Math.sqrt(mass), 95, 215);
export const round = n => Math.round(n);

// Spatial buckets avoid checking every player for every drifting particle.
class SpatialGrid {
  constructor(cellSize) { this.size = cellSize; this.cells = new Map(); }
  clear() { this.cells.clear(); }
  key(x, y) { return `${Math.floor(x / this.size)},${Math.floor(y / this.size)}`; }
  add(item) { const key = this.key(item.x,item.y); let b = this.cells.get(key); if (!b) this.cells.set(key, b=[]); b.push(item); }
  nearby(x, y, r) {
    const result = [], s=this.size;
    const lx=Math.floor((x-r)/s), hx=Math.floor((x+r)/s), ly=Math.floor((y-r)/s), hy=Math.floor((y+r)/s);
    for (let i=lx; i<=hx; i++) for(let j=ly; j<=hy; j++) {
      const b=this.cells.get(`${i},${j}`); if(b) result.push(...b);
    }
    return result;
  }
}

export class World {
  constructor({ minPopulation=16, maxHumans=45 }={}) {
    this.players=new Map(); this.pellets=new Map(); this.humans=new Map();
    this.minPopulation=clamp(Number(minPopulation)||16, 0, 35);
    this.maxHumans=clamp(Number(maxHumans)||45, 1, 100);
    this.grid=new SpatialGrid(CONFIG.cellSize);
    this.time=0; this.botSeq=0; this.nextBotAdjustment=0;
    for(let i=0;i<CONFIG.pelletCount;i++) this.addPellet();
  }
  get humanCount(){return this.humans.size;}
  get botCount(){let n=0;for(const p of this.players.values())if(p.bot)n++;return n;}
  addPellet(x=rand(35,CONFIG.width-35),y=rand(35,CONFIG.height-35),mass=rand(1.0,3.8)){
    const id=randomUUID().slice(0,8);
    const pellet={id,x,y,vx:0,vy:0,mass,color:Math.floor(rand(0,COLORS.length))};
    this.pellets.set(id,pellet);return pellet;
  }
  spawn({name='Viajero',bot=false,ws=null}={}) {
    if(!bot && this.humanCount>=this.maxHumans) return null;
    const id=randomUUID().slice(0,10);
    const spot=this.findSpawn();
    const player={id,name:String(name).slice(0,20),x:spot.x,y:spot.y,mass:CONFIG.minMass,
      angle:rand(-Math.PI,Math.PI),focus:false,charge:100,bot,color:Math.floor(rand(0,COLORS.length)),
      socket:ws,alive:true,born:this.time,shieldUntil:this.time+2.2,
      // Distinct decision intervals, risk appetites and noisy course corrections.
      ai:bot?{decideAt:0,targetAngle:rand(-Math.PI,Math.PI),risk:rand(.62,1.35),
        curiosity:rand(.35,1.2),jitter:rand(.03,.32),patience:rand(.3,1.3),phase:rand(0,99)}:null,
    };
    this.players.set(id,player);
    if(!bot)this.humans.set(id,player);
    return player;
  }
  findSpawn(){
    for(let i=0;i<25;i++){
      const pos={x:rand(180,CONFIG.width-180),y:rand(180,CONFIG.height-180)};
      if([...this.players.values()].every(p=>sq(p.x-pos.x)+sq(p.y-pos.y)>sq(240)))return pos;
    }
    return {x:rand(200,CONFIG.width-200),y:rand(200,CONFIG.height-200)};
  }
  remove(id){ const p=this.players.get(id);if(!p)return;this.players.delete(id);this.humans.delete(id); }
  input(id,angle,focus){
    const p=this.humans.get(id);if(!p)return;
    if(typeof angle==='number'&&Number.isFinite(angle))p.angle=clamp(angle,-Math.PI*2,Math.PI*2);
    p.focus=focus===true;
  }
  maintainBots(){
    // Keep a populated room, but do not inflate the human player count.
    const desired=this.humanCount?Math.max(0,this.minPopulation-this.humanCount):0;
    const bots=[...this.players.values()].filter(p=>p.bot);
    if(bots.length<desired){
      for(let i=0;i<Math.min(4,desired-bots.length);i++){
        const name=BOT_NAMES[this.botSeq++%BOT_NAMES.length];
        this.spawn({name,bot:true});
      }
    }else if(bots.length>desired){
      const victim=bots.sort((a,b)=>a.mass-b.mass)[0]; if(victim)this.remove(victim.id);
    }
  }
  thinkBot(p,dt){
    const a=p.ai;if(!a)return;
    if(this.time>=a.decideAt){
      a.decideAt=this.time+rand(.24,.92)*a.patience;
      let vx=0,vy=0,focus=false;
      // Multiple goals: eat pellets, chase weaker players, escape stronger players.
      for(const other of this.players.values()){
        if(other.id===p.id)continue;
        const dx=other.x-p.x,dy=other.y-p.y,d=Math.hypot(dx,dy)||1;
        if(d>430)continue;
        if(other.mass>p.mass*1.18){
          const fear=(450-d)/450*4.8/a.risk;
          vx-=dx/d*fear; vy-=dy/d*fear;
          if(d<170 && p.charge>32 && Math.random()<.25)focus=true;
        }else if(p.mass>other.mass*1.27 && d<310){
          const hunt=(330-d)/330*2.2*a.risk;
          vx+=dx/d*hunt;vy+=dy/d*hunt;
          if(d<165 && p.charge>35)focus=true;
        }else if(other.mass>p.mass && d<125 && p.charge>30 && Math.random()<.12){
          vx+=dx/d*.7;vy+=dy/d*.7;focus=true;
        }
      }
      // Prospect for nearby clusters of food, without perfect knowledge.
      let target=null, best=-1;
      for(const pellet of this.pellets.values()){
        const dx=pellet.x-p.x,dy=pellet.y-p.y,d2=dx*dx+dy*dy;
        if(d2<300*300 && d2>1600){
          const score=pellet.mass/(d2+800)+Math.random()*.000004;
          if(score>best){best=score;target=pellet;}
        }
      }
      if(target){const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy)||1;vx+=dx/d*a.curiosity;vy+=dy/d*a.curiosity;}
      // Per-personality wandering and avoidance of world borders.
      const wander=a.phase+this.time*.45;
      vx+=Math.cos(wander)*.42+rand(-a.jitter,a.jitter);
      vy+=Math.sin(wander*.8)*.42+rand(-a.jitter,a.jitter);
      if(p.x<170)vx+=3;else if(p.x>CONFIG.width-170)vx-=3;
      if(p.y<170)vy+=3;else if(p.y>CONFIG.height-170)vy-=3;
      a.targetAngle=Math.atan2(vy,vx);
      a.focus=focus;
    }
    // Natural turning inertia instead of instant perfect steering.
    const delta=Math.atan2(Math.sin(a.targetAngle-p.angle),Math.cos(a.targetAngle-p.angle));
    p.angle+=clamp(delta,-dt*rand(2.6,5.4),dt*rand(2.6,5.4));
    p.focus=Boolean(a.focus&&p.charge>3);
  }
  update(dt){
    dt=clamp(dt,0,.085);this.time+=dt;
    if(this.time>=this.nextBotAdjustment){this.maintainBots();this.nextBotAdjustment=this.time+.9;}
    // Sleep simulation when there are no connected human players.
    if(this.humanCount===0)return;
    for(const p of this.players.values()){
      if(p.bot)this.thinkBot(p,dt);
      const usingFocus=p.focus&&p.charge>3&&p.mass>CONFIG.minMass;
      if(usingFocus){p.charge=Math.max(0,p.charge-28*dt);p.mass=Math.max(CONFIG.minMass,p.mass-1.5*dt);}
      else p.charge=Math.min(100,p.charge+15*dt);
      const speed=speedFor(p.mass)*(usingFocus?.82:1);
      p.x=clamp(p.x+Math.cos(p.angle)*speed*dt,25,CONFIG.width-25);
      p.y=clamp(p.y+Math.sin(p.angle)*speed*dt,25,CONFIG.height-25);
      p.usingFocus=usingFocus;
    }
    // Use spatial bucketing to find nearby gravitational bodies.
    this.grid.clear();for(const p of this.players.values())this.grid.add(p);
    const caught=[];
    for(const pellet of this.pellets.values()){
      let best=null,bestDist=Infinity;
      for(const p of this.grid.nearby(pellet.x,pellet.y,265)){
        const dx=p.x-pellet.x,dy=p.y-pellet.y,d=Math.hypot(dx,dy);
        const reach=110+Math.sqrt(p.mass)*4.2+(p.usingFocus?95:0);
        if(d<reach && d<bestDist){bestDist=d;best=p;}
      }
      if(best){
        const dx=best.x-pellet.x,dy=best.y-pellet.y,d=bestDist||1;
        const reach=110+Math.sqrt(best.mass)*4.2+(best.usingFocus?95:0);
        const accel=(1-d/reach)*850*(best.usingFocus?2.2:1);
        pellet.vx+=dx/d*accel*dt;
        pellet.vy+=dy/d*accel*dt;
        if(d<radiusFor(best.mass)+5){
          best.mass=Math.min(CONFIG.maxMass,best.mass+pellet.mass);
          caught.push(pellet.id);continue;
        }
      }
      pellet.vx*=Math.exp(-3*dt);pellet.vy*=Math.exp(-3*dt);
      const velocity=Math.hypot(pellet.vx,pellet.vy);
      if(velocity>240){pellet.vx=pellet.vx/velocity*240;pellet.vy=pellet.vy/velocity*240;}
      pellet.x=clamp(pellet.x+pellet.vx*dt,18,CONFIG.width-18);
      pellet.y=clamp(pellet.y+pellet.vy*dt,18,CONFIG.height-18);
    }
    for(const id of caught){this.pellets.delete(id);this.addPellet();}
    // Pairwise PvP is inexpensive at the limited room population.
    const ps=[...this.players.values()];
    for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){
      const a=ps[i],b=ps[j];if(!this.players.has(a.id)||!this.players.has(b.id))continue;
      const d=Math.hypot(a.x-b.x,a.y-b.y);
      const near=d<radiusFor(a.mass)+radiusFor(b.mass)+44;
      if(!near)continue;
      const [larger,smaller]=a.mass>=b.mass?[a,b]:[b,a];
      // A focused underdog can siphon mass from a larger enemy at close range.
      if(smaller.usingFocus && smaller.mass<larger.mass*.96 && d<radiusFor(a.mass)+radiusFor(b.mass)+28){
        const steal=Math.min(larger.mass-CONFIG.minMass,12*dt);
        if(steal>0){larger.mass-=steal;smaller.mass=Math.min(CONFIG.maxMass,smaller.mass+steal*.85);}
      }
      // Spawn protection, and size threshold prevent unlucky instantaneous deaths.
      if(this.time<a.shieldUntil||this.time<b.shieldUntil)continue;
      if(larger.mass<smaller.mass*1.28)continue;
      if(d<radiusFor(larger.mass)*.80+radiusFor(smaller.mass)*.20){
        larger.mass=Math.min(CONFIG.maxMass,larger.mass+smaller.mass*.58);
        this.kill(smaller,larger);
      }
    }
  }
  kill(victim,killer){
    if(!this.players.has(victim.id))return;
    if(!victim.bot && victim.socket?.readyState===1){
      victim.socket.send(JSON.stringify({t:'dead',score:round(victim.mass),killer:killer.name,seconds:round(this.time-victim.born)}));
    }
    this.remove(victim.id);
  }
  snapshot(forId){
    const me=this.players.get(forId);
    const cx=me?.x??CONFIG.width/2,cy=me?.y??CONFIG.height/2;
    const view=CONFIG.viewRadius, d2=view*view;
    const players=[];
    for(const p of this.players.values())if(sq(cx-p.x)+sq(cy-p.y)<d2){
      players.push([p.id,round(p.x),round(p.y),round(p.mass),round(p.angle*100)/100,p.color,p.name,p.bot?1:0,p.usingFocus?1:0,round(p.charge),this.time<p.shieldUntil?1:0]);
    }
    const pellets=[];
    for(const e of this.pellets.values())if(sq(cx-e.x)+sq(cy-e.y)<d2){
      pellets.push([round(e.x),round(e.y),e.color,round(e.mass*10)/10]);
    }
    const leaderboard=[...this.players.values()].sort((a,b)=>b.mass-a.mass).slice(0,8).map(p=>[p.name,round(p.mass),p.bot?1:0,p.id]);
    return {t:'s',me:forId,players,pellets,board:leaderboard,
      humans:this.humanCount,bots:this.botCount,world:[CONFIG.width,CONFIG.height],
      pos:[round(cx),round(cy)],time:round(this.time*10)/10};
  }
}
