import test from 'node:test';
import assert from 'node:assert/strict';
import { World,CONFIG,radiusFor } from '../server/world.js';

test('spawns players and keeps human counts distinct from bot counts',()=>{
  const w=new World({minPopulation:12});const p=w.spawn({name:'Test'});
  w.update(.05);
  assert.equal(w.humanCount,1);assert.equal(w.players.has(p.id),true);
  assert.equal(w.botCount,4);
  assert.equal(w.snapshot(p.id).humans,1);
  assert.equal(w.snapshot(p.id).players.some(x=>x[0]===p.id),true);
});
test('respects human capacity and sanitizes numeric input',()=>{
  const w=new World({minPopulation:0,maxHumans:1});const p=w.spawn({name:'A'});
  assert.equal(w.spawn({name:'B'}),null);
  w.input(p.id,NaN,true);assert.ok(Number.isFinite(p.angle));
  w.input(p.id,Math.PI/2,true);assert.equal(p.focus,true);
});
test('movements stay inside arena and radius increases with mass',()=>{
  const w=new World({minPopulation:0});const p=w.spawn({name:'A'});
  p.x=CONFIG.width-26;p.y=CONFIG.height-26;
  for(let i=0;i<200;i++)w.update(.05);
  assert.ok(p.x<=CONFIG.width-25 && p.y<=CONFIG.height-25);
  assert.ok(radiusFor(80)>radiusFor(30));
});
test('the arena stops creating AI occupants with no humans',()=>{
  const w=new World({minPopulation:18});w.update(.05);
  assert.equal(w.botCount,0);
});
test('gravitational pickup increases authoritative mass without losing food total',()=>{
  const w=new World({minPopulation:0});const p=w.spawn({name:'A'});
  const e=w.addPellet(p.x,p.y,3.5);const before=p.mass;
  const count=w.pellets.size;
  w.update(.05);
  assert.ok(p.mass>before);
  assert.equal(w.pellets.size,count);
  assert.equal(w.pellets.has(e.id),false);
});
test('a sufficiently large player absorbs a smaller unshielded opponent',()=>{
  const w=new World({minPopulation:0});const big=w.spawn({name:'Grande'}),small=w.spawn({name:'Pequeño'});
  big.mass=200;big.x=1300;big.y=1200;big.shieldUntil=0;
  small.x=1301;small.y=1200;small.mass=30;small.shieldUntil=0;
  w.update(.05);
  assert.equal(w.players.has(small.id),false);
  assert.ok(big.mass>200);
});
