// App-owned input shield: the remote page never receives picking clicks/keys.
export const annotationOverlayHtml = `<!doctype html><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;cursor:crosshair;background:transparent}#outline{position:fixed;pointer-events:none;box-sizing:border-box;border:2px solid Highlight;background:color-mix(in srgb,Highlight 12%,transparent);display:none}#label{position:fixed;pointer-events:none;max-width:320px;padding:6px 10px;border-radius:6px;font:12px system-ui;color:HighlightText;background:Highlight;left:12px;bottom:12px}</style>
<div id="outline"></div><div id="label">Click an element to add it to your message · Esc to cancel</div>
<script>
const bridge=window.nativepiBrowser, outline=document.getElementById('outline'), label=document.getElementById('label');
let busy=false;
window.addEventListener('pointermove',async e=>{if(busy)return;busy=true;try{const r=await bridge.invoke({action:'annotationPoint',x:Math.round(e.clientX),y:Math.round(e.clientY),capture:false});outline.style.display=r?.bounds?'block':'none';if(r?.bounds){Object.assign(outline.style,{left:r.bounds.x+'px',top:r.bounds.y+'px',width:r.bounds.width+'px',height:r.bounds.height+'px'});}label.textContent=r?.error||'Click '+(r?.tag||'an element')+' to add to message · Esc to cancel';}finally{busy=false;}});
window.addEventListener('click',async e=>{e.preventDefault();const r=await bridge.invoke({action:'annotationPoint',x:Math.round(e.clientX),y:Math.round(e.clientY),capture:true});if(r?.error)label.textContent=r.error;});
window.addEventListener('keydown',e=>{e.preventDefault();if(e.key==='Escape')void bridge.invoke({action:'cancelAnnotation'});});
window.addEventListener('contextmenu',e=>e.preventDefault());
</script>`;
