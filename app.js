import { init, geoToCell, DifpClient } from './difp-browser.js';

// ─── Product catalog (25 items) ───────────────────────────────────────────
const PRODUCTS = [
  {id:1, name:'Ail',           img:'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Garlic_bulb.jpg/200px-Garlic_bulb.jpg'},
  {id:2, name:'Artichaut',     img:'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Artichoke_1.jpg/200px-Artichoke_1.jpg'},
  {id:3, name:'Asperges',      img:'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Asparagus_officinalis_0.02.jpg/200px-Asparagus_officinalis_0.02.jpg'},
  {id:4, name:'Betterave',     img:'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Beetroot_close_up.jpg/200px-Beetroot_close_up.jpg'},
  {id:5, name:'Cardon',        img:'https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Cynara_cardunculus_cultivated.jpg/200px-Cynara_cardunculus_cultivated.jpg'},
  {id:6, name:'Carotte',       img:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Stubs_0001.jpg/200px-Stubs_0001.jpg'},
  {id:7, name:'Chou-Fleur',    img:'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/WhiteCauliflower.jpg/200px-WhiteCauliflower.jpg'},
  {id:8, name:'Chou',          img:'https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Brassica_oleracea_2.jpg/200px-Brassica_oleracea_2.jpg'},
  {id:9, name:'Concombre',     img:'https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Cucumbers_-_whole_and_slice.jpg/200px-Cucumbers_-_whole_and_slice.jpg'},
  {id:10,name:'Courgette',     img:'https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Courgettes.jpg/200px-Courgettes.jpg'},
  {id:11,name:'Datte',         img:'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Date_palm_fruits.jpg/200px-Date_palm_fruits.jpg'},
  {id:12,name:'Kiwi',          img:'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Kiwifruit_cross_section.jpg/200px-Kiwifruit_cross_section.jpg'},
  {id:13,name:'Pastèque',      img:'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Watermelon_seedless_2009_16x9.jpg/200px-Watermelon_seedless_2009_16x9.jpg'},
  {id:14,name:'Pomme',         img:'https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Red_Apple.jpg/200px-Red_Apple.jpg'},
  {id:15,name:'Prune jaune',   img:'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Yellow_plum.jpg/200px-Yellow_plum.jpg'},
  {id:16,name:'Prune rouge',   img:'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Prunus_domestica-Mirabelle.jpg/200px-Prunus_domestica-Mirabelle.jpg'},
  {id:17,name:'Raisin rouge',  img:'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Grape_vines.jpg/200px-Grape_vines.jpg'},
  {id:18,name:'Orange',        img:'https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Oranges_and_orange_juice.jpg/200px-Oranges_and_orange_juice.jpg'},
  {id:19,name:'Tomate',        img:'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Tomato_je.jpg/200px-Tomato_je.jpg'},
  {id:20,name:'Oignon',        img:'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Onions.jpg/200px-Onions.jpg'},
  {id:21,name:'P. de terre',   img:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Patates.jpg/200px-Patates.jpg'},
  {id:22,name:'Haricot vert',  img:'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/Phaseolus_vulgaris.jpg/200px-Phaseolus_vulgaris.jpg'},
  {id:23,name:'Épinard',       img:'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Spinach_in_a_bowl.jpg/200px-Spinach_in_a_bowl.jpg'},
  {id:24,name:'Laitue',        img:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Lactuca_sativa.jpg/200px-Lactuca_sativa.jpg'},
  {id:25,name:'Citron',        img:'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Image_created_with_a_mobile_phone.png/200px-Image_created_with_a_mobile_phone.png'},
];

const TYPE_LABELS = {s:'Store',f:'Farmer',r:'Restaurant',fa:'Factory',w:'Wholesale',u:'User',sp:'Seed',t:'Transport',d:'Delivery',a:'Admin'};
const TYPE_EMOJI  = {s:'🏪',f:'🌾',r:'🍽️',fa:'🏭',w:'📦',u:'👤',sp:'🌱',t:'🚛',d:'🚚',a:'⚙️'};
const FALLBACK_IMG = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23f3f4f6"/><text y="62" x="50" text-anchor="middle" font-size="42">🥬</text></svg>`;

// ─── App state ────────────────────────────────────────────────────────────
let client = null;
let myData = {};                   // name, phone, lat, lng, hours, type, cellId, pubkey
let myInventory = {};              // productId → {price (DA float), available}
let myAsk     = new Set();
let myDonate  = new Set();
let currentModal = null;           // {productId, mode:'l'|'a'|'d'}

// ─── DOM refs ─────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const joinScreen   = $('joinScreen');
const mainApp      = $('mainApp');

// ─── Helpers ──────────────────────────────────────────────────────────────
function toast(msg, type='') {
  const wrap = $('toastWrap');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => { el.style.animation='toastOut 0.2s forwards'; setTimeout(()=>el.remove(),220); }, 2800);
}

function setStatus(s) {
  $('statusDot').className = 'status-dot ' + s;
  $('statusText').textContent = s==='connected'?'Connected':s==='connecting'?'Connecting…':'Offline';
}

function showPublish(eventId, msg) {
  const el = $('publishStatus');
  el.className = 'publish-status ok';
  el.style.display = 'flex';
  el.innerHTML = `✓ ${msg}: <span class="mono">${(eventId||'').slice(0,24)}…</span>`;
}

function closeModal(id) {
  $(id).classList.remove('show');
}

function openModal(id) {
  $(id).classList.add('show');
}

function toggleSwitch(id) {
  $(id).classList.toggle('on');
}

function avatarUrl(cT, aI) {
  const type = cT || 's';
  const id = aI || 1;
  return `/npm/assets/avatars/${type}/${id}.webp`;
}

// Global avatar error handler (using capture phase because error events don't bubble)
document.addEventListener('error', e => {
  const img = e.target;
  if (!img || img.tagName !== 'IMG' || !img.dataset.type) return;

  const type = img.dataset.type;
  const id   = img.dataset.id || 1;
  const cur  = img.src || '';

  if (cur.includes('/npm/assets')) {
    // Fallback 1: unpkg CDN
    img.src = `https://unpkg.com/@djowda/difp/assets/avatars/${type}/${id}.webp`;
  } else if (cur.includes('unpkg.com')) {
    // Fallback 2: inline SVG emoji
    const emoji = TYPE_EMOJI[type] || '🏪';
    img.src = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23f3f4f6" width="100" height="100"/><text y="62" x="50" text-anchor="middle" font-size="42">${encodeURIComponent(emoji)}</text></svg>`;
  }
}, true);

// ─── JOIN ─────────────────────────────────────────────────────────────────
async function doJoin() {
  const name   = $('joinName').value.trim();
  const phone  = $('joinPhone').value.trim();
  const coords = $('joinCoords').value.trim();
  const hours  = $('joinHours').value.trim() || '08:00_20:00';
  const type   = document.querySelector('.type-btn.selected')?.dataset.type || 's';

  if (!name) { toast('Enter a store name', 'err'); return; }

  let lat, lng;
  if (coords) {
    const parts = coords.split(',').map(s => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      [lat, lng] = parts;
    } else { toast('Invalid coordinates — use: 35.69, -0.64', 'err'); return; }
  } else {
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, {timeout:6000}));
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
      toast('Using GPS location');
    } catch { toast('Enter coordinates or allow location access', 'err'); return; }
  }

  const btn = $('joinBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Connecting to Nostr…';
  setStatus('connecting');

  try {
    client = await init({ type, debug: false });

    const result = await client.registerPresence({
      name, phone: phone || undefined,
      lat, lng,
      workTime: hours,
      status: true,
    });

    myData = {
      name, phone, lat, lng, hours, type,
      cellId: result.cellId,
      pubkey: client.status().pubkey,
      // try to pick the avatar id from the client component if available
      avatarId: (client && client.component && client.component.aI) ? client.component.aI : 1,
    };

    setStatus('connected');
    joinScreen.style.display = 'none';
    mainApp.style.display    = 'block';

    updateProfile();
    renderAllGrids();
    showPublish(result.eventId, 'Joined DIFP network');
    toast('✅ Connected to Nostr relay!', 'ok');

  } catch (e) {
    console.error('[doJoin]', e);
    toast('Failed: ' + e.message, 'err');
    btn.disabled = false;
    btn.textContent = '🔗 Connect & Join Network';
    setStatus('offline');
  }
}

