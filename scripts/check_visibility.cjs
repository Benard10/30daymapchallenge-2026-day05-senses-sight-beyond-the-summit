const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const profileFunction=fs.readFileSync(path.join(root,'app.js'),'utf8').split('\n').find(line=>line.startsWith('function profileSightlineHeight('));
for(const curved of [false,true]){
 const observer=5865.6,drop=d=>curved?.87*d*d/(2*6371000):0;
 const context={observer,adjusted:(h,d)=>h-drop(d)};
 vm.runInNewContext(profileFunction,context);
 for(const targetDistance of [10000,400000,1000000]){
  const targetHeight=2000,targetAdjusted=targetHeight-drop(targetDistance);
  assert(Math.abs(context.profileSightlineHeight(0,targetDistance,targetAdjusted)-observer)<1e-7);
  assert(Math.abs(context.profileSightlineHeight(targetDistance,targetDistance,targetAdjusted)-targetHeight)<1e-7);
  for(const fraction of [.1,.5,.9]){
   const d=targetDistance*fraction,terrain=1200;
   const originalClearance=terrain-drop(d)-(observer+(targetAdjusted-observer)*fraction);
   const displayedClearance=terrain-context.profileSightlineHeight(d,targetDistance,targetAdjusted);
   assert(Math.abs(originalClearance-displayedClearance)<1e-7,'Terrain detail view must preserve sightline clearance');
  }
 }
}
const SweepCoverage=require('../scan-state.js');
const scan=new SweepCoverage();
assert.equal(scan.count,0,'A new map must not reveal bearings before scanning');
scan.mark(359,2);
assert.equal(scan.count,9,'The beam must reveal every quarter-degree across north');
assert(scan.seen[0]&&scan.seen[1439]&&!scan.seen[720],'Only visited bearings should be revealed');
scan.mark(359,2);assert.equal(scan.count,9,'Repeated or resumed scans must preserve unique coverage');
scan.mark(1,358);assert(scan.complete,'A full turn must reveal all bearings and complete');
scan.reset();assert.equal(scan.count,0);assert(scan.seen.every(v=>v===0),'Scan again must clear the previous selection');
function calculate(heights,distances,observer,bearings=1){
 let result;const self={postMessage:r=>result=r};
 vm.runInNewContext(fs.readFileSync(path.join(root,'visibility-worker.js'),'utf8'),{self,Int16Array,Uint8Array,Infinity});
 self.onmessage({data:{buffer:new Int16Array(heights).buffer,distances,bearings,observer,earthRadius:6371000,refraction:.13}});
 return {curved:new Uint8Array(result.curved),flat:new Uint8Array(result.flat)};
}
const d=Array.from({length:100},(_,i)=>(i+1)*1000);
const plane=calculate(d.map(()=>0),d,100);
assert(plane.flat.every(v=>v===1),'Flat sea surface must remain visible from an elevated observer');
const horizon=Math.sqrt(2*6371000*100/.87);
const farthest=d[Array.from(plane.curved).lastIndexOf(1)];
assert(Math.abs(farthest-horizon)<1200,'Curved sea horizon must agree with the geometric prediction within a sample');
const ridge=calculate([0,200,0,500],[1000,10000,20000,30000],100);
assert.equal(ridge.flat[2],0,'A ridge must hide lower ground behind it');
assert.equal(ridge.flat[3],1,'A taller distant peak can reappear above a closer ridge');
const meta=JSON.parse(fs.readFileSync(path.join(root,'data/metadata.json')));
const raw=fs.readFileSync(path.join(root,'data/terrain.bin'));
assert.equal(raw.byteLength,meta.bearings*meta.distances.length*2,'Data shape must match the metadata');
const actual=calculate(new Int16Array(raw.buffer,raw.byteOffset,raw.byteLength/2),meta.distances,meta.observer.modelElevation+meta.observer.eyeHeight,meta.bearings);
assert(actual.curved.some(Boolean)&&actual.curved.some(v=>!v),'Actual terrain must contain visible and hidden samples');
assert(actual.curved.every((v,i)=>!v||actual.flat[i]),'Adding curvature cannot expose a point hidden in the flat calculation');
const count=a=>a.reduce((s,v)=>s+v,0);
console.log(`Visibility checks passed. ${raw.byteLength/2} real terrain samples; ${count(actual.curved)} curved / ${count(actual.flat)} flat visible. Sea horizon: ${farthest/1000} km (expected ${(horizon/1000).toFixed(1)} km).`);
