type MaintenanceBinding={publicSnapshot():Promise<void>;health():Promise<void>;activity():Promise<void>};

// Keep publication and monitoring reachable even when subsequent collection
// exhausts a shared request budget. These readers preserve source timestamps.
export async function runMarketMaintenance(binding:MaintenanceBinding,time:number):Promise<boolean>{
  let failed=false;
  try{await binding.publicSnapshot();}
  catch{failed=true;console.error('Public market snapshot publication failed');}
  if(Math.floor(time/60000)%5===0){
    try{await binding.health();}
    catch{failed=true;console.error('Market health or maintenance failed');}
  }
  if(Math.floor(time/60000)%60===0){
    try{await binding.activity();}
    catch{console.error('Trading activity recording failed; retry next hour');}
  }
  return failed;
}
