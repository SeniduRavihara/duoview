// Capture only the pixels visible inside a preview, excluding workspace controls.
export function visiblePreviewRect(frame, stage) {
  const f = frame.getBoundingClientRect();
  const s = stage.getBoundingClientRect();
  const left = Math.max(0, f.left, s.left + stage.clientLeft);
  const top = Math.max(0, f.top, s.top + stage.clientTop);
  const right = Math.min(innerWidth, f.right, s.left + stage.clientLeft + stage.clientWidth);
  const bottom = Math.min(innerHeight, f.bottom, s.top + stage.clientTop + stage.clientHeight);
  if (right - left < 1 || bottom - top < 1) throw new Error('Scroll this preview into view before taking a screenshot.');
  return {left,top,width:right-left,height:bottom-top};
}
export async function saveScreenshot(dataUrl, rect, viewport, filename) {
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  try {
    const scaleX = bitmap.width / viewport.width;
    const scaleY = bitmap.height / viewport.height;
    const x = Math.max(0,Math.round(rect.left*scaleX));
    const y = Math.max(0,Math.round(rect.top*scaleY));
    const width = Math.min(bitmap.width-x,Math.round(rect.width*scaleX));
    const height = Math.min(bitmap.height-y,Math.round(rect.height*scaleY));
    if (width < 1 || height < 1) throw new Error('Preview is outside the visible window.');
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap,x,y,width,height,0,0,width,height);
    const blob = await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if (!blob) throw new Error('Could not create the PNG.');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename;
    document.body.append(link); link.click(); link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  } finally {bitmap.close();}
}
