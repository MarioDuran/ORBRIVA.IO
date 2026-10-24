// Only initializes Google H5 Games Ad Placement API for an approved publisher ID.
// No ads run during a live match, and replay is never blocked by unavailable ads.
let adsReady=false,adClient='',lastAd=0;
export function setupAds(client){
  if(!/^ca-pub-\d{16}$/.test(client||''))return;
  adClient=client;
  window.adsbygoogle=window.adsbygoogle||[];
  window.adBreak=window.adConfig=function(o){window.adsbygoogle.push(o);};
  const tag=document.createElement('script');tag.async=true;
  tag.src=`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  tag.crossOrigin='anonymous';tag.dataset.adClient=client;
  tag.dataset.adFrequencyHint='120s';
  tag.onerror=()=>{adsReady=false;};
  document.head.appendChild(tag);
  window.adConfig({sound:'off',preloadAdBreaks:'auto',onReady:()=>{adsReady=true;}});
}
export function replayWithPossibleAd(begin,rounds){
  if(!adsReady||!adClient||rounds<1||Date.now()-lastAd<120_000){begin();return;}
  lastAd=Date.now();let started=false;
  const complete=()=>{if(!started){started=true;begin();}};
  try{
    window.adBreak({type:'next',name:'replay-game',beforeAd:()=>{},afterAd:()=>{},adBreakDone:complete});
  }catch{complete();}
}
