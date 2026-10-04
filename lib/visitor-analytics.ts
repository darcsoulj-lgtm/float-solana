// Runs before analytics can load; the exclusion preference never leaves the device.
export const visitorAnalyticsBootstrap = String.raw`(function(){
try {
  var u=new URL(location.href), key='float-analytics-excluded';
  var preference=u.searchParams.get('float_internal');
  if(preference==='1'||preference==='0') {
    localStorage.setItem(key,preference);
    u.searchParams.delete('float_internal');
    history.replaceState(history.state,'',u.pathname+u.search+u.hash);
    return;
  }
  if(location.hostname!=='joinfloat.xyz'||localStorage.getItem(key)==='1')return;
  var privatePath=/^\/(wallet|api|admin|profile|widget|preview|analytics-settings)(\/|$)/;
  if(privatePath.test(u.pathname)||u.searchParams.has('float_handoff')||u.searchParams.has('float_wallet')||u.searchParams.has('join'))return;
  if(document.referrer) {
    var ref=new URL(document.referrer);
    if(privatePath.test(ref.pathname)||ref.searchParams.has('float_handoff')||ref.searchParams.has('float_wallet'))return;
  }
  if(document.getElementById('float-visitor-analytics'))return;
  var s=document.createElement('script');
  s.id='float-visitor-analytics';s.type='module';s.async=true;
  s.src='https://static.cloudflareinsights.com/beacon.min.js';
  s.setAttribute('data-cf-beacon',JSON.stringify({token:'dc8f30aca823476dbe90f231f2c35596',spa:false}));
  document.head.appendChild(s);
}catch(e){}
})();`;
