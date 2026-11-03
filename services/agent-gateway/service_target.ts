/** Cloud Run candidate tags keep the canonical service audience. */
export function serviceTargetMatches(targetRaw:string,audienceRaw:string):boolean{
  try{
    const target=new URL(targetRaw),audience=new URL(audienceRaw);
    for(const url of [target,audience])if(url.protocol!=="https:"||url.username||url.password||
      url.port||url.pathname!=="/"||url.search||url.hash)return false;
    return target.origin===audience.origin||
      (audience.hostname.endsWith(".run.app")&&target.hostname.endsWith(`---${audience.hostname}`)&&
        /^[a-z][a-z0-9-]{0,62}$/.test(target.hostname.slice(0,-audience.hostname.length-3)));
  }catch{return false;}
}
