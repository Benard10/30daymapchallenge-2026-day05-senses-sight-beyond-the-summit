/* Precompute radial ground visibility. Unknown samples never count as visible. */
self.onmessage=({data})=>{
 const {buffer,distances,bearings,observer,earthRadius,refraction}=data;
 const h=new Int16Array(buffer), n=distances.length;
 const curved=new Uint8Array(h.length),flat=new Uint8Array(h.length);
 const blockers=new Int16Array(h.length),flatBlockers=new Int16Array(h.length);
 for(let a=0;a<bearings;a++){
  let horizon=-Infinity,flatHorizon=-Infinity,block=-1,flatBlock=-1;
  for(let j=0;j<n;j++){
   const i=a*n+j,d=distances[j],s=(h[i]-observer)/d;
   const c=s-d/(2*earthRadius)*(1-refraction);
   curved[i]=c>=horizon-1e-10?1:0;flat[i]=s>=flatHorizon-1e-10?1:0;
   blockers[i]=block;flatBlockers[i]=flatBlock;
   if(c>horizon){horizon=c;block=j;}
   if(s>flatHorizon){flatHorizon=s;flatBlock=j;}
  }
 }
 self.postMessage({curved:curved.buffer,flat:flat.buffer,blockers:blockers.buffer,flatBlockers:flatBlockers.buffer},[curved.buffer,flat.buffer,blockers.buffer,flatBlockers.buffer]);
};