// ─── PROFILE ──────────────────────────────────────────────────────────────
function updateProfile() {
  $('myName').textContent  = myData.name || '—';
  $('myPhone').textContent = '📞 ' + (myData.phone || '—');
  $('myHours').textContent = '🕐 ' + (myData.hours || '—');
  $('myType').textContent  = (myData.type || 's').toUpperCase();
  $('myCellId').textContent = myData.cellId || '—';
  const av = $('myAvatar');
  av.dataset.type = myData.type || 's';
  av.dataset.id   = myData.avatarId || 1;
  av.src = avatarUrl(myData.type, myData.avatarId || 1);
  av.style.display = '';

  const pub = myData.pubkey || '';
  $('myPubkey').textContent = pub ? pub.slice(0,16)+'…'+pub.slice(-8) : '—';
}

// ─── EDIT PROFILE ─────────────────────────────────────────────────────────
function openEditModal() {
  $('editName').value   = myData.name || '';
  $('editPhone').value  = myData.phone || '';
  $('editCoords').value = myData.lat ? `${myData.lat.toFixed(5)}, ${myData.lng.toFixed(5)}` : '';
  $('editHours').value  = myData.hours || '08:00_20:00';
  openModal('editModal');
}

async function saveEdit() {
  const name   = $('editName').value.trim();
  const phone  = $('editPhone').value.trim();
  const coords = $('editCoords').value.trim();
  const hours  = $('editHours').value.trim();
  if (!name) { toast('Name required', 'err'); return; }

  let lat = myData.lat, lng = myData.lng;
  if (coords) {
    const p = coords.split(',').map(s => parseFloat(s.trim()));
    if (p.length===2 && !isNaN(p[0]) && !isNaN(p[1])) [lat,lng]=p;
  }

  const btn = document.querySelector('#editModal .confirm-btn');
  btn.disabled = true; btn.textContent = '⏳ Publishing…';
  try {
    const result = await client.updatePresence({
      name, phone: phone||undefined, lat, lng,
      workTime: hours||'08:00_20:00', status: true,
      type: myData.type,
    });
    myData = { ...myData, name, phone, lat, lng, hours, cellId: result.cellId };
    updateProfile();
    closeModal('editModal');
    showPublish(result.eventId, 'Profile updated on Nostr');
    toast('✅ Profile saved', 'ok');
  } catch (e) {
    toast('Save failed: ' + e.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = '💾 Save & Publish';
  }
}

// ─── ASK / DONATE BROADCAST TOGGLES ─────────────────────────────────────
async function toggleAsk() {
  const next = !client.status().askCount > 0;  // just toggle presence flag
  // We toggle the badge visually; actual ask flag driven by updateItem
  const badge = $('askBadge');
  const isOn  = badge.dataset.on === '1';
  badge.dataset.on = isOn ? '0' : '1';
  badge.textContent = isOn ? 'Ask Off' : 'Ask On';
  badge.style.opacity = isOn ? '0.5' : '1';
  try {
    await client.updatePresence({ ...myData, isAsking: !isOn, type: myData.type });
  } catch {}
}

async function toggleDonate() {
  const badge = $('donateBadge');
  const isOn  = badge.dataset.on === '1';
  badge.dataset.on = isOn ? '0' : '1';
  badge.textContent = isOn ? 'Donate Off' : 'Donate On';
  badge.style.opacity = isOn ? '0.5' : '1';
  try {
    await client.updatePresence({ ...myData, isDonating: !isOn, type: myData.type });
  } catch {}
}

// ─── PRODUCT GRIDS ────────────────────────────────────────────────────────
function productCard(p, mode) {
  let dotClass = '', priceHtml = '', statusText = '—';

  if (mode === 'l') {
    const inv = myInventory[p.id];
    if (inv?.available) {
      dotClass   = 'available';
      statusText = 'Dispo';
      priceHtml  = `${inv.price.toFixed(1)} DA`;
    } else if (inv) {
      dotClass   = 'unavailable';
      statusText = 'Indispo';
      priceHtml  = `${inv.price.toFixed(1)} DA`;
    } else {
      statusText = '—';
      priceHtml  = '— DA';
    }
  } else if (mode === 'a') {
    if (myAsk.has(p.id)) { dotClass='ask'; statusText='Asking'; }
    priceHtml = 'KG';
  } else {
    if (myDonate.has(p.id)) { dotClass='donate'; statusText='Donating'; }
    priceHtml = 'KG';
  }

  const div = document.createElement('div');
  div.className = 'product-card';
  div.dataset.pid  = p.id;
  div.dataset.mode = mode;
  div.innerHTML = `
    <div class="product-img-wrap">
      <img class="product-img" src="${p.img}" alt="${p.name}" loading="lazy" />
      ${dotClass ? `<div class="product-badge ${dotClass}"></div>` : ''}
    </div>
    <div class="product-info">
      <div class="product-name">${p.name}</div>
      <div class="product-price">${priceHtml}</div>
      <div class="product-status">${statusText}</div>
    </div>`;
  div.querySelector('img').onerror = function(){ this.src = FALLBACK_IMG; };
  div.addEventListener('click', () => openProductModal(p, mode));
  return div;
}

function renderGrid(gridId, mode) {
  const grid = $(gridId);
  grid.innerHTML = '';
  PRODUCTS.forEach(p => grid.appendChild(productCard(p, mode)));
}

function renderAllGrids() {
  renderGrid('inventoryGrid', 'l');
  renderGrid('askGrid',       'a');
  renderGrid('donateGrid',    'd');
}

// ─── PRODUCT MODAL ────────────────────────────────────────────────────────
function openProductModal(product, mode) {
  currentModal = { id: product.id, mode };

  $('productModalTitle').textContent = product.name;
  $('productModalImg').src = product.img;
  $('productModalImg').onerror = function(){ this.src = FALLBACK_IMG; };

  $('productListingSection').style.display = mode==='l' ? '' : 'none';
  $('productAskSection').style.display     = mode==='a' ? '' : 'none';
  $('productDonateSection').style.display  = mode==='d' ? '' : 'none';

  if (mode === 'l') {
    const inv = myInventory[product.id];
    $('availSwitch').classList.toggle('on', !!(inv?.available));
    $('productPrice').value = inv?.price ?? '';
  } else if (mode === 'a') {
    $('askSwitch').classList.toggle('on', myAsk.has(product.id));
  } else {
    $('donateSwitch').classList.toggle('on', myDonate.has(product.id));
  }
  openModal('productModal');
}

async function confirmProduct() {
  if (!currentModal) return;
  const { id, mode } = currentModal;
  const btn = document.querySelector('#productModal .confirm-btn');
  btn.disabled = true; btn.textContent = '⏳ Publishing…';

  try {
    if (mode === 'l') {
      const avail = $('availSwitch').classList.contains('on');
      const price = parseFloat($('productPrice').value) || 0;
      const cents = Math.round(price * 100);
      const r = await client.updateItem('l', id, cents, avail);
      myInventory[id] = { price, available: avail };
      if (r.error) throw new Error(r.error);
      toast(avail ? `✅ ${PRODUCTS.find(p=>p.id===id)?.name} listed` : 'Unlisted', 'ok');

    } else if (mode === 'a') {
      const active = $('askSwitch').classList.contains('on');
      const r = await client.updateItem('a', id, null, active);
      if (active) myAsk.add(id); else myAsk.delete(id);
      if (r.error) throw new Error(r.error);
      toast(active ? '📋 Added to ask list' : 'Removed from ask', 'ok');

    } else {
      const active = $('donateSwitch').classList.contains('on');
      const r = await client.updateItem('d', id, null, active);
      if (active) myDonate.add(id); else myDonate.delete(id);
      if (r.error) throw new Error(r.error);
      toast(active ? '🤝 Added to donations' : 'Removed from donations', 'ok');
    }

    renderAllGrids();
    closeModal('productModal');
  } catch (e) {
    toast('Error: ' + e.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Confirm';
  }
}

// ─── DISCOVER ─────────────────────────────────────────────────────────────
async function doDiscover() {
  const coordsVal = $('discoverCoords').value.trim();
  const cellVal   = $('discoverCell').value.trim();
  const range     = parseInt($('rangeSlider').value);
  const btn       = $('discoverBtn');

  let cellId;
  if (cellVal) {
    cellId = parseInt(cellVal);
    if (isNaN(cellId)) { toast('Invalid Cell ID', 'err'); return; }
  } else if (coordsVal) {
    const p = coordsVal.split(',').map(s => parseFloat(s.trim()));
    if (p.length===2 && !isNaN(p[0]) && !isNaN(p[1])) {
      cellId = geoToCell(p[0], p[1]);
    } else { toast('Invalid coordinates', 'err'); return; }
  } else if (myData.cellId) {
    cellId = myData.cellId;
    $('discoverCoords').value = `${myData.lat.toFixed(5)}, ${myData.lng.toFixed(5)}`;
  } else { toast('Enter coordinates or Cell ID', 'err'); return; }

  btn.disabled = true; btn.textContent = '⏳ Searching…';
  $('discoverResults').innerHTML = `
    <div class="loading-row">
      <div class="spinner"></div>
      <span>Scanning ${range===0?'1':range*2+1}² lobbies on the Nostr relay…</span>
    </div>`;

  try {
    const result = await client.getNearby(cellId, range);
    const comps  = result.components || [];
    renderDiscoverResults(comps, cellId);
    toast(`Found ${comps.length} node${comps.length!==1?'s':''}`, comps.length ? 'ok' : '');
  } catch (e) {
    $('discoverResults').innerHTML = `<div class="card err-card">Error: ${e.message}</div>`;
    toast('Search failed: ' + e.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = '🔍 Search Nearby';
  }
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderDiscoverResults(comps, cellId) {
  const wrap = $('discoverResults');
  if (!comps.length) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div style="font-size:40px;margin-bottom:10px">📡</div>
        <p>No components found nearby.</p>
        <p class="empty-sub">Try a larger range or a different location.</p>
      </div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  const hdr = document.createElement('p');
  hdr.className = 'result-header';
  hdr.innerHTML = `Found <strong>${comps.length}</strong> component${comps.length!==1?'s':''} — Cell <strong>${cellId}</strong>`;
  frag.appendChild(hdr);

  comps.forEach(comp => {
    const div = document.createElement('div');
    div.className = 'component-card';
    const isOpen = comp.s !== false;
    const type = comp.cT || 's';
    const aid  = comp.aI || 1;
    const name = esc(comp.n || 'Unknown');
    const label = esc(TYPE_LABELS[type] || '?');
    const cell = esc(String(comp.cI || '—'));
    const phone = esc(comp.pN || '');

    div.innerHTML = `
      <img class="comp-avatar" src="${avatarUrl(type, aid)}" alt=""
           data-type="${type}" data-id="${aid}" loading="lazy" />
      <div class="comp-info">
        <div class="comp-name">${name}</div>
        <div class="comp-meta">${label} · Cell: ${cell} · ${phone}</div>
        <div class="comp-flags">
          ${comp.as ? '<span class="flag ask">Asking</span>' : ''}
          ${comp.do ? '<span class="flag donate">Donating</span>' : ''}
        </div>
      </div>
      <div class="comp-dot ${isOpen?'open':'closed'}"></div>`;
    div.addEventListener('click', () => openCompDetail(comp));
    frag.appendChild(div);
  });

  wrap.innerHTML = '';
  wrap.appendChild(frag);
}

// ─── COMPONENT DETAIL ────────────────────────────────────────────────────
async function openCompDetail(comp) {
  $('compDetailName').textContent = comp.n || 'Unknown';
  $('compDetailMeta').textContent = `${TYPE_LABELS[comp.cT]||'?'} · ${comp.pN||''} · Cell ${comp.cI||'—'}`;
  const av = $('compDetailAvatar');
  av.dataset.type = comp.cT || 's';
  av.dataset.id   = comp.aI || 1;
  av.src = avatarUrl(comp.cT, comp.aI || 1);

  // Reset tabs and show loading
  switchDetailTab('products');
  ['detailProductsGrid','detailAskGrid','detailDonateGrid'].forEach(id => {
    $(id).innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  });
  openModal('compDetailModal');

  try {
    const [catalog, asks, donations] = await Promise.all([
      client.listCatalog(comp.id).catch(()=>({entries:[]})),
      client.listAsk(comp.id).catch(()=>({productIds:[]})),
      client.listDonation(comp.id).catch(()=>({productIds:[]})),
    ]);

    renderRemoteListingGrid('detailProductsGrid', catalog.entries||[]);
    renderRemoteIdGrid('detailAskGrid',    asks.productIds||[],    'ask');
    renderRemoteIdGrid('detailDonateGrid', donations.productIds||[], 'donate');
  } catch (e) {
    $('detailProductsGrid').innerHTML = `<p class="err-text">Failed to load: ${e.message}</p>`;
  }
}

function renderRemoteListingGrid(gridId, entries) {
  const grid = $(gridId);
  if (!entries.length) { grid.innerHTML = '<div class="empty-state"><p>No listings</p></div>'; return; }
  grid.innerHTML = '';
  entries.forEach(e => {
    const p = PRODUCTS.find(p => p.id===e.productId) || {name:`#${e.productId}`,img:''};
    const name = esc(p.name);
    const price = (e.price/100).toFixed(1);
    const div = document.createElement('div');
    div.className = 'product-card';
    div.innerHTML = `
      <div class="product-img-wrap">
        <img class="product-img" src="${p.img}" alt="${name}" loading="lazy" />
        <div class="product-badge available"></div>
      </div>
      <div class="product-info">
        <div class="product-name">${name}</div>
        <div class="product-price">${price} DA</div>
        <div class="product-status">Dispo</div>
      </div>`;
    div.querySelector('img').onerror = function(){ this.src=FALLBACK_IMG; };
    grid.appendChild(div);
  });
}

function renderRemoteIdGrid(gridId, ids, badgeClass) {
  const grid = $(gridId);
  if (!ids.length) { grid.innerHTML = '<div class="empty-state"><p>None</p></div>'; return; }
  grid.innerHTML = '';
  ids.forEach(id => {
    const p = PRODUCTS.find(p => p.id===id) || {name:`#${id}`,img:''};
    const name = esc(p.name);
    const div = document.createElement('div');
    div.className = 'product-card';
    div.innerHTML = `
      <div class="product-img-wrap">
        <img class="product-img" src="${p.img}" alt="${name}" loading="lazy" />
        <div class="product-badge ${badgeClass}"></div>
      </div>
      <div class="product-info">
        <div class="product-name">${name}</div>
        <div class="product-price">KG</div>
        <div class="product-status">${badgeClass==='ask'?'Asking':'Donating'}</div>
      </div>`;
    div.querySelector('img').onerror = function(){ this.src=FALLBACK_IMG; };
    grid.appendChild(div);
  });
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
  $('content-'+tab).classList.add('active');
  $('tab-'+tab).classList.add('active');
  if (tab === 'discover' && myData.lat && !$('discoverCoords').value) {
    $('discoverCoords').value = `${myData.lat.toFixed(5)}, ${myData.lng.toFixed(5)}`;
  }
}

function switchSubtab(tab) {
  ['inventory','ask','donate'].forEach(t => {
    $('subcontent-'+t).style.display = t===tab ? '' : 'none';
    $('stab-'+t).classList.toggle('active', t===tab);
  });
}

function switchDetailTab(tab) {
  ['products','asking','donating'].forEach(t => {
    $('dcontent-'+t).style.display  = t===tab ? '' : 'none';
    $('dtab-'+t).classList.toggle('active', t===tab);
  });
}

// ─── WIRE UP ALL EVENTS ───────────────────────────────────────────────────

// Wire up all event listeners
function setupAllListeners() {
  console.log('[DIFP] Setting up event listeners');
  
  // Type selector buttons
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  // Join button
  const joinBtn = $('joinBtn');
  if (joinBtn) {
    joinBtn.addEventListener('click', doJoin);
  }

  // Range slider label
  const rangeSlider = $('rangeSlider');
  if (rangeSlider) {
    rangeSlider.addEventListener('input', e => {
      $('rangeVal').textContent = e.target.value + ' lobbie' + (e.target.value==='1'?'':'s');
    });
  }

  // Event delegation for all other actions using data-action attributes
  const ACTION_MAP = {
    'tab-home':                () => switchTab('home'),
    'tab-discover':            () => switchTab('discover'),
    'openEditModal':           openEditModal,
    'toggleAsk':               toggleAsk,
    'toggleDonate':            toggleDonate,
    'subtab-inventory':        () => switchSubtab('inventory'),
    'subtab-ask':              () => switchSubtab('ask'),
    'subtab-donate':           () => switchSubtab('donate'),
    'doDiscover':              doDiscover,
    'saveEdit':                saveEdit,
    'confirmProduct':          confirmProduct,
    'dtab-products':           () => switchDetailTab('products'),
    'dtab-asking':             () => switchDetailTab('asking'),
    'dtab-donating':           () => switchDetailTab('donating'),
    'toggleSwitch-avail':      () => toggleSwitch('availSwitch'),
    'toggleSwitch-ask':        () => toggleSwitch('askSwitch'),
    'toggleSwitch-donate':     () => toggleSwitch('donateSwitch'),
  };

  document.addEventListener('click', function handleDocumentClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    
    const action = el.getAttribute('data-action');
    if (!action) return;
    
    // Handle closeModal actions
    if (action.startsWith('closeModal-')) {
      const modalId = action.replace('closeModal-','');
      closeModal(modalId);
      return;
    }
    
    // Handle actions from map
    if (ACTION_MAP.hasOwnProperty(action) && typeof ACTION_MAP[action] === 'function') {
      ACTION_MAP[action]();
    }
  });

  // Close modals on backdrop click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', function handleModalBackdropClick(e) {
      if (e.target === overlay) {
        overlay.classList.remove('show');
      }
    });
  });
}

// Module entry point
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupAllListeners);
} else {
  setupAllListeners();
}
console.log('[DIFP] Module loaded');
