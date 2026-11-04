const BASE = 'http://127.0.0.1:8765';

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'electrocat-add', title: 'Add to my parts list (ElectroCat)',
      contexts: ['selection', 'page', 'link']
    });
  });
});

async function capture(name, url, title='', captured=null) {
  const response = await fetch(BASE + '/api/capture', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({name, url, title, captured, use_ai:true})
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not add the component');
  return data.entry.id;
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'electrocat-add') return;
  const url = info.linkUrl || info.pageUrl || tab?.url || '';
  let name = info.selectionText?.trim() || '';
  let captured = null;
  if (tab?.id) {
    try {
      await chrome.scripting.executeScript({target:{tabId:tab.id},files:['extractor.js']});
      const results = await chrome.scripting.executeScript({target:{tabId:tab.id},
        func: href => href ? window.ElectroCatExtractor.extractLink(href) : window.ElectroCatExtractor.extractPage(),
        args:[info.linkUrl || '']});
      captured = results?.[0]?.result || null;
      if (!name && captured?.title) name = captured.title;
    } catch(_) { /* Some browser-owned pages disallow content scripts. */ }
  }
  if (!name && info.linkUrl && tab?.id) {
    try {
      const results = await chrome.scripting.executeScript({target:{tabId:tab.id},
        func: href => [...document.querySelectorAll('a[href]')]
          .find(a=>a.href===href)?.textContent?.trim().slice(0,160) || '',
        args:[info.linkUrl]});
      name = results?.[0]?.result || '';
    } catch(_) { /* Some sites disallow content scripts. */ }
  }
  name = name || tab?.title || '';
  try {
    const id = await capture(name, url, tab?.title || '', captured);
    await chrome.tabs.create({url: BASE + '/?edit=' + id});
  } catch(err) {
    await chrome.tabs.create({url: BASE + '/'});
    console.warn('ElectroCat: Start start_electrocat.bat before capturing a part.', err);
  }
});
