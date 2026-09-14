// Node for Max is bundled with Live. No npm packages or native add-ons required.
'use strict';
const http=require('node:http');
let max;
try { max=require('max-api'); } catch { max={addHandler(){},outlet(){}}; }
let generation=0,base=null,stream=null,active=null,queue=[],last={},streamBuffer='',eventName='',eventData=[],eventSize=0;
function emit(...args){max.outlet(args);}
function disconnect(){generation++;if(stream)stream.destroy();if(active)active.destroy();stream=null;active=null;base=null;queue=[];last={};streamBuffer='';eventData=[];eventName='';eventSize=0;}
function fail(detail){disconnect();emit('httpstatus',0,detail);}
function enqueue(method,path,key='',value=''){
    if(!base)return;
    if(queue.some(q=>q.path===path&&q.key===key))return;
    if(queue.length>=64){fail('Connection queue full; reconnect');return;}
    queue.push({method,path,key,value});pump();
}
function pump(){
    if(active||!base||!queue.length)return;const task=queue.shift(),gen=generation;
    const body=task.method==='POST'?new URLSearchParams({key:task.key,value:String(task.value)}).toString():'';
    const req=http.request(new URL(task.path,base),{method:task.method,timeout:1600,headers:body?{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body)}:{}},res=>{
        let text='';res.setEncoding('utf8');res.on('data',b=>{text+=b;if(text.length>65536)req.destroy(new Error('Response too large'));});
        res.on('end',()=>{
            if(gen!==generation)return;active=null;
            try {
                if(res.statusCode!==200)throw new Error('HTTP '+res.statusCode);
                const data=JSON.parse(text);if(data.ok===0)throw new Error('Command rejected');
                if(task.method==='POST')emit('ack',1,task.key);
                else {const tag=task.path.split('/').pop();if(tag==='synth'||last[tag]!==text){last[tag]=text;emit('hardware',tag,text);}}
            } catch(err){if(task.method==='POST')emit('ack',0,task.key);else {fail(err.message);return;}}
            pump();
        });
    });
    active=req;req.on('timeout',()=>req.destroy(new Error('BECA request timed out')));
    req.on('error',err=>{if(gen===generation)fail(err.message+'; reconnect to retry');});req.end(body);
}
function parseEvent(){
    const data=eventData.join('\n');
    if(eventName==='note'){
        const parts=data.split('|'),notes=parts[0]==='1'?(parts[3]||'').split(',').filter(Boolean).map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<=127):[];
        emit('remote_notes',JSON.stringify({notes:notes.slice(0,8),vel:Number(parts[1])||80}));
    }
    // State/plant display reads are coalesced by the 500 ms LIVE request.
    eventName='';eventData=[];eventSize=0;
}
function openStream(){
    const gen=generation;
    const req=http.get(new URL('/events',base),res=>{
        if(gen!==generation){res.destroy();return;}
        if(res.statusCode!==200){req.destroy();if(gen===generation)fail('BECA event stream unavailable');return;}
        emit('httpstatus',1,'Wi-Fi connected: '+base.host);res.setEncoding('utf8');
        res.on('data',chunk=>{
            if(gen!==generation)return;streamBuffer+=chunk;if(streamBuffer.length>65536){fail('Event stream exceeded buffer limit');return;}
            let i;while((i=streamBuffer.indexOf('\n'))>=0){const line=streamBuffer.slice(0,i).replace(/\r$/,'');streamBuffer=streamBuffer.slice(i+1);
                if(!line)parseEvent();else if(line.startsWith('event:'))eventName=line.slice(6).trim();else if(line.startsWith('data:')){eventSize+=line.length;if(eventSize>65536){fail('Event exceeded buffer limit');return;}eventData.push(line.slice(5).trim());}}
        });
        res.on('end',()=>{if(gen===generation)fail('Wi-Fi disconnected; reconnect');});
        res.on('error',err=>{if(gen===generation)fail(err.message);});
    });
    stream=req;req.setTimeout(5000,()=>req.destroy(new Error('Event stream timed out')));req.on('error',err=>{if(gen===generation)fail(err.message);});
}
function connect(host){
    disconnect();try{base=new URL(/^http:\/\//i.test(String(host))?String(host):'http://'+host);
        if(base.protocol!=='http:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw new Error('Enter a BECA hostname or IP with optional port');
    }catch(err){fail(err.message);return;}
    openStream();enqueue('GET','/api/params');enqueue('GET','/api/live');enqueue('GET','/api/synth');
}
max.addHandler('connect',connect);max.addHandler('disconnect',disconnect);
max.addHandler('read',tag=>{if(['live','synth','params'].includes(tag))enqueue('GET','/api/'+tag);});
max.addHandler('write',(key,value)=>{if(key==='ts'&&/^\d{1,2}-\d{1,2}$/.test(String(value)))enqueue('POST','/api/set',key,String(value));else if(/^[a-z_]+$/.test(key)&&Number.isFinite(Number(value)))enqueue('POST','/api/set',key,Number(value));});
module.exports={connect,disconnect,enqueue};
