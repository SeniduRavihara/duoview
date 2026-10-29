// Resize the real iframe widths, not a scaled picture of the website.
export function rebuildDividers(panes, refresh, save) {
  document.querySelectorAll('.divider-handle').forEach(el=>el.remove());
  for (let i=0;i<panes.length-1;i++) {
    const left=panes[i],right=panes[i+1];
    const handle=document.createElement('div');
    handle.className='divider-handle';handle.tabIndex=0;
    handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');
    handle.setAttribute('aria-label',`Resize viewports ${i+1} and ${i+2}`);
    handle.title='Drag to resize both viewports. Arrow keys adjust width; Shift makes larger steps.';
    left.el.after(handle);
    function snapshot() {
      return {left:left.el.getBoundingClientRect().width,right:right.el.getBoundingClientRect().width};
    }
    function apply(start,delta) {
      const total=start.left+start.right;
      const width=Math.round(Math.max(320,Math.min(total-320,start.left+delta)));
      for (const [p,size] of [[left,width],[right,total-width]]) {
        const stage=p.el.querySelector('.stage');
        const gutter=stage.offsetWidth-stage.clientWidth;
        p.panelWidth=Math.round(size);
        p.width=Math.max(240,Math.min(3840,Math.floor(size-14-gutter)));
        p.preset='Custom';p.scale='1';refresh(p);
      }
      handle.setAttribute('aria-valuemin','320');handle.setAttribute('aria-valuemax',String(Math.floor(total-320)));
      handle.setAttribute('aria-valuenow',String(width));
      handle.setAttribute('aria-valuetext',`${left.width} pixels and ${right.width} pixels`);
    }
    let drag=null;
    function finish(event) {
      if (!drag || (event.pointerId!==undefined && event.pointerId!==drag.id)) return;
      const id=drag.id;drag=null;
      document.body.classList.remove('resizing-viewports');
      if(handle.hasPointerCapture(id))handle.releasePointerCapture(id);
      save();
    }
    handle.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      event.preventDefault();handle.focus();
      drag={...snapshot(),x:event.clientX,id:event.pointerId};
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add('resizing-viewports');
    });
    handle.addEventListener('pointermove',event=>{
      if(drag && event.pointerId===drag.id)apply(drag,event.clientX-drag.x);
    });
    handle.addEventListener('pointerup',finish);
    handle.addEventListener('pointercancel',finish);
    handle.addEventListener('lostpointercapture',finish);
    handle.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
      event.preventDefault();apply(snapshot(),(event.key==='ArrowLeft'?-1:1)*(event.shiftKey?50:10));save();
    });
  }
}
