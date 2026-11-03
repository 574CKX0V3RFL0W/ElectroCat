// Optional headless dashboard QA. Requires Playwright only in the developer environment.
const {chromium}=require('playwright');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const ROOT=path.join(__dirname,'..');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'electrocat-ui-'));
const port=18876;
const server=spawn('python',['app.py','--port',String(port),'--data-dir',folder,'--no-browser'],
  {cwd:ROOT,stdio:['ignore','pipe','pipe']});
let browser;
const url=`http://127.0.0.1:${port}/`;
async function ready(){
  for(let i=0;i<60;i++){
    try{const r=await fetch(url+'api/health');if(r.ok)return;}catch(_){}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Server did not become ready');
}
async function main(){
  await ready();
  const installedBrowser=[
    process.env.PLAYWRIGHT_BROWSER_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ].find(candidate=>candidate&&fs.existsSync(candidate));
  browser=await chromium.launch({headless:true,args:['--no-sandbox'],
    ...(installedBrowser?{executablePath:installedBrowser}:{})});
  const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:900}});
  await page.addInitScript(()=>{
    const listeners=new Map(),commands=[];
    let imageCrc=0;
    const crc8=(bytes,initial=0)=>{
      let crc=initial;
      for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=crc&0x80?((crc<<1)^7)&255:(crc<<1)&255;}
      return crc;
    };
    const response=(command,payload)=>{
      const bytes=new Uint8Array(7+payload.length);
      bytes.set([0x22,0x21,command,0,payload.length,0]);bytes.set(payload,6);
      queueMicrotask(()=>listeners.get('characteristicvaluechanged')?.({target:{value:new DataView(bytes.buffer)}}));
    };
    const notify={addEventListener:(name,callback)=>listeners.set(name,callback),startNotifications:async()=>notify};
    const control={writeValueWithoutResponse:async value=>{
      const bytes=Uint8Array.from(value),command=bytes[2];commands.push(command);
      if(command===0xa1)response(command,new Uint8Array(10));
      if(command===0xa9){imageCrc=0;response(command,Uint8Array.of(0));}
      if(command===0xad)response(0xaa,Uint8Array.of(0,imageCrc,imageCrc));
    }};
    const data={writeValueWithoutResponse:async value=>{imageCrc=crc8(Uint8Array.from(value),imageCrc);}};
    const chars={
      '0000ae01-0000-1000-8000-00805f9b34fb':control,
      '0000ae02-0000-1000-8000-00805f9b34fb':notify,
      '0000ae03-0000-1000-8000-00805f9b34fb':data
    };
    const device={name:'MXW01-MOCK',addEventListener:()=>{},gatt:{connected:false,
      connect:async function(){this.connected=true;return this;},disconnect(){this.connected=false;},
      getPrimaryService:async()=>({getCharacteristic:async uuid=>chars[uuid]})}};
    Object.defineProperty(navigator,'bluetooth',{configurable:true,value:{requestDevice:async()=>device}});
    window.__mxw01Commands=commands;
  });
  await page.goto(url);
  await page.locator('#rows tr[data-id]').first().waitFor();
  assert.equal(await page.locator('#total-count').textContent(),'1');
  assert.match(await page.locator('#rows tr').first().textContent(),/AO3400A/);
  await page.screenshot({path:path.join(folder,'dashboard.png')});
  await page.locator('#rows .row-check').first().check();
  await page.locator('#print-selected').click();
  assert.equal(await page.locator('#label-canvas').evaluate(el=>el.width),384);
  assert.equal(await page.locator('#label-canvas').evaluate(el=>el.height),352);
  assert.equal(await page.locator('#print-intensity').inputValue(),'93');
  assert.equal(await page.locator('#print-labels').textContent(),'Print label');
  assert(await page.locator('#connect-printer').isVisible(),'Direct-printer connection control must be visible');
  assert(await page.locator('#download-labels').isVisible(),'PNG fallback must remain visible');
  await page.locator('#label-overlay .label-modal').screenshot({path:path.join(folder,'label-modal.png')});
  const mono=await page.locator('#label-canvas').evaluate(el=>{
    const a=el.getContext('2d').getImageData(0,0,el.width,el.height).data;
    for(let i=0;i<a.length;i+=4)if(a[i]!==a[i+1]||a[i]!==a[i+2]||(a[i]!==0&&a[i]!==255))return false;
    return true;
  });
  assert(mono,'Label must be black/white only');
  await page.locator('#connect-printer').click();
  await page.locator('#printer-state').filter({hasText:'MXW01-MOCK'}).waitFor();
  await page.locator('#print-labels').click();
  await page.locator('#print-progress-text').filter({hasText:'Printed 1 label.'}).waitFor({timeout:15000});
  assert.deepEqual(await page.evaluate(()=>window.__mxw01Commands),[0xa2,0xa1,0xa9,0xad,0xa3]);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#download-labels').click()]);
  const pngPath=path.join(folder,'test.png');await download.saveAs(pngPath);
  const png=fs.readFileSync(pngPath);
  assert.equal(png.readUInt32BE(16),384);assert.equal(png.readUInt32BE(20),352);
  await page.locator('#label-overlay button[data-close=label]').click();
  await page.locator('#add-entry').click();
  await page.locator('#f-part_number').fill('TEST555');
  await page.locator('#f-category').selectOption('Capacitor');
  assert.equal(await page.locator('#attribute-rows .dynamic-row').count(),5);
  await page.locator('#attribute-rows .dynamic-row').first().locator('input[data-key=value]').fill('100 nF');
  await page.locator('#f-package').fill('0603');
  await page.locator('#f-quantity').fill('42');
  await page.locator('#f-location').fill('Drawer C4');
  await page.locator('#save-entry').click();
  await page.locator('#editor-overlay').waitFor({state:'hidden'});
  assert.equal(await page.locator('#total-count').textContent(),'2');
  assert.match(await page.locator('#rows tr').first().textContent(),/TEST555/);
  assert.match(await page.locator('#rows tr').first().textContent(),/Drawer C4/);
  const mainXlsx=path.join(folder,'ElectroCat_inventory.xlsx');
  assert(fs.existsSync(mainXlsx));
  assert.equal(fs.readdirSync(path.join(folder,'backups')).filter(n=>n.endsWith('.xlsx')).length,2);
  await page.locator('#check-all').check();
  await page.locator('#print-selected').click();
  assert.equal(await page.locator('#print-labels').textContent(),'Print 2 labels');
  const [batch]=await Promise.all([page.waitForEvent('download'),page.locator('#download-labels').click()]);
  assert.match(batch.suggestedFilename(),/\.zip$/);
  await batch.saveAs(path.join(folder,'batch.zip'));
  console.log('PASS: UI loads; mocked direct MXW01 print completes; edit/autosave works; PNG is exactly 384×352 px and monochrome; multi-label ZIP downloads.');
  console.log('QA screenshot:',path.join(folder,'dashboard.png'));
  console.log('Label screenshot:',path.join(folder,'label-modal.png'));
}
main().catch(err=>{console.error(err);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  server.kill();
  // The temporary QA folder is left available for inspecting its screenshot.
});
