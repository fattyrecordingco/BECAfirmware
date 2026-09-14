autowatch=0;inlets=1;outlets=1;
mgraphics.init();mgraphics.relative_coords=0;mgraphics.autofill=0;
var history=[],raw=0,energy=0,online=false,stale=true,noteText='No notes yet',statusText='Live MIDI ready',xpos=.65,ypos=.2;
function color(r,g,b,a){mgraphics.set_source_rgba(r,g,b,a==null?1:a);}
function label(text,x,y,size){mgraphics.select_font_face('Arial');mgraphics.set_font_size(size||10);mgraphics.move_to(x,y);mgraphics.show_text(String(text));}
function paint(){
    var w=box.rect[2]-box.rect[0],h=box.rect[3]-box.rect[1];color(.90,.93,.90);mgraphics.rectangle(0,0,w,h);mgraphics.fill();
    color(0,.43,.27);label('PLANT  /  SOUND PAD',8,14,11);color(.18,.23,.20);label(stale?'No fresh sensor data':'ADC1 '+raw+'  |  '+energy.toFixed(3),8,29,10);
    color(.98,.99,.98);mgraphics.rectangle(8,36,w-16,63);mgraphics.fill();
    color(0,.51,.32);mgraphics.set_line_width(1.3);
    if(history.length>1){for(var i=0;i<history.length;i++){var xx=8+i/(Math.max(1,history.length-1))*(w-16),yy=98-history[i]*61;if(i===0)mgraphics.move_to(xx,yy);else mgraphics.line_to(xx,yy);}mgraphics.stroke();}
    color(0,.38,.23,.45);mgraphics.ellipse(8+xpos*(w-16)-4,36+(1-ypos)*63-4,8,8);mgraphics.fill();
    color(.18,.23,.20);label('Drag: cutoff / resonance',8,112,10);label(noteText,8,128,10);
    color(online?0:.4,online?.43:.4,online?.27:.4);label(statusText.slice(0,35),8,145,9);
}
function anything(){var a=arrayfromargs(arguments),name=messagename;
    if(name==='plant'){energy=Number(a[0]);raw=Number(a[1]);stale=false;history.push(energy);if(history.length>96)history.shift();}
    else if(name==='connected')online=!!a[0];else if(name==='stale')stale=true;
    else if(name==='status')statusText=a.join(' ');else if(name==='note')noteText='MIDI '+a[0]+'  velocity '+a[1]+'  ch '+a[2];else if(name==='panic')noteText='All notes released';
    else if(name==='parameter'){if(a[0]==='cutoff')xpos=Math.log(Math.max(20,a[1])/20)/Math.log(900);if(a[0]==='resonance')ypos=(a[1]-.1)/4.9;}
    mgraphics.redraw();
}
function pad(x,y,begin){var w=box.rect[2]-box.rect[0];xpos=Math.max(0,Math.min(1,(x-8)/(w-16)));ypos=Math.max(0,Math.min(1,1-(y-36)/63));outlet(0,'xy',xpos,ypos,begin);mgraphics.redraw();}
function onclick(x,y){if(y>=36&&y<=99)pad(x,y,1);}
function ondrag(x,y,button){if(button)pad(x,y,0);}
