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
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:900}});
  await page.goto(url);
  await page.locator('#rows tr[data-id]').first().waitFor();
  assert.equal(await page.locator('#total-count').textContent(),'1');
  assert.match(await page.locator('#rows tr').first().textContent(),/AO3400A/);
  await page.screenshot({path:path.join(folder,'dashboard.png')});
  await page.locator('#rows .row-check').first().check();
  await page.locator('#print-selected').click();
  assert.equal(await page.locator('#label-canvas').evaluate(el=>el.width),384);
  assert.equal(await page.locator('#label-canvas').evaluate(el=>el.height),352);
  const mono=await page.locator('#label-canvas').evaluate(el=>{
    const a=el.getContext('2d').getImageData(0,0,el.width,el.height).data;
    for(let i=0;i<a.length;i+=4)if(a[i]!==a[i+1]||a[i]!==a[i+2]||(a[i]!==0&&a[i]!==255))return false;
    return true;
  });
  assert(mono,'Label must be black/white only');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#download-labels').click()]);
  const pngPath=path.join(folder,'test.png');await download.saveAs(pngPath);
  const png=fs.readFileSync(pngPath);
  assert.equal(png.readUInt32BE(16),384);assert.equal(png.readUInt32BE(20),352);
  await page.locator('#label-overlay [data-close=label]').first().click();
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
  const [batch]=await Promise.all([page.waitForEvent('download'),page.locator('#download-labels').click()]);
  assert.match(batch.suggestedFilename(),/\.zip$/);
  await batch.saveAs(path.join(folder,'batch.zip'));
  console.log('PASS: UI loads; edit/autosave works; PNG is exactly 384×352 px and monochrome; multi-label ZIP downloads.');
  console.log('QA screenshot:',path.join(folder,'dashboard.png'));
}
main().catch(err=>{console.error(err);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  server.kill();
  // The temporary QA folder is left available for inspecting its screenshot.
});
