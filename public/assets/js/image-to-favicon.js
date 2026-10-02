(() => {
  'use strict';

  const q = (s) => document.querySelector(s);
  const toast = q('#toast');
  const el = {
    input: q('#imageFileInput'),
    zone: q('#imageUploadZone'),
    fileName: q('#imageFileName'),
    fileInfo: q('#imageFileInfo'),
    fit: q('#imageFitMode'),
    shape: q('#imageShape'),
    padding: q('#imagePadding'),
    paddingValue: q('#imagePaddingValue'),
    transparent: q('#imageTransparent'),
    bgColor: q('#imageBgColor'),
    bgHex: q('#imageBgColorHex'),
    preview: q('#imagePreviewLarge'),
    previewSmall: q('#imagePreviewSmall'),
    previewTab: q('#imagePreviewTab'),
    empty: q('#imagePreviewEmpty'),
    downloadPack: q('#downloadImagePackButton'),
    downloadIco: q('#downloadImageIcoButton'),
    downloadPng: q('#downloadImagePngButton')
  };

  if (!el.input) return;

  const state = { image: null, file: null };

  el.input.addEventListener('change', () => {
    if (el.input.files && el.input.files[0]) loadFile(el.input.files[0]);
  });

  ['dragenter','dragover'].forEach((name) => {
    el.zone.addEventListener(name, (event) => {
      event.preventDefault();
      el.zone.classList.add('dragging');
    });
  });
  ['dragleave','drop'].forEach((name) => {
    el.zone.addEventListener(name, (event) => {
      event.preventDefault();
      el.zone.classList.remove('dragging');
    });
  });
  el.zone.addEventListener('drop', (event) => {
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) loadFile(file);
  });

  [el.fit, el.shape, el.padding, el.transparent, el.bgColor].forEach((node) => {
    node.addEventListener(node.type === 'range' || node.type === 'color' ? 'input' : 'change', render);
  });
  bindColorPair(el.bgColor, el.bgHex);

  el.downloadPng.addEventListener('click', async () => {
    if (!ensureImage()) return;
    downloadBlob(await createPngBlob(512), 'favicon-512x512.png');
    notify('已產生 512 × 512 PNG');
  });

  el.downloadIco.addEventListener('click', async () => {
    if (!ensureImage()) return;
    downloadBlob(await createIcoBlob([16,32,48]), 'favicon.ico');
    notify('已產生 favicon.ico');
  });

  el.downloadPack.addEventListener('click', async () => {
    if (!ensureImage()) return;
    el.downloadPack.disabled = true;
    const oldText = el.downloadPack.textContent;
    el.downloadPack.textContent = '正在建立圖示包…';
    try {
      const files = [];
      for (const size of [16,32,48,180,192,512]) {
        const blob = await createPngBlob(size);
        const name = size === 180 ? 'apple-touch-icon.png' :
          size === 192 ? 'android-chrome-192x192.png' :
          size === 512 ? 'android-chrome-512x512.png' :
          `favicon-${size}x${size}.png`;
        files.push({ name, data: new Uint8Array(await blob.arrayBuffer()) });
      }
      const ico = await createIcoBlob([16,32,48]);
      files.push({ name:'favicon.ico', data:new Uint8Array(await ico.arrayBuffer()) });
      const bg = el.transparent.checked ? '#ffffff' : (normalizeHex(el.bgHex.value) || '#ffffff');
      const manifest = {
        name:'',
        short_name:'',
        icons:[
          {src:'/android-chrome-192x192.png',sizes:'192x192',type:'image/png'},
          {src:'/android-chrome-512x512.png',sizes:'512x512',type:'image/png'}
        ],
        theme_color:bg,
        background_color:bg,
        display:'standalone'
      };
      files.push({name:'site.webmanifest',data:encodeUtf8(JSON.stringify(manifest,null,2))});
      files.push({name:'README.txt',data:encodeUtf8(packageReadme())});
      downloadBlob(createStoredZip(files),'favicon-image-package.zip');
      notify('圖片 Favicon 圖示包已產生');
    } catch (error) {
      console.error(error);
      notify('建立圖示包失敗，請再試一次');
    } finally {
      el.downloadPack.disabled = false;
      el.downloadPack.textContent = oldText;
    }
  });

  async function loadFile(file) {
    if (!/^image\/(png|jpeg)$/i.test(file.type)) {
      notify('請選擇 PNG、JPG 或 JPEG 圖片');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      notify('圖片請控制在 20 MB 以內');
      return;
    }

    const url = URL.createObjectURL(file);
    try {
      const image = await loadImage(url);
      state.image = image;
      state.file = file;
      el.fileName.textContent = file.name;
      el.fileInfo.textContent = `${image.naturalWidth} × ${image.naturalHeight} px · ${formatBytes(file.size)}`;
      el.empty.classList.add('hidden');
      el.preview.classList.remove('hidden');
      el.downloadPack.disabled = false;
      el.downloadIco.disabled = false;
      el.downloadPng.disabled = false;
      render();
      notify('圖片已載入，可以開始轉換');
    } catch (_) {
      notify('圖片讀取失敗');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function render() {
    el.paddingValue.textContent = `${el.padding.value}%`;
    el.bgColor.disabled = el.transparent.checked;
    el.bgHex.disabled = el.transparent.checked;
    if (!state.image) return;
    drawCanvas(el.preview,512);
    drawCanvas(el.previewSmall,64);
    drawCanvas(el.previewTab,32);
  }

  function drawCanvas(canvas,size) {
    canvas.width=size;
    canvas.height=size;
    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,size,size);

    const shape=el.shape.value;
    const bg=normalizeHex(el.bgHex.value) || el.bgColor.value || '#ffffff';
    const pad=Math.max(0,Math.min(30,Number(el.padding.value)||0))/100*size;

    ctx.save();
    if (!el.transparent.checked) {
      ctx.fillStyle=bg;
      drawShape(ctx,size,shape);
      ctx.fill();
    }
    drawShape(ctx,size,shape);
    ctx.clip();

    const iw=state.image.naturalWidth || 1;
    const ih=state.image.naturalHeight || 1;
    const box=Math.max(1,size-pad*2);
    const scale=el.fit.value==='cover' ? Math.max(box/iw,box/ih) : Math.min(box/iw,box/ih);
    const dw=iw*scale;
    const dh=ih*scale;
    const dx=(size-dw)/2;
    const dy=(size-dh)/2;
    ctx.drawImage(state.image,dx,dy,dw,dh);
    ctx.restore();
  }

  function drawShape(ctx,size,shape) {
    ctx.beginPath();
    if (shape==='circle') {
      ctx.arc(size/2,size/2,size/2,0,Math.PI*2);
      return;
    }
    const radius=shape==='square'?0:shape==='soft'?size*.28:size*.17;
    roundedRect(ctx,0,0,size,size,radius);
  }

  function roundedRect(ctx,x,y,w,h,radius) {
    const r=Math.min(radius,w/2,h/2);
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }

  function makeCanvas(size) {
    const canvas=document.createElement('canvas');
    drawCanvas(canvas,size);
    return canvas;
  }

  function createPngBlob(size) {
    return new Promise((resolve,reject)=>{
      makeCanvas(size).toBlob((blob)=>blob?resolve(blob):reject(new Error('PNG 產生失敗')),'image/png');
    });
  }

  async function createIcoBlob(sizes) {
    const images=[];
    for (const size of sizes) {
      const blob=await createPngBlob(size);
      images.push({size,bytes:new Uint8Array(await blob.arrayBuffer())});
    }
    const header=6+images.length*16;
    const total=header+images.reduce((sum,item)=>sum+item.bytes.length,0);
    const out=new Uint8Array(total);
    const view=new DataView(out.buffer);
    view.setUint16(0,0,true);
    view.setUint16(2,1,true);
    view.setUint16(4,images.length,true);
    let offset=header;
    images.forEach((item,index)=>{
      const base=6+index*16;
      out[base]=item.size>=256?0:item.size;
      out[base+1]=item.size>=256?0:item.size;
      out[base+2]=0; out[base+3]=0;
      view.setUint16(base+4,1,true);
      view.setUint16(base+6,32,true);
      view.setUint32(base+8,item.bytes.length,true);
      view.setUint32(base+12,offset,true);
      out.set(item.bytes,offset);
      offset+=item.bytes.length;
    });
    return new Blob([out],{type:'image/x-icon'});
  }

  function createStoredZip(files) {
    const localParts=[],centralParts=[];
    let offset=0;
    const dt=dosDateTime(new Date());
    files.forEach((file)=>{
      const name=encodeUtf8(file.name);
      const data=file.data instanceof Uint8Array?file.data:new Uint8Array(file.data);
      const crc=crc32(data);
      const local=new Uint8Array(30+name.length);
      const lv=new DataView(local.buffer);
      lv.setUint32(0,0x04034b50,true); lv.setUint16(4,20,true); lv.setUint16(6,0x0800,true);
      lv.setUint16(8,0,true); lv.setUint16(10,dt.time,true); lv.setUint16(12,dt.date,true);
      lv.setUint32(14,crc,true); lv.setUint32(18,data.length,true); lv.setUint32(22,data.length,true);
      lv.setUint16(26,name.length,true); lv.setUint16(28,0,true); local.set(name,30);
      localParts.push(local,data);

      const central=new Uint8Array(46+name.length);
      const cv=new DataView(central.buffer);
      cv.setUint32(0,0x02014b50,true); cv.setUint16(4,20,true); cv.setUint16(6,20,true); cv.setUint16(8,0x0800,true);
      cv.setUint16(10,0,true); cv.setUint16(12,dt.time,true); cv.setUint16(14,dt.date,true);
      cv.setUint32(16,crc,true); cv.setUint32(20,data.length,true); cv.setUint32(24,data.length,true);
      cv.setUint16(28,name.length,true); cv.setUint16(30,0,true); cv.setUint16(32,0,true);
      cv.setUint16(34,0,true); cv.setUint16(36,0,true); cv.setUint32(38,0,true); cv.setUint32(42,offset,true);
      central.set(name,46); centralParts.push(central);
      offset+=local.length+data.length;
    });

    const centralSize=centralParts.reduce((sum,p)=>sum+p.length,0);
    const end=new Uint8Array(22);
    const ev=new DataView(end.buffer);
    ev.setUint32(0,0x06054b50,true); ev.setUint16(4,0,true); ev.setUint16(6,0,true);
    ev.setUint16(8,files.length,true); ev.setUint16(10,files.length,true);
    ev.setUint32(12,centralSize,true); ev.setUint32(16,offset,true); ev.setUint16(20,0,true);
    return new Blob([...localParts,...centralParts,end],{type:'application/zip'});
  }

  function dosDateTime(d) {
    const year=Math.max(1980,d.getFullYear());
    return {
      date:((year-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate(),
      time:(d.getHours()<<11)|(d.getMinutes()<<5)|Math.floor(d.getSeconds()/2)
    };
  }

  const crcTable=(()=>{
    const table=new Uint32Array(256);
    for(let n=0;n<256;n++){
      let c=n;
      for(let k=0;k<8;k++) c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
      table[n]=c>>>0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc=0xffffffff;
    for(let i=0;i<bytes.length;i++) crc=crcTable[(crc^bytes[i])&0xff]^(crc>>>8);
    return (crc^0xffffffff)>>>0;
  }

  function bindColorPair(picker,text) {
    picker.addEventListener('input',()=>{text.value=picker.value.toLowerCase();render();});
    text.addEventListener('input',()=>{const v=normalizeHex(text.value);if(v){picker.value=v;render();}});
    text.addEventListener('blur',()=>{const v=normalizeHex(text.value)||picker.value;text.value=v;picker.value=v;render();});
  }

  function normalizeHex(value) {
    const raw=String(value||'').trim();
    const short=raw.match(/^#([0-9a-f]{3})$/i);
    if(short) return '#'+short[1].split('').map(c=>c+c).join('').toLowerCase();
    const full=raw.match(/^#([0-9a-f]{6})$/i);
    return full?'#'+full[1].toLowerCase():'';
  }

  function loadImage(src) {
    return new Promise((resolve,reject)=>{
      const img=new Image();
      img.onload=()=>resolve(img);
      img.onerror=reject;
      img.src=src;
    });
  }

  function ensureImage() {
    if(state.image) return true;
    notify('請先選擇 PNG 或 JPG 圖片');
    return false;
  }

  function encodeUtf8(text) { return new TextEncoder().encode(String(text)); }

  function packageReadme() {
    return `圖片轉 Favicon 網站圖示包

包含：
- favicon.ico（16 / 32 / 48）
- favicon-16x16.png
- favicon-32x32.png
- favicon-48x48.png
- apple-touch-icon.png（180x180）
- android-chrome-192x192.png
- android-chrome-512x512.png
- site.webmanifest

請將檔案放到網站根目錄，再加入網站提供的 Favicon HTML 標籤。
原始圖片只在本機瀏覽器處理，不會由本工具上傳。
`;
  }

  function formatBytes(bytes) {
    if(bytes<1024) return bytes+' B';
    if(bytes<1024*1024) return (bytes/1024).toFixed(1)+' KB';
    return (bytes/(1024*1024)).toFixed(1)+' MB';
  }

  function downloadBlob(blob,filename) {
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  }

  function notify(message) {
    if(!toast) return;
    toast.textContent=message;
    toast.classList.add('show');
    clearTimeout(notify.timer);
    notify.timer=setTimeout(()=>toast.classList.remove('show'),1800);
  }
})();
