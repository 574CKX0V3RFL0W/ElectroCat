/* ElectroCat client — no framework or build step, runs fully on localhost. */
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let parts = [], templates = {}, editId = null, labelIds = [];
let printer = null, printing = false, stopBatchRequested = false;
const selection = new Set();
const fields = ["part_number","category","subtype","description","manufacturer","package","quantity",
  "location","supplier","purchase_url","source_url","datasheet_url","status","notes"];

async function api(path, method='GET', data) {
  const response = await fetch(path, { method, headers: data ? {"Content-Type":"application/json"} : {},
    body: data ? JSON.stringify(data) : undefined });
  let content;
  try { content = await response.json(); } catch { content = {}; }
  if (!response.ok) throw new Error(content.error || `HTTP ${response.status}`);
  return content;
}
function toast(message) {
  const node = $('toast'); node.textContent = message; node.classList.remove('hidden');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.add('hidden'), 3700);
}
function status(message) { $('save-status').textContent = '● ' + message; }

async function load() {
  try {
    [parts, templates] = await Promise.all([api('/api/entries'), api('/api/templates')]);
    $('f-category').innerHTML = Object.keys(templates).map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
    render();
    const requested = new URLSearchParams(location.search).get('edit');
    if (requested && parts.some(p => p.id === Number(requested))) openEditor(Number(requested));
  } catch(err) { toast('Could not reach the local service: ' + err.message); }
}
function filtered() {
  const q = $('search').value.trim().toLowerCase(), cat = $('filter-category').value;
  return parts.filter(p => (!cat || p.category === cat) &&
    (!q || [p.part_number,p.category,p.description,p.package,p.location,p.manufacturer,
      ...p.attributes.flatMap(a => [a.label,a.value,a.note])].join(' ').toLowerCase().includes(q)));
}
function render() {
  $('total-count').textContent = parts.length;
  $('side-count').textContent = parts.length;
  $('category-count').textContent = new Set(parts.map(p => p.category)).size;
  $('review-count').textContent = parts.filter(p => p.status === 'review').length;
  const previous = $('filter-category').value;
  $('filter-category').innerHTML = '<option value="">All categories</option>' +
    [...new Set(parts.map(p => p.category))].sort().map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  $('filter-category').value = previous;
  const visible = filtered();
  $('table-count').textContent = '(' + visible.length + ')';
  $('table-footer').textContent = visible.length + (visible.length === 1 ? ' entry' : ' entries');
  $('rows').innerHTML = visible.map(p => `
    <tr data-id="${p.id}">
      <td class="check-col"><input class="row-check" type="checkbox" aria-label="Select ${esc(p.part_number)}"
          ${selection.has(p.id) ? 'checked' : ''}></td>
      <td class="part-cell"><strong>${esc(p.part_number)}</strong><small>#EC-${String(p.id).padStart(4,'0')}</small></td>
      <td class="type-cell"><strong>${esc(p.category)}${p.subtype ? ' · ' + esc(p.subtype) : ''}</strong><span title="${esc(p.description)}">${esc(p.description || 'Description not entered')}</span></td>
      <td><span class="pkg">${esc(p.package || '—')}</span></td>
      <td>${p.quantity == null ? '<span class="location">—</span>' : esc(p.quantity)}</td>
      <td class="location">${esc(p.location || '—')}</td>
      <td><span class="status-pill ${esc(p.status)}">${p.status === 'reference' ? 'Reference' : p.status === 'confirmed' ? 'Confirmed' : 'Review'}</span></td>
      <td class="row-arrow">›</td>
    </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;padding:35px;color:#91a3ab">No matching components yet.</td></tr>';
  $('selection-count').textContent = selection.size ? '(' + selection.size + ')' : '';
  $('check-all').checked = visible.length > 0 && visible.every(p => selection.has(p.id));
  $('check-all').indeterminate = visible.some(p => selection.has(p.id)) && !visible.every(p => selection.has(p.id));
}
function close(type) {
  $(type + '-overlay').classList.add('hidden');
  if (type === 'editor' && location.search) history.replaceState({},'',location.pathname);
}
function addDynamic(container, values, kind) {
  const row = document.createElement('div');
  row.className = 'dynamic-row ' + (kind === 'pin' ? 'pins' : '');
  const keys = kind === 'pin' ? ['number','signal','label'] : ['label','value','note'];
  for (const key of keys) {
    const inp = document.createElement('input');
    inp.dataset.key = key;
    inp.placeholder = ({number:'Pin #',signal:'Signal',label:kind === 'pin' ? 'Function' : 'Parameter',value:'Value + unit',note:'Test condition'}[key]);
    inp.value = values?.[key] ?? '';
    row.appendChild(inp);
  }
  const remove = document.createElement('button');
  remove.className = 'remove-row'; remove.type = 'button'; remove.textContent = '×';
  remove.title = 'Remove this row'; remove.addEventListener('click', () => row.remove());
  row.appendChild(remove);
  $(container).appendChild(row);
}
function fillForm(data) {
  for (const k of fields) {
    const node = $('f-' + k);
    node.value = data[k] == null ? '' : String(data[k]);
  }
  $('attribute-rows').innerHTML = '';
  $('pin-rows').innerHTML = '';
  for (const attr of data.attributes || []) addDynamic('attribute-rows', attr, 'attribute');
  for (const pin of data.pinout || []) addDynamic('pin-rows', pin, 'pin');
}
function readDynamic(container) {
  return [...$(container).children].map(row => Object.fromEntries(
    [...row.querySelectorAll('input')].map(i => [i.dataset.key,i.value.trim()])))
    .filter(x => Object.values(x).some(Boolean));
}
function readForm() {
  const obj = Object.fromEntries(fields.map(k => [k, $('f-' + k).value.trim()]));
  obj.quantity = obj.quantity === '' ? null : Number(obj.quantity);
  obj.attributes = readDynamic('attribute-rows');
  obj.pinout = readDynamic('pin-rows');
  return obj;
}
function openEditor(id=null) {
  editId = id;
  $('editor-title').textContent = id ? 'Edit component' : 'Add entry';
  $('delete-entry').style.visibility = id ? 'visible' : 'hidden';
  $('editor-notice').className = 'notice';
  $('editor-notice').textContent = id
    ? 'Changes are saved to SQLite and exported immediately to an Excel backup.'
    : 'Enter a part name, then click Autofill to suggest its type-specific parameters.';
  if (id) fillForm(parts.find(p => p.id === id));
  else fillForm({category:'Other',status:'review',attributes:[],pinout:[]});
  $('editor-overlay').classList.remove('hidden');
  if (!id) $('f-part_number').focus();
}
async function autofillForm() {
  const current = readForm();
  if (!current.part_number && !current.source_url) return toast('Enter a part number or URL first.');
  const button = $('autofill-btn'); button.disabled = true; button.textContent = 'Looking up…';
  try {
    const result = await api('/api/autofill','POST',{
      name:current.part_number, source_url:current.source_url,
      use_ai:true
    });
    const filled = result.entry;
    filled.quantity = current.quantity;
    filled.location = current.location;
    filled.supplier = current.supplier || filled.supplier;
    if (editId) filled.status = current.status;
    fillForm(filled);
    $('editor-notice').textContent = result.warnings.join(' ');
    $('editor-notice').className = 'notice warning';
    toast('Autofill complete. Please review the suggestions.');
  } catch(err) { toast('Autofill: ' + err.message); }
  finally { button.disabled = false; button.textContent = '⌕ Autofill details'; }
}
async function saveEntry() {
  const data = readForm();
  if (!data.part_number) return toast('Please provide a part number.');
  const button = $('save-entry'); button.disabled = true; status('Saving…');
  try {
    await api(editId ? '/api/entries/' + editId : '/api/entries', editId ? 'PATCH' : 'POST', data);
    close('editor'); parts = await api('/api/entries'); render();
    status('All changes backed up'); toast(editId ? 'Part updated and backed up.' : 'Part added and backed up.');
  } catch(err) { toast(err.message); status('Backup needs attention'); }
  finally { button.disabled = false; }
}
async function deleteEntry() {
  const part = parts.find(p=>p.id===editId);
  if (!part || !confirm('Permanently delete ' + part.part_number + ' from your catalog? A versioned Excel backup will be kept.')) return;
  try {
    await api('/api/entries/'+editId,'DELETE');
    selection.delete(editId); close('editor'); parts = await api('/api/entries'); render();
    toast('Deleted. A new Excel backup was written.');
  } catch(err) { toast(err.message); }
}

// Pixel-perfect 384 by 352 monochrome raster. The browser does not resize it.
const LABEL_W = 384, LABEL_H = 352;
function fitting(ctx, text, x, y, width, size, min=10, weight='bold') {
  text = String(text ?? '');
  for (let s = size; s >= min; s--) {
    ctx.font = `${weight} ${s}px Arial, sans-serif`;
    if (ctx.measureText(text).width <= width) { ctx.fillText(text,x,y); return; }
  }
  while (text.length && ctx.measureText(text + '…').width > width) text = text.slice(0,-1);
  ctx.fillText(text + '…',x,y);
}
function pinout(ctx, p) {
  const pins = p.pinout || [];
  if (!pins.length) return;
  ctx.fillStyle='#111'; fitting(ctx,'TOP VIEW',278,152,82,12,10);
  if (pins.length === 3) {
    const byNumber = Object.fromEntries(pins.map(pin=>[pin.number,pin.signal]));
    ctx.fillRect(279,193,68,60);
    ctx.fillRect(302,178,22,17);
    ctx.fillRect(287,251,12,21); ctx.fillRect(327,251,12,21);
    ctx.fillStyle='#fff'; fitting(ctx, p.package || 'SOT',289,229,50,12,9);
    ctx.fillStyle='#111';
    fitting(ctx,`3:${byNumber['3']||'?'}`,292,173,59,13,10);
    fitting(ctx,`1:${byNumber['1']||'?'}`,265,291,46,13,10);
    fitting(ctx,`2:${byNumber['2']||'?'}`,320,291,47,13,10);
  } else {
    ctx.strokeStyle='#111'; ctx.lineWidth=2; ctx.strokeRect(278,176,76,83);
    fitting(ctx, p.package || 'IC',290,220,50,13,10);
    pins.slice(0,5).forEach((pin,i)=>fitting(ctx,`${pin.number}:${pin.signal}`,266,281+i*13,100,11,9));
  }
}
function renderLabel(p, canvas=$('label-canvas')) {
  canvas.width = LABEL_W; canvas.height = LABEL_H;
  const ctx = canvas.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,LABEL_W,LABEL_H);
  ctx.fillStyle='#111'; ctx.fillRect(0,0,LABEL_W,61);
  ctx.fillStyle='#fff'; fitting(ctx,p.part_number,13,39,350,34,19);
  ctx.fillStyle='#111';
  fitting(ctx,`${p.category || 'COMPONENT'}  •  ${p.subtype || p.description || ''}`.toUpperCase(),15,84,351,16,10);
  fitting(ctx,p.description || p.manufacturer || '',15,107,351,12,10,'normal');
  ctx.fillRect(14,120,356,2);
  const attributes=(p.attributes||[]).filter(a=>a.label && a.value).slice(0,6);
  attributes.forEach((a,i)=>{
    const y=150+i*26;
    ctx.fillStyle='#111';
    fitting(ctx,a.label,16,y,139,15,10);
    ctx.textAlign='right';
    const v=String(a.value);
    fitting(ctx,v,252,y,94,16,10);
    ctx.textAlign='left';
    ctx.fillStyle='#ddd'; ctx.fillRect(16,y+8,236,1);
  });
  pinout(ctx,p);
  if(p.category==='MOSFET'){
    ctx.fillStyle='#111'; fitting(ctx,'VGS(th) ≠ fully ON',16,323,231,12,10);
  } else if(p.location) {
    ctx.fillStyle='#111'; fitting(ctx,'Location: '+p.location,16,323,234,12,10);
  }
  ctx.fillStyle='#111';ctx.fillRect(0,332,LABEL_W,20);
  ctx.fillStyle='#fff';
  fitting(ctx,`PACKAGE: ${p.package || 'N/A'}`,13,346,220,12,10);
  ctx.textAlign='right'; fitting(ctx,`EC-${String(p.id||0).padStart(4,'0')}`,370,346,93,12,10); ctx.textAlign='left';
  // Monochrome thresholding means 1-bit-quality printing independent of printer dither settings.
  const img=ctx.getImageData(0,0,LABEL_W,LABEL_H);
  for(let i=0;i<img.data.length;i+=4){
    const lum=(img.data[i]*299+img.data[i+1]*587+img.data[i+2]*114)/1000;
    const c=lum<158?0:255;
    img.data[i]=img.data[i+1]=img.data[i+2]=c;img.data[i+3]=255;
  }
  ctx.putImageData(img,0,0);
}
function showLabels(ids) {
  labelIds=ids;
  const first=parts.find(p=>p.id===ids[0]);
  if(!first)return;
  $('label-part').textContent=ids.length===1?first.part_number:ids.length+' component labels';
  $('label-count').textContent=ids.length+' '+(ids.length===1?'part':'parts')+' selected';
  $('download-labels').textContent=ids.length===1?'↓ Download PNG':'↓ Download '+ids.length+' PNGs (ZIP)';
  $('print-labels').textContent=ids.length===1?'Print label':'Print '+ids.length+' labels';
  renderLabel(first);$('label-overlay').classList.remove('hidden');
}
function fileName(p) {return (p.part_number||'component').replace(/[^\w-]/g,'_').slice(0,80)+'_EC-'+p.id+'.png';}
function canvasPng(canvas) {return new Promise(resolve=>canvas.toBlob(resolve,'image/png'));}
function downloadBlob(blob,name) {
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
}
const encoder=new TextEncoder();
const crc32=(u8)=>{
  let c=0xffffffff;
  for(const b of u8){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}
  return(c^0xffffffff)>>>0;
};
function zipFiles(files) {
  // Minimal standards-compliant uncompressed ZIP; browsers need no external JS library.
  const bytes=[],central=[];let offset=0;
  function add(arr){bytes.push(arr);offset+=arr.length;}
  function header(size){return new DataView(new ArrayBuffer(size));}
  for(const f of files){
    const name=encoder.encode(f.name),data=f.data,crc=crc32(data),here=offset;
    const h=header(30);h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);
    h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,name.length,true);
    add(new Uint8Array(h.buffer));add(name);add(data);
    const c=header(46);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);
    c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);
    c.setUint16(28,name.length,true);c.setUint32(42,here,true);
    central.push(new Uint8Array(c.buffer),name);
  }
  const centralAt=offset;for(const p of central)add(p);
  const centralSize=offset-centralAt,e=header(22);e.setUint32(0,0x06054b50,true);
  e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);
  e.setUint32(12,centralSize,true);e.setUint32(16,centralAt,true);add(new Uint8Array(e.buffer));
  return new Blob(bytes,{type:'application/zip'});
}

function bluetoothAvailable() {
  return Boolean(window.isSecureContext && navigator.bluetooth && window.ElectroCatMXW01);
}
function setPrinterState(state, message) {
  const node=$('printer-state');
  node.className='printer-state'+(state==='connected'?' connected':state==='error'?' error':'');
  node.textContent=message || ({connecting:'Connecting…',connected:'Connected',error:'Needs attention',disconnected:'Not connected'}[state] || state);
  setPrinterControls();
}
function setPrinterControls() {
  const available=bluetoothAvailable(), connected=Boolean(printer?.connected);
  $('connect-printer').disabled=!available||printing;
  $('connect-printer').classList.toggle('hidden',connected);
  $('disconnect-printer').classList.toggle('hidden',!connected);
  $('disconnect-printer').disabled=printing;
  $('print-intensity').disabled=printing;
  $('print-labels').disabled=!connected||printing||!labelIds.length;
  $('cancel-print').classList.toggle('hidden',!printing||labelIds.length<2);
}
function initPrinterControls() {
  let intensity=93;
  try {
    const saved=localStorage.getItem('electrocat-mxw01-intensity');
    if(saved!==null&&Number.isFinite(Number(saved)))intensity=Number(saved);
  } catch (_) {}
  intensity=Math.max(0,Math.min(192,intensity));
  $('print-intensity').value=String(intensity);
  $('intensity-value').textContent=intensity+' / 192';
  if (!window.isSecureContext) {
    $('bluetooth-help').textContent='Web Bluetooth requires localhost or HTTPS. PNG download still works.';
    setPrinterState('error','Insecure page');
  } else if (!navigator.bluetooth) {
    $('bluetooth-help').textContent='Web Bluetooth is not available here. Use Chrome or Edge, or download PNG files.';
    setPrinterState('error','Unavailable');
  } else {
    setPrinterState('disconnected');
  }
}
function getPrinter() {
  if (!printer) printer=new window.ElectroCatMXW01.MXW01Printer({
    onState:event=>setPrinterState(event.state,event.name)
  });
  return printer;
}
async function connectPrinter() {
  setPrinterState('connecting');
  try {
    const name=await getPrinter().connect();
    setPrinterState('connected',name);
    toast('MXW01 connected.');
  } catch (err) {
    if (err.name==='NotFoundError') setPrinterState('disconnected');
    else setPrinterState('error','Connection failed');
    toast(err.name==='NotFoundError'?'Printer selection cancelled.':'Could not connect: '+err.message);
  }
}
function disconnectPrinter() {
  printer?.disconnect();
  setPrinterState('disconnected');
}
async function printLabelsDirect() {
  if (!printer?.connected) return toast('Connect the MXW01 first.');
  printing=true;stopBatchRequested=false;setPrinterControls();
  $('cancel-print').disabled=false;$('cancel-print').textContent='Stop after current label';
  $('print-progress').classList.remove('hidden');
  $('print-progress-bar').value=0;
  try {
    const total=labelIds.length, intensity=Number($('print-intensity').value);
    for(let index=0;index<total;index++){
      if(stopBatchRequested)break;
      const part=parts.find(p=>p.id===labelIds[index]);
      if(!part)continue;
      $('print-progress-text').textContent=`Printing ${index+1}/${total}: ${part.part_number}`;
      const canvas=document.createElement('canvas');renderLabel(part,canvas);
      await printer.printCanvas(canvas,{intensity,onProgress:value=>{
        $('print-progress-bar').value=((index+value/100)/total)*100;
      }});
      $('print-progress-bar').value=((index+1)/total)*100;
      if(index<total-1&&!stopBatchRequested)await new Promise(resolve=>setTimeout(resolve,1500));
    }
    const completed=stopBatchRequested?'Batch stopped.':'Printed '+labelIds.length+(labelIds.length===1?' label.':' labels.');
    $('print-progress-text').textContent=completed;
    toast(completed);
  } catch(err) {
    setPrinterState('error','Print failed');
    $('print-progress-text').textContent='Print failed — PNG fallback is still available.';
    toast('MXW01 print failed: '+err.message);
  } finally {
    printing=false;stopBatchRequested=false;
    $('cancel-print').disabled=false;$('cancel-print').textContent='Stop after current label';
    setPrinterControls();
  }
}
async function downloadLabels() {
  const btn=$('download-labels');btn.disabled=true;btn.textContent='Preparing…';
  try {
    const files=[];
    for(const id of labelIds){
      const part=parts.find(p=>p.id===id);
      const c=document.createElement('canvas');renderLabel(part,c);
      files.push({name:fileName(part),data:new Uint8Array(await (await canvasPng(c)).arrayBuffer())});
    }
    if(files.length===1)downloadBlob(new Blob([files[0].data],{type:'image/png'}),files[0].name);
    else downloadBlob(zipFiles(files),'ElectroCat_labels.zip');
    toast('Ready for the Cat Printer Image Mode.');
  } catch(err) {toast('Label generation failed: '+err.message);}
  finally{btn.disabled=false;btn.textContent=labelIds.length===1?'↓ Download PNG':'↓ Download '+labelIds.length+' PNGs (ZIP)';}
}

document.addEventListener('click',event=>{
  const closeButton=event.target.closest('[data-close]');if(closeButton)close(closeButton.dataset.close);
  const tr=event.target.closest('tr[data-id]');
  if(tr && !event.target.matches('input[type=checkbox]'))openEditor(Number(tr.dataset.id));
  if(event.target.matches('.row-check')&&tr){
    const id=Number(tr.dataset.id);event.target.checked?selection.add(id):selection.delete(id);render();
  }
});
$('search').addEventListener('input',render);
$('filter-category').addEventListener('change',render);
$('check-all').addEventListener('change',e=>{for(const p of filtered())e.target.checked?selection.add(p.id):selection.delete(p.id);render();});
for(const id of ['add-entry','nav-add'])$(id).addEventListener('click',()=>openEditor());
for(const id of ['download-xlsx','nav-backup'])$(id).addEventListener('click',()=>location.href='/api/export.xlsx');
$('autofill-btn').addEventListener('click',autofillForm);
$('save-entry').addEventListener('click',saveEntry);
$('delete-entry').addEventListener('click',deleteEntry);
$('add-attribute').addEventListener('click',()=>addDynamic('attribute-rows',{},'attribute'));
$('add-pin').addEventListener('click',()=>addDynamic('pin-rows',{},'pin'));
$('f-category').addEventListener('change',()=>{
  if(readDynamic('attribute-rows').some(a=>a.value))return;
  $('attribute-rows').innerHTML='';
  (templates[$('f-category').value]||[]).forEach(label=>addDynamic('attribute-rows',{label},'attribute'));
});
$('print-selected').addEventListener('click',()=>selection.size?showLabels([...selection]):toast('Select one or more entries first.'));
$('nav-print').addEventListener('click',()=>selection.size?showLabels([...selection]):toast('Select one or more entries first.'));
$('connect-printer').addEventListener('click',connectPrinter);
$('disconnect-printer').addEventListener('click',disconnectPrinter);
$('print-labels').addEventListener('click',printLabelsDirect);
$('cancel-print').addEventListener('click',()=>{
  stopBatchRequested=true;$('cancel-print').disabled=true;$('cancel-print').textContent='Stopping after current label…';
});
$('print-intensity').addEventListener('input',event=>{
  $('intensity-value').textContent=event.target.value+' / 192';
  try {localStorage.setItem('electrocat-mxw01-intensity',event.target.value);} catch (_) {}
});
$('download-labels').addEventListener('click',downloadLabels);
document.addEventListener('keydown',e=>{if(e.key==='Escape'){close('editor');close('label');}});
initPrinterControls();
load();
