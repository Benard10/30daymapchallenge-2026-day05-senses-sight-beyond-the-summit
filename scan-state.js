/* Angular coverage is presentation state, separate from terrain visibility. */
(function(root){
 class SweepCoverage{
  constructor(bins=1440){this.bins=bins;this.reset();}
  reset(){this.seen=new Uint8Array(this.bins);this.count=0;}
  mark(bearing,advance=0){
   const step=360/this.bins;
   const first=Math.floor(bearing/step),last=Math.floor((bearing+Math.max(0,advance))/step);
   for(let i=first;i<=Math.min(last,first+this.bins);i++){
    const a=((i%this.bins)+this.bins)%this.bins;
    if(!this.seen[a]){this.seen[a]=1;this.count++;}
   }
  }
  get complete(){return this.count===this.bins;}
  get percent(){return Math.floor(this.count/this.bins*100);}
 }
 if(typeof module!=='undefined'&&module.exports)module.exports=SweepCoverage;
 else root.SweepCoverage=SweepCoverage;
})(globalThis);
