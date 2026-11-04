const BASE='http://127.0.0.1:8765';
let currentTab=null,currentCapture=null,listingItems=[];
const node=id=>document.getElementById(id);

function activeTab(){return new Promise(resolve=>chrome.tabs.query({active:true,currentWindow:true},tabs=>resolve(tabs[0]||null)));}
function permissionPattern(url){
  try{const host=new URL(url).hostname.toLowerCase();if(host==='aliexpress.com'||host.endsWith('.aliexpress.com'))return 'https://*.aliexpress.com/*';if(host==='allegro.pl'||host.endsWith('.allegro.pl'))return 'https://*.allegro.pl/*';}catch(_){}
  return null;
}
function requestOrigins(origins){return new Promise(resolve=>chrome.permissions.request({origins},allowed=>resolve(Boolean(allowed&&!chrome.runtime.lastError))));}
function createTab(options){return new Promise((resolve,reject)=>chrome.tabs.create(options,tab=>chrome.runtime.lastError?reject(new Error(chrome.runtime.lastError.message)):resolve(tab)));}
function removeTab(id){return new Promise(resolve=>chrome.tabs.remove(id,()=>resolve()));}
function waitForLoad(tabId,timeoutMs=15000){return new Promise((resolve,reject)=>{
  let timer;const done=(error)=>{clearTimeout(timer);chrome.tabs.onUpdated.removeListener(listener);error?reject(error):resolve();};
  const listener=(id,change)=>{if(id===tabId&&change.status==='complete')done();};
  chrome.tabs.onUpdated.addListener(listener);timer=setTimeout(()=>done(new Error('Listing load timed out')),timeoutMs);
  chrome.tabs.get(tabId,tab=>{if(chrome.runtime.lastError)done(new Error(chrome.runtime.lastError.message));else if(tab?.status==='complete')done();});
});}
async function extractor(tabId,method,args=[]){
  await chrome.scripting.executeScript({target:{tabId},files:['extractor.js']});
  const results=await chrome.scripting.executeScript({target:{tabId},
    func:(name,values)=>window.ElectroCatExtractor[name](...values),args:[method,args]});
  return results?.[0]?.result;
}
async function post(path,body){
  const response=await fetch(BASE+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Registration failed');return data;
}
function fail(err){node('message').textContent='ElectroCat is not available or this page cannot be read. Start the Windows app first. '+err.message;}
async function enrichSelected(items){
  const origins=[...new Set(items.map(item=>permissionPattern(item.url)).filter(Boolean))];
  if(!origins.length||!await requestOrigins(origins))return items;
  const enriched=[];
  for(let index=0;index<items.length;index++){
    const item=items[index],pattern=permissionPattern(item.url);
    if(!pattern){enriched.push(item);continue;}
    node('message').textContent=`Opening listing ${index+1}/${items.length} in the background…`;
    let tab;
    try{
      tab=await createTab({url:item.url,active:false});await waitForLoad(tab.id);
      await new Promise(resolve=>setTimeout(resolve,700));
      const detail=await extractor(tab.id,'extractPage'),captured={...item.captured};
      for(const key of ['title','description','manufacturer','sku','datasheet_url','page_text'])if(detail?.[key])captured[key]=detail[key];
      for(const key of ['attributes','pinout'])if(detail?.[key]?.length)captured[key]=detail[key];
      enriched.push({...item,name:detail?.sku||item.name,title:detail?.title||item.title,captured});
    }catch(_){enriched.push(item);}
    finally{if(tab?.id)await removeTab(tab.id);}
  }
  return enriched;
}

(async()=>{
  currentTab=await activeTab();
  node('name').value=currentTab?.title||'';
  node('url').value=(currentTab?.url||'').startsWith('http')?currentTab.url:'';
  try{if(currentTab?.id&&node('url').value)currentCapture=await extractor(currentTab.id,'extractPage');}catch(_){/* restricted browser page */}
})();

node('add').addEventListener('click',async()=>{
  const name=node('name').value.trim(),url=node('url').value.trim();
  if(!name&&!url){node('message').textContent='Enter a part name or product URL.';return;}
  node('message').textContent='Reading the visible listing and registering it…';
  try{
    const data=await post('/api/capture',{name,url,title:name,captured:currentCapture,use_ai:true});
    chrome.tabs.create({url:BASE+'/?edit='+data.entry.id});window.close();
  }catch(err){fail(err);}
});

node('scan').addEventListener('click',async()=>{
  node('message').textContent='Scanning product links currently visible on this page…';
  try{
    if(!currentTab?.id)throw new Error('No active tab');
    listingItems=await extractor(currentTab.id,'scanListings')||[];
    if(!listingItems.length){node('message').textContent='No product cards were found. Open an AliExpress or Allegro orders/listing page, scroll the products into view, and try again.';return;}
    node('listings').innerHTML=listingItems.map((item,index)=>`<label class="listing"><input type="checkbox" data-index="${index}" checked><span></span></label>`).join('');
    [...node('listings').querySelectorAll('.listing span')].forEach((span,index)=>span.textContent=listingItems[index].title);
    node('batch-count').textContent=listingItems.length+' found';node('batch').classList.remove('hidden');
    node('message').textContent='Uncheck anything you already own, then add the selected entries.';
  }catch(err){fail(err);}
});

node('add-selected').addEventListener('click',async()=>{
  let selected=[...node('listings').querySelectorAll('input:checked')].map(input=>listingItems[Number(input.dataset.index)]).filter(Boolean);
  if(!selected.length){node('message').textContent='Select at least one listing.';return;}
  node('add-selected').disabled=true;node('message').textContent=`Adding ${selected.length} entries and creating one Excel backup…`;
  try{
    selected=await enrichSelected(selected);
    node('message').textContent=`Registering ${selected.length} entries and creating one Excel backup…`;
    const data=await post('/api/capture/batch',{items:selected,use_ai:true});
    node('message').textContent=`Added ${data.entries.length} entries. Opening ElectroCat for review…`;
    chrome.tabs.create({url:BASE+'/?edit='+data.entries[0].id});window.close();
  }catch(err){fail(err);node('add-selected').disabled=false;}
});
