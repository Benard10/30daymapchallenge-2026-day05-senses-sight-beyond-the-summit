'use strict';
const $=id=>document.getElementById(id);
const map=$('map'), profile=$('profile'), m=map.getContext('2d'), p=profile.getContext('2d');
const GOLD='#e6bd7f', VISIBLE='#ef6c60', TEXT='#eeeade', MUTED='#91a292';
const state={bearing:0,radius:400,curved:true,playing:false,ready:false,distance:400,selected:false,name:'',lastTime:0};
const coverage=new SweepCoverage();
const places=[
 {name:'Mount Kenya',lat:-.1521,lon:37.3084,peak:true},
 {name:'Aberdares',lat:-.62765,lon:36.70832,peak:true},
 {name:'Mount Meru',lat:-3.25,lon:36.75,peak:true},
 {name:'Nairobi',lat:-1.2864,lon:36.8172},
 {name:'Mombasa',lat:-4.0435,lon:39.6682},
 {name:'Arusha',lat:-3.3869,lon:36.6830},
 {name:'Moshi',lat:-3.3349,lon:37.3404},
 {name:'Tanga',lat:-5.069,lon:39.098},
 {name:'Dodoma',lat:-6.163,lon:35.7516},
 {name:'Zanzibar',lat:-6.1659,lon:39.2026}
];
let meta,heights,visibleCurved,visibleFlat,relief,countries,distances,n,observer;
let mapW=0,mapH=0,profileW=0,profileH=0,frame=null,dirty=true,mapBase=document.createElement('canvas'),mapOverlay=document.createElement('canvas'),geometry;
let placeLabels=[];
let featureListKey='';
const rad=x=>x*Math.PI/180, deg=x=>x*180/Math.PI;
function projectLocation(lat,lon){
 const a=rad(meta.observer.lat),b=rad(lat),dl=rad(lon-meta.observer.lon),da=b-a;
 const q=Math.sin(da/2)**2+Math.cos(a)*Math.cos(b)*Math.sin(dl/2)**2;
 const d=2*meta.earthRadius*Math.atan2(Math.sqrt(q),Math.sqrt(1-q));
 const bearing=(deg(Math.atan2(Math.sin(dl)*Math.cos(b),Math.cos(a)*Math.sin(b)-Math.sin(a)*Math.cos(b)*Math.cos(dl)))+360)%360;
 return {d,bearing,x:d*Math.sin(rad(bearing)),y:d*Math.cos(rad(bearing))};
}
function nearest(d){
 let l=0,r=n-1;while(l<r){const mid=(l+r)>>1;if(distances[mid]<d)l=mid+1;else r=mid;}
 return l>0&&Math.abs(distances[l-1]-d)<Math.abs(distances[l]-d)?l-1:l;
}
function azimuth(){return Math.round(state.bearing*4)%meta.bearings;}
function cardinal(b){return ['north','northeast','east','southeast','south','southwest','west','northwest'][Math.round(b/45)%8];}
function shortCardinal(b){return ['N','NE','E','SE','S','SW','W','NW'][Math.round(b/45)%8];}
function fmtBearing(b){return String(Math.round(b)%360).padStart(3,'0')+'°';}
function km(d){return d<10000?(d/1000).toFixed(1):Math.round(d/1000).toLocaleString();}
function distanceLabel(d){return d<1000?Math.round(d)+' m':km(d)+' km';}
function adjusted(h,d){return h-(state.curved?d*d/(2*meta.earthRadius)*(1-meta.refraction):0);}
function profileSightlineHeight(d,targetDistance,targetAdjusted){return observer+(targetAdjusted-observer)*d/targetDistance-adjusted(0,d);}
function visibility(){return state.curved?visibleCurved:visibleFlat;}
function pointInfo(){
 const a=azimuth(),j=nearest(state.distance*1000),i=a*n+j,d=distances[j],h=heights[i];
 const target=adjusted(h,d),s=(target-observer)/d;
 let block=-1;
 if(!visibility()[i])for(let k=0;k<j;k++)if((adjusted(heights[a*n+k],distances[k])-observer)/distances[k]>s+1e-10){block=k;break;}
 return {a,j,i,d,h,target,visible:!!visibility()[i],block};
}
function updateVisibleFeatures(){
 if(!state.ready)return;
 const found=places.filter(q=>q.d<=state.radius*1000&&coverage.seen[Math.floor(q.bearing*4)%meta.bearings]&&visibility()[q.sampleIndex]);
 const phase=coverage.complete?'complete':coverage.count?'scanning':'waiting';
 const key=found.map(q=>q.name).join('|')+phase+state.name;
 if(key===featureListKey)return;featureListKey=key;
 $('visible-count').textContent=found.length;
 $('visible-list').replaceChildren();
 $('visible-empty').hidden=found.length>0;
 $('visible-empty').textContent=phase==='waiting'?'Not scanned yet':phase==='complete'?'No labelled landmarks in view':'None found yet';
 for(const q of found){
  const li=document.createElement('li'),button=document.createElement('button'),name=document.createElement('span'),distance=document.createElement('small');
  name.textContent=q.name;distance.textContent=Math.round(q.d/1000)+' km';button.append(name,distance);
  button.classList.toggle('active',state.name===q.name);
  button.title='Inspect the view towards '+q.name;
  button.addEventListener('click',()=>selectDirection(q.bearing,q.d/1000,q.name));
  li.append(button);$('visible-list').append(li);
 }
}
function updateText(){
 $('bearing').value=state.bearing;$('radius').value=state.radius;
 $('radius-value').textContent=state.radius.toLocaleString()+' km';
 $('bearing-value').textContent=fmtBearing(state.bearing)+' '+shortCardinal(state.bearing);
 $('profile-title').textContent='Looking '+cardinal(state.bearing)+' · '+state.radius.toLocaleString()+' km';
 $('map-subtitle').textContent=state.curved?'The beam reveals visible ground as it passes.':"Earth's curve is switched off for comparison.";
 $('map-status').textContent=state.ready?(coverage.complete?'SCAN COMPLETE · 360°':coverage.count?`${state.playing?'SCANNING':'PAUSED'} · ${coverage.percent}% EXPLORED`:'START THE SWEEP TO REVEAL THE VIEW'):'PREPARING THE LANDSCAPE';
 $('play-icon').textContent=state.playing?'Ⅱ':'▶';$('play-label').textContent=state.playing?'Pause the sweep':coverage.complete?'Scan again':coverage.count?'Resume the sweep':'Start the sweep';
 $('curve-hint').textContent=state.curved?'Allows for light bending through the air':'Comparison only · ignoring Earth’s curve';
 $('map-scale').textContent=(state.radius/2)+' km';
 if(geometry)$('map-scale').style.width=(geometry.r/2)+'px';
 document.querySelectorAll('#landmarks button').forEach((b,i)=>b.classList.toggle('active',state.name===places[i].name));
 updateVisibleFeatures();
 $('point-reading').hidden=!state.ready||!state.selected;
 if(!state.ready||!state.selected)return;
 const t=pointInfo(),name=state.name||'This point';
 $('point-status').textContent=t.visible?'POTENTIALLY VISIBLE':'HIDDEN FROM VIEW';
 $('point-status').style.color=t.visible?VISIBLE:'#a9b2a4';
 $('point-distance').textContent=km(t.d)+' km · '+Math.round(t.h).toLocaleString()+' m';
 $('reading').textContent=t.visible?`${name}: the sampled terrain leaves a clear line from the summit.`:`${name}: closer terrain blocks the line at about ${distanceLabel(distances[t.block<0?0:t.block])}${state.curved?", with Earth's curve included":''}.`;
}
function schedule(rebuild=false){if(rebuild)dirty=true;if(!frame)frame=requestAnimationFrame(render);}
function inspectBeam(){
 state.selected=true;state.distance=state.radius;state.name='';
 const place=places.find(q=>q.d<=state.radius*1000&&Math.abs(((q.bearing-state.bearing+540)%360)-180)<.65);
 if(place){state.distance=place.d/1000;state.name=place.name;}
}
function resetScan(){coverage.reset();state.selected=false;state.name='';$('map-tooltip').hidden=true;$('point-reading').hidden=true;$('point-status').textContent='';$('point-status').style.color=GOLD;$('reading').textContent='';$('point-distance').textContent='';}
function setPlaying(value){
 if(value){if(coverage.complete)resetScan();coverage.mark(state.bearing);inspectBeam();$('map-tooltip').hidden=true;}
 state.playing=value;state.lastTime=0;updateText();schedule();
}
function manual(){setPlaying(false);$('map-tooltip').hidden=true;}
function selectDirection(b,d,name=''){
 manual();state.bearing=Math.round(((b+360)%360)*4)/4%360;
 coverage.mark(state.bearing);
 state.distance=Math.max(.03,Math.min(d,state.radius));state.selected=true;state.name=name;updateText();schedule();
}
function resize(){
 const ratio=Math.min(window.devicePixelRatio||1,2);
 for(const c of [map,profile]){const rect=c.getBoundingClientRect();c.width=Math.round(rect.width*ratio);c.height=Math.round(rect.height*ratio);c.getContext('2d').setTransform(ratio,0,0,ratio,0,0);}
 mapW=map.getBoundingClientRect().width;mapH=map.getBoundingClientRect().height;
 profileW=profile.getBoundingClientRect().width;profileH=profile.getBoundingClientRect().height;
 geometry={x:mapW*.54,y:mapH*.51,r:Math.min(mapW*.405,mapH*.385)};
 $('map-scale').style.width=(geometry.r/2)+'px';
 schedule(true);
}
function mapXY(x,y){const g=geometry,s=g.r/(state.radius*1000);return [g.x+x*s,g.y-y*s];}
function pathGeometry(ctx,coords,type){
 const polygons=type==='Polygon'?[coords]:coords;
 for(const poly of polygons)for(const ring of poly){let first=true;for(const [lon,lat] of ring){const q=projectLocation(lat,lon),xy=mapXY(q.x,q.y);if(first){ctx.moveTo(...xy);first=false;}else ctx.lineTo(...xy);}ctx.closePath();}
}
function arrangePlaceLabels(ctx){
 const g=geometry,labels=[];
 const overlaps=(a,b)=>a.x<b.x+b.w+5&&a.x+a.w+5>b.x&&a.y<b.y+b.h+4&&a.y+a.h+4>b.y;
 const occupied=[{x:g.x+10,y:g.y-20,w:85,h:16},{x:g.x-9,y:g.y-9,w:18,h:18}];
 // Leave room around the compass letters as well as the summit marker.
 for(const angle of [0,90,180,270])occupied.push({x:g.x+Math.sin(rad(angle))*(g.r+19)-10,y:g.y-Math.cos(rad(angle))*(g.r+19)-8,w:20,h:16});
 const candidates=places.filter(q=>q.d<=state.radius*1000*.97&&q.d>=state.radius*1000*.075).map(q=>({...q,point:mapXY(q.x,q.y)}));
 for(let r=1;r<=4;r++)occupied.push({x:g.x+4,y:g.y+g.r*r/4-14,w:44,h:12});
 for(const q of candidates)occupied.push({x:q.point[0]-4,y:q.point[1]-4,w:8,h:8});
 ctx.font='10px "DM Sans", sans-serif';
 for(const q of candidates){
  const [x,y]=q.point,w=ctx.measureText(q.name).width,h=13;
  const preferred=({'Mount Kenya':[1,-1],Aberdares:[-1,-1],Nairobi:[1,1],'Mount Meru':[-1,-1],Arusha:[-1,1],Moshi:[1,1]})[q.name]||[1,-1];
  const directions=[preferred,[-preferred[0],preferred[1]],[preferred[0],-preferred[1]],[-preferred[0],-preferred[1]],[1,0],[-1,0],[0,-1],[0,1]];
  let best=null,bestCost=Infinity;
  const offsets=['Mount Kenya','Aberdares','Nairobi'].includes(q.name)?[24,38,54,72]:[12,24,38,54,72];
  for(const distance of offsets)for(let k=0;k<directions.length;k++){
   const [dx,dy]=directions[k];
   const box={x:x+dx*distance-(dx<0?w:dx===0?w/2:0),y:y+dy*distance-(dy<0?h:dy===0?h/2:0),w,h};
   if(box.x<12||box.x+w>mapW-12||box.y<12||box.y+h>mapH-25)continue;
   const cost=occupied.filter(b=>overlaps(box,b)).length*10000+distance+k*50;
   if(cost<bestCost){best=box;bestCost=cost;}
  }
  if(best){labels.push({...q,box:best});occupied.push(best);}
 }
 return labels;
}
function drawPlaceLabels(){
 m.font='10px "DM Sans",sans-serif';m.textAlign='left';
 for(const q of placeLabels){
  const [x,y]=q.point,b=q.box;
  const ex=Math.max(b.x,Math.min(x,b.x+b.w)),ey=Math.max(b.y,Math.min(y,b.y+b.h));
  m.beginPath();m.moveTo(x,y);m.lineTo(ex,ey);m.strokeStyle='#bcc9b46b';m.lineWidth=.65;m.stroke();
  m.strokeStyle='#111e1d';m.lineWidth=3;m.strokeText(q.name,b.x,b.y+10);m.fillStyle='#c5cbb8';m.fillText(q.name,b.x,b.y+10);
 }
}
function rebuildMap(){
 if(!state.ready||!geometry||map.width<1||map.height<1)return;
 const g=geometry;const ratio=Math.min(window.devicePixelRatio||1,2);
 mapBase.width=map.width;mapBase.height=map.height;
 const b=mapBase.getContext('2d');b.setTransform(ratio,0,0,ratio,0,0);
 b.fillStyle='#111d1c';b.fillRect(0,0,mapW,mapH);
 const scale=g.r/(state.radius*1000),extent=meta.reliefExtentMetres||[-500000,-500000,500000,500000];
 const left=g.x+extent[0]*scale,right=g.x+extent[2]*scale,top=g.y-extent[3]*scale;
 b.drawImage(relief,left,top,(extent[2]-extent[0])*scale,(extent[3]-extent[1])*scale);
 for(const [edge,side] of [[left,-1],[right,1]]){const fade=b.createLinearGradient(edge,0,edge-side*24,0);fade.addColorStop(0,'#111d1c');fade.addColorStop(1,'#111d1c00');b.fillStyle=fade;b.fillRect(side<0?edge:edge-24,0,24,mapH);}
 // A transparent polar lookup of the same visibility samples used by the profile.
 const overlay=document.createElement('canvas'),s=720;overlay.width=s;overlay.height=s;
 const oc=overlay.getContext('2d'),img=oc.createImageData(s,s),flags=visibility();
 const lookup=new Int32Array(2049);
 for(let z=0;z<lookup.length;z++)lookup[z]=nearest(z/(lookup.length-1)*state.radius*1000);
 for(let y=0;y<s;y++)for(let x=0;x<s;x++){
  const dx=(x+.5-s/2)/(s/2),dy=(s/2-y-.5)/(s/2),d=Math.hypot(dx,dy);if(d>1)continue;
  const a=Math.round(((Math.atan2(dx,dy)*180/Math.PI+360)%360)*4)%meta.bearings;
  const i=a*n+lookup[Math.min(2048,Math.round(d*2048))],k=(y*s+x)*4;
  if(flags[i]){img.data[k]=239;img.data[k+1]=108;img.data[k+2]=96;img.data[k+3]=125;}
  else {img.data[k]=8;img.data[k+1]=19;img.data[k+2]=17;img.data[k+3]=55;}
 }
 oc.putImageData(img,0,0);mapOverlay=overlay;
 b.save();b.strokeStyle='#a2b5a235';b.lineWidth=.7;b.setLineDash([3,4]);b.beginPath();
 for(const f of countries.features)pathGeometry(b,f.geometry.coordinates,f.geometry.type);
 b.stroke();b.restore();
 // Subtle fade outside the analysis circle.
 b.save();b.beginPath();b.rect(0,0,mapW,mapH);b.arc(g.x,g.y,g.r,0,2*Math.PI,true);b.fillStyle='#0c18174d';b.fill('evenodd');b.restore();
 b.font='9px "DM Sans", sans-serif';b.textAlign='left';
 for(let r=1;r<=4;r++){
  const radius=g.r*r/4;b.beginPath();b.arc(g.x,g.y,radius,0,2*Math.PI);b.setLineDash([2,5]);b.strokeStyle='#b1bea133';b.lineWidth=.6;b.stroke();b.setLineDash([]);
  b.fillStyle='#a5b1a0';b.fillText(Math.round(state.radius*r/4)+' km',g.x+6,g.y+radius-5);
 }
 for(let angle=0;angle<360;angle+=10){const a=rad(angle),outer=g.r+7,inner=g.r+(angle%30===0?1:4);b.beginPath();b.moveTo(g.x+Math.sin(a)*inner,g.y-Math.cos(a)*inner);b.lineTo(g.x+Math.sin(a)*outer,g.y-Math.cos(a)*outer);b.strokeStyle='#acb7a55a';b.lineWidth=.8;b.stroke();}
 b.textAlign='center';b.fillStyle='#8a9a89';b.font='9px "DM Sans",sans-serif';
 for(const [label,angle] of [['N',0],['E',90],['S',180],['W',270]]){const a=rad(angle);b.fillText(label,g.x+Math.sin(a)*(g.r+19),g.y-Math.cos(a)*(g.r+19)+3);}
 for(const place of places){
  if(place.d>state.radius*1000*.97||place.d<state.radius*1000*.075)continue;
  const [x,y]=mapXY(place.x,place.y);b.fillStyle='#c5cbb8';b.strokeStyle='#111e1d';b.lineWidth=3;
  if(place.peak){b.beginPath();b.moveTo(x,y-4);b.lineTo(x-3,y+2);b.lineTo(x+3,y+2);b.closePath();b.fill();}
  else{b.beginPath();b.arc(x,y,1.8,0,2*Math.PI);b.fill();}
 }
 placeLabels=arrangePlaceLabels(b);
 b.fillStyle='#a8b09c';b.font='italic 12px Georgia,serif';
 if(state.radius>=200){const q=projectLocation(-5.2,41.4),[x,y]=mapXY(q.x,q.y);if(x<mapW-90&&y<mapH-30){b.textAlign='left';b.fillStyle='#69817b';b.fillText('Indian Ocean',x,y);}}
 dirty=false;
}
function drawMap(){
 if(!geometry||!mapBase.width||!mapBase.height)return;m.clearRect(0,0,mapW,mapH);
 m.drawImage(mapBase,0,0,mapW,mapH);
 const g=geometry,a=rad(state.bearing),x=g.x+Math.sin(a)*g.r,y=g.y-Math.cos(a)*g.r;
 // Reveal only bearings the beam has actually visited. Terrain stays visible elsewhere.
 if(coverage.count){
  m.save();m.beginPath();
  for(let i=0;i<coverage.bins;i++)if(coverage.seen[i]){
   const start=i;while(i+1<coverage.bins&&coverage.seen[i+1])i++;
   m.moveTo(g.x,g.y);m.arc(g.x,g.y,g.r,rad(start/4)-Math.PI/2,rad((i+1)/4)-Math.PI/2);m.closePath();
  }
  m.clip();m.drawImage(mapOverlay,g.x-g.r,g.y-g.r,2*g.r,2*g.r);m.restore();
 }
 if(state.playing){
  const fade=m.createConicGradient(a-Math.PI/2-.35,g.x,g.y);fade.addColorStop(0,'#e6bd7f00');fade.addColorStop(.055,'#e6bd7f20');fade.addColorStop(.056,'#e6bd7f00');fade.addColorStop(1,'#e6bd7f00');m.fillStyle=fade;m.beginPath();m.arc(g.x,g.y,g.r,0,2*Math.PI);m.fill();
 }
 m.beginPath();m.moveTo(g.x,g.y);m.lineTo(x,y);m.strokeStyle=GOLD;m.lineWidth=1.15;m.shadowColor='#e6bd7f';m.shadowBlur=7;m.stroke();m.shadowBlur=0;
 m.beginPath();m.arc(x,y,3,0,2*Math.PI);m.fillStyle=GOLD;m.fill();
 m.font='10px "DM Sans",sans-serif';m.textAlign='center';m.fillStyle=GOLD;
 const bearingText=fmtBearing(state.bearing),bearingWidth=m.measureText(bearingText).width;
 let bearingPosition=null;
 for(const distance of [29,45,61]){
  const bx=x+Math.sin(a)*distance,by=y-Math.cos(a)*distance+3;
  const clashes=placeLabels.some(q=>bx+bearingWidth/2+6>q.box.x&&bx-bearingWidth/2-6<q.box.x+q.box.w&&by+5>q.box.y&&by-13<q.box.y+q.box.h);
  if(!clashes&&bx-bearingWidth/2>8&&bx+bearingWidth/2<mapW-8&&by>12&&by<mapH-15){bearingPosition=[bx,by];break;}
 }
 if(bearingPosition)m.fillText(bearingText,...bearingPosition);
 m.beginPath();m.arc(g.x,g.y,5,0,2*Math.PI);m.fillStyle='#111e1d';m.fill();m.strokeStyle=GOLD;m.lineWidth=1.4;m.stroke();
 m.beginPath();m.arc(g.x,g.y,1.7,0,2*Math.PI);m.fillStyle=GOLD;m.fill();
 m.textAlign='left';m.font='600 10px "DM Sans",sans-serif';m.strokeStyle='#111e1d';m.lineWidth=4;m.strokeText('UHURU PEAK',g.x+13,g.y-8);m.fillText('UHURU PEAK',g.x+13,g.y-8);
 if(state.selected){const d=state.distance/state.radius*g.r,px=g.x+Math.sin(a)*d,py=g.y-Math.cos(a)*d;m.strokeStyle=GOLD;m.fillStyle='#14231f';m.beginPath();m.arc(px,py,4,0,2*Math.PI);m.fill();m.stroke();}
 drawPlaceLabels();
}
function drawProfile(){
 if(!state.ready)return;
 const w=profileW,h=profileH,L=48,R=16,T=14,B=25,W=w-L-R,H=h-T-B;
 if(W<1||H<1)return;
 p.clearRect(0,0,w,h);
 const end=nearest(state.radius*1000),a=azimuth(),offset=a*n,flags=visibility();
 // Use more of the chart's height for relief, with real values on a linear axis.
 let low=0,peak=observer;
 for(let j=0;j<=end;j++){const z=heights[offset+j];low=Math.min(low,z);peak=Math.max(peak,z);}
 low=Math.floor((low-100)/100)*100;const high=Math.ceil((peak+100)/100)*100;
 const xx=d=>L+d/(state.radius*1000)*W,yy=z=>T+(high-z)/(high-low)*H;
 const targetStep=(high-low)/Math.max(2,Math.floor(H/24)),magnitude=10**Math.floor(Math.log10(targetStep));
 const step=[1,2,2.5,5,10].find(factor=>factor*magnitude>=targetStep)*magnitude;
 p.font='9px "DM Sans",sans-serif';p.textAlign='right';p.lineWidth=.6;
 for(let z=Math.ceil(low/step)*step;z<=high;z+=step){const y=yy(z);p.strokeStyle='#acb7a51c';p.beginPath();p.moveTo(L,y);p.lineTo(w-R,y);p.stroke();p.fillStyle=MUTED;p.fillText((z/1000)+'k',L-9,y+3);}
 p.textAlign='right';p.font='8px "DM Sans",sans-serif';p.fillStyle=MUTED;p.fillText('Height above sea level (m)',w-R,9);
 p.save();p.beginPath();p.rect(L-4,T-3,W+8,H+6);p.clip();
 p.beginPath();p.moveTo(L,yy(0));p.lineTo(w-R,yy(0));p.strokeStyle='#83a6a552';p.setLineDash([3,5]);p.stroke();p.setLineDash([]);
 p.beginPath();p.moveTo(L,yy(heights[offset]));for(let j=0;j<=end;j++)p.lineTo(xx(distances[j]),yy(heights[offset+j]));p.lineTo(xx(distances[end]),h-B);p.lineTo(L,h-B);p.closePath();
 const fill=p.createLinearGradient(0,T,0,h-B);fill.addColorStop(0,'#a0b18daa');fill.addColorStop(.55,'#6e876477');fill.addColorStop(1,'#35483c50');p.fillStyle=fill;p.fill();
 p.beginPath();p.moveTo(L,yy(heights[offset]));for(let j=0;j<=end;j++)p.lineTo(xx(distances[j]),yy(heights[offset+j]));p.strokeStyle='#b7c5a4';p.lineWidth=1.6;p.stroke();
 p.beginPath();for(let j=0;j<end;j++)if(coverage.seen[Math.floor(state.bearing*4)%coverage.bins]&&flags[offset+j]){p.moveTo(xx(distances[j]),yy(heights[offset+j]));p.lineTo(xx(distances[j+1]),yy(heights[offset+j+1]));}p.strokeStyle=VISIBLE;p.lineWidth=2;p.stroke();
 p.fillStyle=GOLD;p.beginPath();p.arc(L,yy(observer),3,0,2*Math.PI);p.fill();
 if(state.selected){
  const t=pointInfo(),x=xx(t.d),y=yy(t.h);p.beginPath();p.moveTo(L,yy(observer));
  for(let k=1;k<=100;k++){const d=t.d*k/100;p.lineTo(xx(d),yy(profileSightlineHeight(d,t.d,t.target)));}
  p.strokeStyle=GOLD;p.lineWidth=1;p.setLineDash([4,4]);p.stroke();p.setLineDash([]);
  if(x-L>75){
   const text=(t.d<1000?(t.d/1000).toFixed(2):km(t.d))+' km',fraction=.55,labelX=L+(x-L)*fraction;
   const labelY=Math.min(h-B-6,Math.max(T+12,yy(profileSightlineHeight(t.d*fraction,t.d,t.target))-7));
   p.font='9px "DM Sans",sans-serif';p.textAlign='center';const width=p.measureText(text).width;
   p.fillStyle='#13211ee8';p.fillRect(labelX-width/2-5,labelY-10,width+10,14);
   p.fillStyle=GOLD;p.fillText(text,labelX,labelY);
  }
  p.beginPath();p.arc(x,y,3,0,2*Math.PI);p.fillStyle=t.visible?VISIBLE:'#a9b2a4';p.fill();
  p.beginPath();p.moveTo(x,T);p.lineTo(x,h-B);p.strokeStyle='#e6bd7f30';p.lineWidth=.7;p.stroke();
  if(t.block>=0){const d=distances[t.block],bx=xx(d),by=yy(heights[offset+t.block]);p.strokeStyle='#cb9b8d';p.lineWidth=1.5;p.beginPath();p.moveTo(bx-3,by-3);p.lineTo(bx+3,by+3);p.moveTo(bx+3,by-3);p.lineTo(bx-3,by+3);p.stroke();}
 }
 p.restore();
 // Keep the observer label level with its marker, above the descending terrain.
 const observerY=yy(observer);
 p.beginPath();p.moveTo(L+5,observerY);p.lineTo(L+12,observerY);p.strokeStyle=GOLD;p.lineWidth=.8;p.stroke();
 p.fillStyle='#13211e';p.fillRect(L+12,observerY-6,27,13);
 p.font='8px "DM Sans",sans-serif';p.textAlign='left';p.fillStyle=GOLD;p.fillText('YOU',L+16,observerY+3);
 p.fillStyle=MUTED;p.textAlign='center';p.font='9px "DM Sans",sans-serif';
 for(let k=0;k<=4;k++){const d=state.radius*k/4;p.fillText(Math.round(d)+(k===4?' km':''),xx(d*1000),h-8);}
}
function render(time){
 frame=null;
 if(state.ready){
  if(state.playing){
   const advance=state.lastTime?Math.min(time-state.lastTime,100)*.009:0;
   coverage.mark(state.bearing,advance);state.bearing=(state.bearing+advance)%360;
   state.lastTime=time;inspectBeam();
   if(coverage.complete){state.playing=false;state.lastTime=0;}
   updateText();
  }
  if(dirty)rebuildMap();drawMap();drawProfile();
 }
 if(state.playing)frame=requestAnimationFrame(render);
}
for(const b of document.querySelectorAll('[data-dialog]'))b.addEventListener('click',()=>{setPlaying(false);$(b.dataset.dialog).showModal();});
for(const dialog of document.querySelectorAll('dialog')){dialog.querySelector('.close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});}
$('bearing').addEventListener('input',e=>{const bearing=+e.target.value;manual();state.bearing=bearing;coverage.mark(state.bearing);inspectBeam();updateText();schedule();});
$('radius').addEventListener('input',e=>{const radius=+e.target.value;manual();state.radius=radius;resetScan();updateText();schedule(true);});
$('curvature').addEventListener('change',e=>{const curved=e.target.checked;manual();state.curved=curved;resetScan();updateText();schedule(true);});
$('play').addEventListener('click',()=>setPlaying(!state.playing));
map.addEventListener('click',e=>{
 if(!state.ready)return;const r=map.getBoundingClientRect(),dx=e.clientX-r.left-geometry.x,dy=geometry.y-e.clientY+r.top,d=Math.hypot(dx,dy)/geometry.r*state.radius;
 if(d>state.radius||d<.03)return;
 const px=e.clientX-r.left,py=e.clientY-r.top;
 let place=placeLabels.find(q=>px>=q.box.x-3&&px<=q.box.x+q.box.w+3&&py>=q.box.y-3&&py<=q.box.y+q.box.h+3)||places.find(q=>{const [x,y]=mapXY(q.x,q.y);return Math.hypot(x-px,y-py)<12;});
 selectDirection(place?place.bearing:deg(Math.atan2(dx,dy)),place?place.d/1000:d,place?.name||'');
 const t=pointInfo(),tooltip=$('map-tooltip');tooltip.replaceChildren();const text=document.createElement('span');text.textContent=(state.name||'Selected ground')+' · '+(t.visible?'potentially visible':'hidden');const detail=document.createElement('small');detail.textContent=km(t.d)+' km from Uhuru Peak · '+Math.round(t.h).toLocaleString()+' m';tooltip.append(text,detail);tooltip.style.left=Math.min(mapW-215,Math.max(10,e.clientX-r.left+14))+'px';tooltip.style.top=Math.min(mapH-78,Math.max(10,e.clientY-r.top-62))+'px';tooltip.hidden=false;
});
map.addEventListener('keydown',e=>{if(!state.ready)return;if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();selectDirection(state.bearing+(e.key==='ArrowLeft'?-1:1),state.distance);}else if(e.code==='Space'){e.preventDefault();setPlaying(!state.playing);}});
profile.addEventListener('click',e=>{if(!state.ready)return;const r=profile.getBoundingClientRect(),d=(e.clientX-r.left-48)/(r.width-64)*state.radius;selectDirection(state.bearing,Math.max(.03,Math.min(d,state.radius)));});
document.addEventListener('visibilitychange',()=>{if(document.hidden)setPlaying(false);});
const layoutObserver=new ResizeObserver(resize);
for(const selector of ['.workspace','.map-panel','.profile-chart'])layoutObserver.observe(document.querySelector(selector));
const smallScreen=window.matchMedia('(max-width:1100px)');
$('visible-features').open=!smallScreen.matches;
smallScreen.addEventListener('change',e=>{$('visible-features').open=!e.matches;});
async function getJSON(url){const r=await fetch(url);if(!r.ok)throw new Error(`${url}: ${r.status}`);return r.json();}
async function start(){
 try{
  [meta,countries]=await Promise.all([getJSON('data/metadata.json'),getJSON('data/countries.geojson')]);
  distances=meta.distances;n=distances.length;observer=meta.observer.modelElevation+meta.observer.eyeHeight;
  $('radius').max=distances[n-1]/1000;
  $('model-height').textContent=Math.round(observer).toLocaleString()+' m above sea level';
  const [terrain,image]=await Promise.all([fetch('data/terrain.bin').then(r=>{if(!r.ok)throw new Error('Terrain download failed');return r.arrayBuffer();}),new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Relief image unavailable'));img.src='data/relief.webp';})]);
  if(terrain.byteLength!==meta.bearings*n*2)throw new Error('Terrain size does not match source record');
  heights=new Int16Array(terrain);relief=image;
  for(const place of places){Object.assign(place,projectLocation(place.lat,place.lon));place.sampleIndex=(Math.round(place.bearing*4)%meta.bearings)*n+nearest(place.d);}
  const worker=new Worker('visibility-worker.js');
  const calculated=await new Promise((resolve,reject)=>{worker.onmessage=e=>resolve(e.data);worker.onerror=()=>reject(new Error('The visibility calculation could not start'));worker.postMessage({buffer:terrain.slice(0),distances,bearings:meta.bearings,observer,earthRadius:meta.earthRadius,refraction:meta.refraction});});
  worker.terminate();visibleCurved=new Uint8Array(calculated.curved);visibleFlat=new Uint8Array(calculated.flat);
  for(const place of places.slice(0,5)){const b=document.createElement('button');b.innerHTML=place.name+' <span>↗</span>';b.title=`Look towards ${place.name}, ${Math.round(place.d/1000)} km away`;b.addEventListener('click',()=>{if(place.d/1000>state.radius){state.radius=Math.min(distances[n-1]/1000,Math.ceil(place.d/10000)*10+10);resetScan();dirty=true;}selectDirection(place.bearing,place.d/1000,place.name);});$('landmarks').append(b);}
  state.ready=true;$('play').disabled=false;$('loading').hidden=true;resetScan();updateText();resize();
 }catch(error){
  $('loading').replaceChildren();const h=document.createElement('h2');h.textContent='The landscape could not load';const p=document.createElement('p');p.textContent='Open this app through a local web server, then reload to try again.';const detail=document.createElement('p');detail.textContent=error.message;const retry=document.createElement('button');retry.textContent='Try again';retry.style.padding='10px 18px';retry.onclick=()=>window.location.reload();$('loading').append(h,p,detail,retry);console.error(error);
 }
}
start();
