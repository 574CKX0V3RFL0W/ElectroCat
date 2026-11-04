(function(root){
  'use strict';
  const clean=(value,limit=1200)=>String(value||'').replace(/\s+/g,' ').trim().slice(0,limit);
  const absolute=(href,base)=>{try{return new URL(href,base).href.split('#')[0];}catch(_){return '';}};
  function productJson(doc){
    const found=[];
    for(const script of doc.querySelectorAll('script[type="application/ld+json"]')){
      try{
        const value=JSON.parse(script.textContent||'null'), queue=Array.isArray(value)?[...value]:[value];
        while(queue.length){
          const node=queue.shift();if(!node||typeof node!=='object')continue;
          if(Array.isArray(node)){queue.push(...node);continue;}
          const kind=Array.isArray(node['@type'])?node['@type']:[node['@type']];
          if(kind.includes('Product'))found.push(node);
          if(Array.isArray(node['@graph']))queue.push(...node['@graph']);
        }
      }catch(_){/* malformed seller markup */}
    }
    return found[0]||{};
  }
  function visibleAttributes(doc,product){
    const rows=[],seen=new Set();
    const add=(label,value)=>{
      label=clean(label,75);value=clean(value,160);
      const key=label.toLowerCase();
      if(label&&value&&!seen.has(key)&&label!==value){seen.add(key);rows.push({label,value,note:'From visible listing; verify'});}
    };
    const props=Array.isArray(product.additionalProperty)?product.additionalProperty:[product.additionalProperty];
    for(const item of props)if(item&&typeof item==='object')add(item.name||item.propertyID,item.value);
    for(const tr of doc.querySelectorAll('table tr')){
      const cells=tr.querySelectorAll('th,td');if(cells.length>=2)add(cells[0].textContent,cells[1].textContent);
      if(rows.length>=30)break;
    }
    for(const dt of doc.querySelectorAll('dl dt')){
      const dd=dt.nextElementSibling;if(dd&&dd.tagName==='DD')add(dt.textContent,dd.textContent);
      if(rows.length>=30)break;
    }
    return rows.slice(0,30);
  }
  function visiblePinout(doc){
    const pins=[],seen=new Set();
    for(const table of doc.querySelectorAll('table')){
      const heading=clean(table.querySelector('thead')?.innerText||table.previousElementSibling?.textContent,200);
      if(!/pin|signal|terminal/i.test(heading))continue;
      for(const tr of table.querySelectorAll('tr')){
        const cells=[...tr.querySelectorAll('th,td')].map(cell=>clean(cell.textContent,160));
        if(cells.length<2||!/^[A-Z]?\d{1,3}$/i.test(cells[0])||seen.has(cells[0]))continue;
        seen.add(cells[0]);pins.push({number:cells[0],signal:cells[1],label:cells.slice(2).join(' — ')});
        if(pins.length>=32)return pins;
      }
    }
    return pins;
  }
  function makerName(value){return clean(value&&typeof value==='object'?value.name:value,200);}
  function extractPage(doc=document){
    const product=productJson(doc);
    const meta=name=>doc.querySelector(`meta[name="${name}"],meta[property="${name}"]`)?.content||'';
    const datasheet=[...doc.querySelectorAll('a[href]')].find(a=>/datasheet/i.test(a.textContent||a.href)&&/\.pdf(?:$|[?#])/i.test(a.href));
    return {
      title:clean(product.name||meta('og:title')||doc.title,250),
      description:clean(product.description||meta('description')||meta('og:description'),1200),
      manufacturer:makerName(product.brand||product.manufacturer),
      sku:clean(product.mpn||product.sku||meta('product:retailer_item_id'),120),
      attributes:visibleAttributes(doc,product),
      pinout:visiblePinout(doc),
      datasheet_url:datasheet?absolute(datasheet.href,doc.baseURI):'',
      page_text:clean(doc.body?.innerText||'',12000)
    };
  }
  function looksLikeProduct(url,anchor){
    const host=new URL(url).hostname.toLowerCase(),path=new URL(url).pathname;
    if(host.includes('aliexpress.')&&/\/item\/\d+\.html/i.test(path))return true;
    if(host.endsWith('allegro.pl')&&/\/oferta\//i.test(path))return true;
    const holder=anchor.closest('article,[class*="product" i],[class*="offer" i],[class*="item" i],[data-product-id],[data-item-id]');
    return Boolean(holder&&clean(anchor.textContent,200).length>=5);
  }
  function listingFromAnchor(anchor,doc){
    const url=absolute(anchor.getAttribute('href'),doc.baseURI);if(!url||!looksLikeProduct(url,anchor))return null;
    const card=anchor.closest('article,li,[class*="product" i],[class*="offer" i],[class*="item" i]')||anchor;
    const image=card.querySelector?.('img'),title=clean(anchor.getAttribute('title')||image?.alt||anchor.textContent,250);
    if(!title)return null;
    const cardText=clean(card.innerText||title,1000);
    return {name:title,title,url,captured:{title,description:cardText,page_text:cardText,attributes:[]}};
  }
  function scanListings(doc=document){
    const seen=new Set(),items=[];
    for(const anchor of doc.querySelectorAll('a[href]')){
      const item=listingFromAnchor(anchor,doc);if(!item||seen.has(item.url))continue;
      seen.add(item.url);items.push(item);if(items.length>=50)break;
    }
    return items;
  }
  function extractLink(href,doc=document){
    const target=absolute(href,doc.baseURI);
    const anchor=[...doc.querySelectorAll('a[href]')].find(a=>absolute(a.getAttribute('href'),doc.baseURI)===target);
    return anchor?listingFromAnchor(anchor,doc):null;
  }
  const api={clean,extractPage,scanListings,extractLink};
  root.ElectroCatExtractor=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
