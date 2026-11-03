const BASE='http://127.0.0.1:8765';
chrome.tabs.query({active:true,currentWindow:true},tabs=>{
  const tab=tabs[0]||{};
  document.getElementById('name').value=tab.title||'';
  document.getElementById('url').value=(tab.url||'').startsWith('http')?tab.url:'';
});
document.getElementById('add').addEventListener('click',async()=>{
  const name=document.getElementById('name').value.trim();
  const url=document.getElementById('url').value.trim();
  const status=document.getElementById('message');
  if(!name&&!url){status.textContent='Enter a part name or product URL.';return;}
  status.textContent='Registering…';
  try{
    const response=await fetch(BASE+'/api/capture',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name,url,title:name,use_ai:true})});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Registration failed');
    chrome.tabs.create({url:BASE+'/?edit='+data.entry.id});
    window.close();
  }catch(err){status.textContent='ElectroCat is not available. Start the Windows app first. '+err.message;}
});
