const test=require('node:test');const assert=require('node:assert/strict');
const http=require('node:http');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('HTTP/SSE connection serializes requests, carries note snapshots, and clears on disconnect',async()=>{
  const handlers={},events=[],writes=[];let busy=0,maximum=0,sse;
  const server=http.createServer((req,res)=>{
    if(req.url==='/events'){sse=res;res.writeHead(200,{'Content-Type':'text/event-stream'});res.write('event: hello\ndata: BECA\n\n');return;}
    busy++;maximum=Math.max(maximum,busy);let body='';req.on('data',b=>body+=b);
    req.on('end',()=>setTimeout(()=>{busy--;if(req.method==='POST')writes.push(body);
      res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(req.method==='POST'?{ok:1}:req.url==='/api/live'?{plant:{value:.4,raw:440},state:{bpm:120}}:{}));},20));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const context=vm.createContext({require:n=>n==='max-api'?{addHandler:(k,f)=>handlers[k]=f,outlet:e=>events.push(e)}:require(n),module:{exports:{}},URL,URLSearchParams,Buffer,console});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../beca_http.js'),'utf8'),context);
  try{
    handlers.connect('127.0.0.1:'+server.address().port);await delay(120);
    assert(events.some(e=>e[0]==='httpstatus'&&e[1]===1));assert(events.some(e=>e[0]==='hardware'&&e[1]==='live'));
    sse.write('event: note\ndata: 1|90|0|60,64\n\n');await delay(25);
    assert(events.some(e=>e[0]==='remote_notes'&&JSON.parse(e[1]).notes.join(',')==='60,64'));
    handlers.write('cutoff',900);handlers.write('ts','4-4');handlers.read('live');await delay(100);
    assert.equal(maximum,1);assert(writes.includes('key=cutoff&value=900'));assert(writes.includes('key=ts&value=4-4'));
    const synthCount=events.filter(e=>e[0]==='hardware'&&e[1]==='synth').length;
    handlers.read('synth');await delay(50);
    assert.equal(events.filter(e=>e[0]==='hardware'&&e[1]==='synth').length,synthCount+1,'explicit sound reads must return unchanged snapshots');
    handlers.disconnect();const count=events.length;await delay(50);assert.equal(events.length,count);
  }finally{handlers.disconnect();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('invalid connection address is rejected before making a request',()=>{
  const handlers={},events=[];const context=vm.createContext({require:n=>n==='max-api'?{addHandler:(k,f)=>handlers[k]=f,outlet:e=>events.push(e)}:require(n),module:{exports:{}},URL,URLSearchParams,Buffer});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../beca_http.js'),'utf8'),context);
  handlers.connect('http://user:secret@localhost/');assert(events.some(e=>e[0]==='httpstatus'&&e[1]===0));handlers.disconnect();
});
