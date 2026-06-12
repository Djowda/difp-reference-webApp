import { schnorr } from 'https://esm.sh/@noble/curves@1.4.2/secp256k1';
import { sha256 } from 'https://esm.sh/@noble/hashes@1.4.0/sha256';
import { bytesToHex, hexToBytes } from 'https://esm.sh/@noble/curves@1.4.2/abstract/utils';
import { randomBytes } from 'https://esm.sh/@noble/hashes@1.4.0/utils';

var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
function sha256Hex(data) {
  const bytes = new TextEncoder().encode(data);
  return bytesToHex(sha256(bytes));
}
function buildEventId(pubkey, createdAt, kind, tags, content) {
  const serialized = JSON.stringify([0, pubkey, createdAt, kind, tags, content]);
  return sha256Hex(serialized);
}
function signEvent(unsignedEvent, privkeyHex) {
  const { pubkey, created_at, kind, tags, content } = unsignedEvent;
  const id = buildEventId(pubkey, created_at, kind, tags, content);
  const idBytes = hexToBytes(id);
  const privBytes = hexToBytes(privkeyHex);
  const aux = randomBytes(32);
  let sigBytes;
  try {
    sigBytes = schnorr.sign(idBytes, privBytes, aux);
  } catch (err) {
    throw new Error(`SIGN_FAILED: ${String(err)}`);
  }
  const sig = bytesToHex(sigBytes);
  return { id, pubkey, created_at, kind, tags, content, sig };
}
function generateKeypair() {
  const privBytes = schnorr.utils.randomPrivateKey();
  const pubBytes = schnorr.getPublicKey(privBytes);
  return {
    privkeyHex: bytesToHex(privBytes),
    pubkeyHex: bytesToHex(pubBytes)
  };
}
function nowSeconds() {
  return Math.floor(Date.now() / 1e3);
}

// src/core/identity.ts
var IDENTITY_KEY = "difp_identity";
function isNode() { return false; /* browser patch */ // ORIGINAL:
  return typeof process !== "undefined" && typeof process.versions !== "undefined" && typeof process.versions.node !== "undefined";
}
function loadBrowser() {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.privkeyHex && parsed.pubkeyHex) return parsed;
    return null;
  } catch {
    return null;
  }
}
function saveBrowser(identity) {
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
}
async function loadNode() {
  try {
    const { readFile } = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    const filePath = path.join(os.homedir(), ".difp", "identity.json");
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed.privkeyHex && parsed.pubkeyHex) return parsed;
    return null;
  } catch {
    return null;
  }
}
async function saveNode(identity) {
  const { writeFile, mkdir } = await import('fs/promises');
  const path = await import('path');
  const os = await import('os');
  const dir = path.join(os.homedir(), ".difp");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, "identity.json");
  await writeFile(filePath, JSON.stringify(identity, null, 2), "utf8");
}
async function loadOrCreateIdentity() {
  if (isNode()) {
    let identity = await loadNode();
    if (!identity) {
      identity = generateKeypair();
      await saveNode(identity);
    }
    return identity;
  } else {
    let identity = loadBrowser();
    if (!identity) {
      identity = generateKeypair();
      saveBrowser(identity);
    }
    return identity;
  }
}

// src/nostr/connection.ts
var NostrConnection = class {
  constructor(relayUrl, debug = false) {
    this.relayUrl = relayUrl;
    this.debug = debug;
    this.ws = null;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this._connected = false;
    this.destroyed = false;
    this.messageHandlers = /* @__PURE__ */ new Set();
    this.statusHandlers = /* @__PURE__ */ new Set();
  }
  get connected() {
    return this._connected;
  }
  /** Register a handler for incoming messages */
  onMessage(handler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }
  /** Register a handler for connection status changes */
  onStatus(handler) {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }
  /** Open the WebSocket connection */
  async connect() {
    return new Promise((resolve, reject) => {
      this._doConnect(resolve, reject);
    });
  }
  _doConnect(onConnected, onError) {
    if (this.destroyed) return;
    this._log(`Connecting to ${this.relayUrl}`);
    const WS = this._getWebSocket();
    try {
      this.ws = new WS(this.relayUrl);
    } catch (err) {
      this._emitStatus("error");
      onError?.(err instanceof Error ? err : new Error(String(err)));
      this._scheduleReconnect();
      return;
    }
    let resolved = false;
    this.ws.onopen = () => {
      this._log("Connected");
      this._connected = true;
      this._emitStatus("connected");
      this._startPing();
      if (!resolved) {
        resolved = true;
        onConnected?.();
      }
    };
    this.ws.onmessage = (event) => {
      this._handleRawMessage(typeof event.data === "string" ? event.data : String(event.data));
    };
    this.ws.onerror = (err) => {
      this._log("WebSocket error", err);
      if (!resolved) {
        resolved = true;
        onError?.(new Error("WebSocket error"));
      }
    };
    this.ws.onclose = () => {
      this._log("Disconnected");
      this._connected = false;
      this._stopPing();
      this._emitStatus("disconnected");
      if (!resolved) {
        resolved = true;
        onError?.(new Error("Connection closed before open"));
      }
      this._scheduleReconnect();
    };
  }
  /** Send a raw JSON message to the relay */
  send(payload) {
    if (!this._connected || !this.ws) {
      throw new Error("NOT_CONNECTED: relay WebSocket not open");
    }
    const msg = JSON.stringify(payload);
    this._log("\u2192", msg.slice(0, 200));
    this.ws.send(msg);
  }
  /** Close the connection permanently */
  destroy() {
    this.destroyed = true;
    this._stopPing();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
  _handleRawMessage(text) {
    this._log("\u2190", text.slice(0, 300));
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      this._log("Unparseable message");
      return;
    }
    if (!Array.isArray(msg) || typeof msg[0] !== "string") return;
    const typed = msg;
    for (const handler of this.messageHandlers) {
      try {
        handler(typed);
      } catch {
      }
    }
  }
  _emitStatus(status) {
    for (const handler of this.statusHandlers) {
      try {
        handler(status);
      } catch {
      }
    }
  }
  _startPing() {
    this.pingTimer = setInterval(() => {
      if (this._connected && this.ws) {
        try {
          ;
          this.ws.send(JSON.stringify(["PING"]));
        } catch {
        }
      }
    }, 3e4);
  }
  _stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
  _scheduleReconnect() {
    if (this.destroyed) return;
    if (this.reconnectTimer) return;
    this._log("Reconnecting in 30s");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._doConnect();
    }, 3e4);
  }
  _getWebSocket() {
    if (typeof globalThis.WebSocket !== "undefined") {
      return globalThis.WebSocket;
    }
    try {
      return __require("ws");
    } catch {
      throw new Error('WebSocket not available. Install the "ws" package for Node.js usage.');
    }
  }
  _log(...args) {
    if (this.debug) console.log("[DIFP:ws]", ...args);
  }
};

// src/geo/cell.ts
var EARTH_WIDTH_M = 40075e3;
var EARTH_HEIGHT_M = 2e7;
var CELL_SIZE_M = 500;
var GRID_COLS = 82e3;
var GRID_ROWS = 42e3;
function geoToCell(lat, lng) {
  if (lat < -90 || lat > 90) {
    throw new Error("INVALID_COORDINATES: lat must be in [-90, 90]");
  }
  if (lng < -180 || lng > 180) {
    throw new Error("INVALID_COORDINATES: lng must be in [-180, 180]");
  }
  const x = (lng + 180) * (EARTH_WIDTH_M / 360);
  const latRad = lat * Math.PI / 180;
  const y = EARTH_HEIGHT_M / 2 - Math.log(Math.tan(Math.PI / 4 + latRad / 2)) * (EARTH_HEIGHT_M / (2 * Math.PI));
  const xCell = Math.max(0, Math.min(GRID_COLS - 1, Math.floor(x / CELL_SIZE_M)));
  const yCell = Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(y / CELL_SIZE_M)));
  return xCell * GRID_ROWS + yCell;
}
function cellIdToXY(cellId) {
  const xCell = Math.floor(cellId / GRID_ROWS);
  const yCell = cellId % GRID_ROWS;
  return { xCell, yCell };
}
function cellToGeo(cellId) {
  const { xCell, yCell } = cellIdToXY(cellId);
  const x = (xCell + 0.5) * CELL_SIZE_M;
  const y = (yCell + 0.5) * CELL_SIZE_M;
  const lng = x / (EARTH_WIDTH_M / 360) - 180;
  const mercY = y - EARTH_HEIGHT_M / 2;
  const lat = (2 * Math.atan(Math.exp(-mercY / (EARTH_HEIGHT_M / (2 * Math.PI)))) - Math.PI / 2) * (180 / Math.PI);
  return { lat, lng };
}

// src/geo/lobby.ts
var LOBBY_SIZE = 41;
var NUM_LOBBY_COLUMNS = Math.floor(82e3 / LOBBY_SIZE);
var NUM_LOBBY_ROWS = Math.ceil(42e3 / LOBBY_SIZE);
var MAX_RANGE = 10;
var DEFAULT_RANGE = 5;
function cellToLobby(cellId) {
  const { xCell, yCell } = cellIdToXY(cellId);
  const lobbyX = Math.floor(xCell / LOBBY_SIZE);
  const lobbyY = Math.floor(yCell / LOBBY_SIZE);
  return lobbyX * NUM_LOBBY_ROWS + lobbyY;
}
function lobbyIdToXY(lobbyId) {
  const lobbyX = Math.floor(lobbyId / NUM_LOBBY_ROWS);
  const lobbyY = lobbyId % NUM_LOBBY_ROWS;
  return { lobbyX, lobbyY };
}
function getNearbyLobbyIds(centerCellId, range = DEFAULT_RANGE) {
  if (range < 0 || range > MAX_RANGE) {
    throw new Error(`INVALID_RANGE: range must be 0\u2013${MAX_RANGE}`);
  }
  const baseLobby = cellToLobby(centerCellId);
  const { lobbyX: baseLobbyX, lobbyY: baseLobbyY } = lobbyIdToXY(baseLobby);
  const results = [];
  for (let dx = -range; dx <= range; dx++) {
    for (let dy = -range; dy <= range; dy++) {
      const lx = baseLobbyX + dx;
      const ly = baseLobbyY + dy;
      if (lx >= 0 && lx < NUM_LOBBY_COLUMNS && ly >= 0 && ly < NUM_LOBBY_ROWS) {
        results.push(lx * NUM_LOBBY_ROWS + ly);
      }
    }
  }
  return results;
}

// src/core/models.ts
var COMPONENT_TYPES = ["u", "s", "f", "fa", "w", "r", "sp", "t", "d", "a"];
var COMPONENT_TYPE_NAMES = {
  u: "User",
  s: "Store",
  f: "Farmer",
  fa: "Factory",
  w: "Wholesaler",
  r: "Restaurant",
  sp: "Seed Provider",
  t: "Transport",
  d: "Delivery",
  a: "Admin"
};
var AVATAR_COUNTS = {
  u: 25,
  s: 23,
  // confirmed from filesystem
  f: 21,
  // confirmed from filesystem
  fa: 9,
  w: 9,
  r: 9,
  sp: 9,
  t: 9,
  d: 9,
  a: 9
};
var DifpError = class extends Error {
  constructor(code, message) {
    super(`[${code}] ${message}`);
    this.code = code;
    this.name = "DifpError";
  }
};

// src/nostr/publisher.ts
async function publishComponent(conn, identity, component) {
  if (component.cI === 0) {
    throw new DifpError("CELL_NOT_SET", "Cannot publish component with cellId = 0. Set lat/lng first.");
  }
  if (!conn.connected) {
    throw new DifpError("NOT_CONNECTED", "Relay WebSocket is not open");
  }
  const lobbyId = cellToLobby(component.cI);
  const createdAt = nowSeconds();
  const tags = [
    ["d", "main"],
    ["t", "difp"],
    ["t", component.cT],
    ["cell", String(component.cI)],
    ["lobby", String(lobbyId)],
    ["t", `lobby-${lobbyId}`],
    ["status", component.s ? "1" : "0"],
    ["listing", "o"]
  ];
  if (component.as) tags.push(["listing", "a"]);
  if (component.do) tags.push(["listing", "d"]);
  tags.push(["catalog", `${identity.pubkeyHex}-l`]);
  if (component.as) tags.push(["catalog", `${identity.pubkeyHex}-a`]);
  if (component.do) tags.push(["catalog", `${identity.pubkeyHex}-d`]);
  tags.push(["updated", String(createdAt)]);
  const content = JSON.stringify({
    n: component.n,
    pN: component.pN,
    cT: component.cT,
    aI: component.aI,
    wT: component.wT
  });
  const event = signEvent(
    {
      pubkey: identity.pubkeyHex,
      created_at: createdAt,
      kind: 30420,
      tags,
      content
    },
    identity.privkeyHex
  );
  return new Promise((resolve, reject) => {
    const unsub = conn.onMessage((msg) => {
      if (msg[0] === "OK" && msg[1] === event.id) {
        unsub();
        if (msg[2] === false) {
          reject(new DifpError("RELAY_REJECTED", msg[3] ?? "Relay rejected event"));
        } else {
          resolve(event.id);
        }
      }
    });
    try {
      conn.send(["EVENT", event]);
    } catch (err) {
      unsub();
      reject(err);
    }
    setTimeout(() => {
      unsub();
      resolve(event.id);
    }, 1e4);
  });
}
async function publishCatalog(conn, identity, type, payload) {
  if (!conn.connected) {
    throw new DifpError("NOT_CONNECTED", "Relay WebSocket is not open");
  }
  const createdAt = nowSeconds();
  const dTag = `${identity.pubkeyHex}-${type}`;
  const itemCount = payload === "" ? 0 : payload.split(";").length;
  const tags = [
    ["d", dTag],
    ["type", type],
    ["catalog", identity.pubkeyHex],
    ["count", String(itemCount)],
    ["updated", String(createdAt)]
  ];
  const event = signEvent(
    {
      pubkey: identity.pubkeyHex,
      created_at: createdAt,
      kind: 30421,
      tags,
      content: payload
    },
    identity.privkeyHex
  );
  return new Promise((resolve, reject) => {
    const unsub = conn.onMessage((msg) => {
      if (msg[0] === "OK" && msg[1] === event.id) {
        unsub();
        if (msg[2] === false) {
          reject(new DifpError("RELAY_REJECTED", msg[3] ?? "Relay rejected event"));
        } else {
          resolve(event.id);
        }
      }
    });
    try {
      conn.send(["EVENT", event]);
    } catch (err) {
      unsub();
      reject(err);
    }
    setTimeout(() => {
      unsub();
      resolve(event.id);
    }, 1e4);
  });
}

// src/nostr/subscriber.ts
var subIdCounter = 0;
function newSubId(prefix) {
  return `difp-${prefix}-${Date.now()}-${++subIdCounter}`;
}
function parseComponent(event) {
  try {
    const content = JSON.parse(event.content);
    const cT = content["cT"];
    if (!COMPONENT_TYPES.includes(cT)) return null;
    const cellTag = event.tags.find((t) => t[0] === "cell");
    const cellId = cellTag ? parseInt(cellTag[1] ?? "0", 10) : 0;
    return {
      id: event.pubkey,
      n: String(content["n"] ?? ""),
      pN: String(content["pN"] ?? ""),
      cI: cellId,
      cT,
      aI: Number(content["aI"] ?? 1),
      s: event.tags.some((t) => t[0] === "status" && t[1] === "1"),
      wT: String(content["wT"] ?? "08:00_20:00"),
      lU: event.created_at * 1e3,
      as: event.tags.some((t) => t[0] === "listing" && t[1] === "a"),
      do: event.tags.some((t) => t[0] === "listing" && t[1] === "d")
    };
  } catch {
    return null;
  }
}
function subscribeNearby(conn, lobbyIds, onComponent, onEose, timeoutMs = 1e4) {
  const subId = newSubId("nearby");
  const filter = {
    kinds: [30420],
    "#t": lobbyIds.map((id) => `lobby-${id}`),
    limit: 200
  };
  const timeoutHandle = setTimeout(() => {
    unsub();
    onEose();
  }, timeoutMs);
  const unsub = conn.onMessage((msg) => {
    if (msg[0] === "EVENT" && msg[1] === subId) {
      const event = msg[2];
      if (event.kind === 30420) {
        const component = parseComponent(event);
        if (component) onComponent(component);
      }
    } else if (msg[0] === "EOSE" && msg[1] === subId) {
      clearTimeout(timeoutHandle);
      unsub();
      try {
        conn.send(["CLOSE", subId]);
      } catch {
      }
      onEose();
    }
  });
  conn.send(["REQ", subId, filter]);
  return unsub;
}
function fetchCatalog(conn, componentId, type, onResult, onEose, timeoutMs = 1e4) {
  const subId = newSubId(`cat-${type}`);
  const dTag = `${componentId}-${type}`;
  const filter = {
    kinds: [30421],
    "#d": [dTag],
    limit: 1
  };
  const timeoutHandle = setTimeout(() => {
    unsub();
    onEose();
  }, timeoutMs);
  let found = false;
  const unsub = conn.onMessage((msg) => {
    if (msg[0] === "EVENT" && msg[1] === subId) {
      const event = msg[2];
      if (event.kind === 30421) {
        found = true;
        onResult(event.content);
      }
    } else if (msg[0] === "EOSE" && msg[1] === subId) {
      clearTimeout(timeoutHandle);
      unsub();
      try {
        conn.send(["CLOSE", subId]);
      } catch {
      }
      if (!found) onResult("");
      onEose();
    }
  });
  conn.send(["REQ", subId, filter]);
  return unsub;
}

// src/catalog/encoder.ts
function encodeListing(items) {
  const parts = [];
  for (const [productId, entry] of items) {
    if (entry.available) {
      parts.push(`${productId}:${entry.price}`);
    }
  }
  return parts.join(";");
}
function encodeIdList(ids) {
  const parts = [];
  for (const [productId, active] of ids) {
    if (active) {
      parts.push(String(productId));
    }
  }
  return parts.join(";");
}

// src/catalog/store.ts
var CatalogStore = class {
  constructor() {
    /** productId → {price (cents), available} */
    this.listing = /* @__PURE__ */ new Map();
    /** productId → asking */
    this.ask = /* @__PURE__ */ new Map();
    /** productId → donating */
    this.donation = /* @__PURE__ */ new Map();
  }
  // ─── Listing ────────────────────────────────────────────────────────────────
  updateListing(productId, price, available) {
    if (available) {
      this.listing.set(productId, { price, available });
    } else {
      this.listing.delete(productId);
    }
  }
  encodeListing() {
    return encodeListing(this.listing);
  }
  get listingSize() {
    return this.listing.size;
  }
  // ─── Ask ────────────────────────────────────────────────────────────────────
  updateAsk(productId, active) {
    if (active) {
      this.ask.set(productId, true);
    } else {
      this.ask.delete(productId);
    }
  }
  encodeAsk() {
    return encodeIdList(this.ask);
  }
  get askSize() {
    return this.ask.size;
  }
  // ─── Donation ───────────────────────────────────────────────────────────────
  updateDonation(productId, active) {
    if (active) {
      this.donation.set(productId, true);
    } else {
      this.donation.delete(productId);
    }
  }
  encodeDonation() {
    return encodeIdList(this.donation);
  }
  get donationSize() {
    return this.donation.size;
  }
  // ─── Snapshot ───────────────────────────────────────────────────────────────
  snapshot() {
    return {
      listingPayload: this.encodeListing(),
      askPayload: this.encodeAsk(),
      donationPayload: this.encodeDonation(),
      listingSize: this.listingSize,
      askSize: this.askSize,
      donationSize: this.donationSize
    };
  }
};

// src/catalog/decoder.ts
function decodeListing(payload) {
  if (!payload || payload.trim() === "") return [];
  const entries = [];
  for (const part of payload.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) {
      throw new DifpError("INVALID_PAYLOAD", `Invalid listing entry: "${trimmed}"`);
    }
    const productId = parseInt(trimmed.slice(0, colonIdx), 10);
    const price = parseInt(trimmed.slice(colonIdx + 1), 10);
    if (isNaN(productId) || isNaN(price)) {
      throw new DifpError("INVALID_PAYLOAD", `Non-numeric listing entry: "${trimmed}"`);
    }
    entries.push({ productId, price, available: true });
  }
  return entries;
}
function decodeIdList(payload) {
  if (!payload || payload.trim() === "") return [];
  const ids = [];
  for (const part of payload.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const id = parseInt(trimmed, 10);
    if (isNaN(id)) {
      throw new DifpError("INVALID_PAYLOAD", `Non-numeric id-list entry: "${trimmed}"`);
    }
    ids.push(id);
  }
  return ids;
}

// src/assets/names.ts
var STORE_NAMES = [
  "\xC9picerie El Baraka",
  "March\xE9 Bouzidi",
  "Ferme Chaouia",
  "Boutique Amine",
  "Coop\xE9rative El Wifak",
  "Boulangerie Sahara",
  "Mara\xEEchage Cheniti",
  "Superette Meziane",
  "Magasin Belouizdad",
  "Commerce Ziani",
  "\xC9picerie El Feth",
  "Ferme Oueld Fayet",
  "March\xE9 Bio Tipaza",
  "Boucherie Halal Oran",
  "Laiterie S\xE9tif"
];
function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randomPhone() {
  const prefix = ["0555", "0556", "0557", "0770", "0771", "0699", "0700"][Math.floor(Math.random() * 7)];
  const suffix = String(Math.floor(1e5 + Math.random() * 9e5));
  return `${prefix}${suffix}`;
}

// src/assets/cities.ts
var CITIES = [
  // Algeria
  { name: "Algiers", lat: 36.737, lng: 3.086 },
  { name: "Oran", lat: 35.697, lng: -0.634 },
  { name: "Constantine", lat: 36.365, lng: 6.614 },
  { name: "Annaba", lat: 36.897, lng: 7.765 },
  { name: "Blida", lat: 36.47, lng: 2.829 },
  { name: "S\xE9tif", lat: 36.191, lng: 5.412 },
  { name: "B\xE9ja\xEFa", lat: 36.75, lng: 5.056 },
  { name: "Tlemcen", lat: 34.88, lng: -1.316 },
  { name: "Batna", lat: 35.556, lng: 6.174 },
  { name: "Tizi Ouzou", lat: 36.712, lng: 4.045 },
  // Morocco
  { name: "Casablanca", lat: 33.573, lng: -7.589 },
  { name: "Rabat", lat: 33.99, lng: -6.851 },
  { name: "Marrakech", lat: 31.629, lng: -7.981 },
  // Tunisia
  { name: "Tunis", lat: 36.819, lng: 10.165 },
  { name: "Sfax", lat: 34.74, lng: 10.76 },
  // France
  { name: "Paris", lat: 48.856, lng: 2.352 },
  { name: "Lyon", lat: 45.764, lng: 4.835 },
  { name: "Marseille", lat: 43.296, lng: 5.381 },
  // USA
  { name: "New York", lat: 40.712, lng: -74.006 },
  { name: "Los Angeles", lat: 34.052, lng: -118.244 }
];
function randomCityCoord() {
  const city = CITIES[Math.floor(Math.random() * CITIES.length)];
  const lat = city.lat + (Math.random() - 0.5) * 0.1;
  const lng = city.lng + (Math.random() - 0.5) * 0.1;
  return { lat, lng };
}

// src/core/client.ts
var DEFAULT_RELAY = "wss://relay.damus.io";
async function init(options = {}) {
  const client = new DifpClient(options);
  await client._init();
  return client;
}
var DifpClient = class {
  constructor(options = {}) {
    this.catalog = new CatalogStore();
    this.lastPublished = 0;
    this.options = {
      relay: options.relay ?? DEFAULT_RELAY,
      type: options.type ?? "s",
      name: options.name ?? "",
      debug: options.debug ?? false
    };
  }
  /** @internal Called by init() */
  async _init() {
    this.identity = await loadOrCreateIdentity();
    this.component = {
      id: this.identity.pubkeyHex,
      n: this.options.name || randomFrom(STORE_NAMES),
      pN: randomPhone(),
      cI: 0,
      cT: this.options.type,
      aI: Math.ceil(Math.random() * (AVATAR_COUNTS[this.options.type] ?? 9)),
      s: true,
      wT: "08:00_20:00",
      lU: Date.now(),
      as: false,
      do: false
    };
    this.conn = new NostrConnection(this.options.relay, this.options.debug);
    let status = "connecting";
    try {
      await this.conn.connect();
      status = "connected";
    } catch {
      status = "error";
    }
    const lobbyId = this.component.cI > 0 ? cellToLobby(this.component.cI) : 0;
    return {
      pubkey: this.identity.pubkeyHex,
      cellId: this.component.cI,
      lobbyId,
      relay: this.options.relay,
      status
    };
  }
  // ─── 8.1 registerPresence ─────────────────────────────────────────────────
  async registerPresence(modelOrTest) {
    return this._publishPresence(modelOrTest);
  }
  // ─── 8.2 updatePresence ───────────────────────────────────────────────────
  async updatePresence(modelOrTest) {
    return this._publishPresence(modelOrTest);
  }
  async _publishPresence(modelOrTest) {
    const model = modelOrTest === "test" ? this._buildTestModel() : modelOrTest;
    const cellId = geoToCell(model.lat, model.lng);
    const lobbyId = cellToLobby(cellId);
    this.component = {
      ...this.component,
      n: model.name,
      pN: model.phone ?? this.component.pN,
      cT: model.type ?? this.component.cT,
      cI: cellId,
      aI: model.avatarId ?? this.component.aI,
      s: model.status ?? true,
      wT: model.workTime ?? this.component.wT,
      as: model.isAsking ?? this.component.as,
      do: model.isDonating ?? this.component.do,
      lU: Date.now()
    };
    try {
      const eventId = await publishComponent(this.conn, this.identity, this.component);
      this.lastPublished = Date.now();
      return {
        success: true,
        eventId,
        component: { ...this.component },
        cellId,
        lobbyId,
        error: null
      };
    } catch (err) {
      return {
        success: false,
        eventId: "",
        component: { ...this.component },
        cellId,
        lobbyId,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
  // ─── 8.3 updateItem ───────────────────────────────────────────────────────
  async updateItem(type, productId, price, available) {
    if (!["l", "a", "d"].includes(type)) {
      throw new DifpError("INVALID_TYPE", `type must be one of: l, a, d`);
    }
    const avail = available ?? true;
    if (type === "l") {
      this.catalog.updateListing(productId, price ?? 0, avail);
    } else if (type === "a") {
      this.catalog.updateAsk(productId, avail);
    } else {
      this.catalog.updateDonation(productId, avail);
    }
    if (type === "a") {
      this.component = { ...this.component, as: this.catalog.askSize > 0 };
    } else if (type === "d") {
      this.component = { ...this.component, do: this.catalog.donationSize > 0 };
    }
    let payload;
    let itemCount;
    if (type === "l") {
      payload = this.catalog.encodeListing();
      itemCount = this.catalog.listingSize;
    } else if (type === "a") {
      payload = this.catalog.encodeAsk();
      itemCount = this.catalog.askSize;
    } else {
      payload = this.catalog.encodeDonation();
      itemCount = this.catalog.donationSize;
    }
    try {
      const eventId = await publishCatalog(this.conn, this.identity, type, payload);
      this.lastPublished = Date.now();
      return {
        success: true,
        eventId,
        type,
        productId,
        payloadSize: new TextEncoder().encode(payload).length,
        itemCount,
        error: null
      };
    } catch (err) {
      return {
        success: false,
        eventId: "",
        type,
        productId,
        payloadSize: 0,
        itemCount,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
  // ─── 8.4 getNearby ────────────────────────────────────────────────────────
  async getNearby(centerCellId, range = DEFAULT_RANGE) {
    const lobbies = getNearbyLobbyIds(centerCellId, range);
    const components = [];
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({
          success: false,
          components: [],
          centerCell: centerCellId,
          lobbies,
          count: 0,
          error: "TIMEOUT"
        });
      }, 15e3);
      subscribeNearby(
        this.conn,
        lobbies,
        (c) => components.push(c),
        () => {
          clearTimeout(timer);
          resolve({
            success: true,
            components,
            centerCell: centerCellId,
            lobbies,
            count: components.length,
            error: null
          });
        }
      );
    });
  }
  // ─── 8.5 listCatalog ──────────────────────────────────────────────────────
  async listCatalog(componentId) {
    return new Promise((resolve) => {
      let rawPayload = "";
      fetchCatalog(
        this.conn,
        componentId,
        "l",
        (payload) => {
          rawPayload = payload;
        },
        () => {
          try {
            const entries = rawPayload ? decodeListing(rawPayload) : [];
            resolve({
              success: true,
              componentId,
              type: "l",
              entries,
              rawPayload,
              payloadSize: new TextEncoder().encode(rawPayload).length,
              count: entries.length,
              error: null
            });
          } catch (err) {
            resolve({
              success: false,
              componentId,
              type: "l",
              entries: [],
              rawPayload,
              payloadSize: 0,
              count: 0,
              error: err instanceof Error ? err.message : String(err)
            });
          }
        }
      );
    });
  }
  // ─── 8.6 listAsk ──────────────────────────────────────────────────────────
  async listAsk(componentId) {
    return new Promise((resolve) => {
      let rawPayload = "";
      fetchCatalog(
        this.conn,
        componentId,
        "a",
        (payload) => {
          rawPayload = payload;
        },
        () => {
          try {
            const productIds = rawPayload ? decodeIdList(rawPayload) : [];
            resolve({
              success: true,
              componentId,
              type: "a",
              productIds,
              rawPayload,
              count: productIds.length,
              error: null
            });
          } catch (err) {
            resolve({
              success: false,
              componentId,
              type: "a",
              productIds: [],
              rawPayload,
              count: 0,
              error: err instanceof Error ? err.message : String(err)
            });
          }
        }
      );
    });
  }
  // ─── 8.7 listDonation ─────────────────────────────────────────────────────
  async listDonation(componentId) {
    return new Promise((resolve) => {
      let rawPayload = "";
      fetchCatalog(
        this.conn,
        componentId,
        "d",
        (payload) => {
          rawPayload = payload;
        },
        () => {
          try {
            const productIds = rawPayload ? decodeIdList(rawPayload) : [];
            resolve({
              success: true,
              componentId,
              type: "d",
              productIds,
              rawPayload,
              count: productIds.length,
              error: null
            });
          } catch (err) {
            resolve({
              success: false,
              componentId,
              type: "d",
              productIds: [],
              rawPayload,
              count: 0,
              error: err instanceof Error ? err.message : String(err)
            });
          }
        }
      );
    });
  }
  // ─── 8.8 status ───────────────────────────────────────────────────────────
  status() {
    const lobbyId = this.component.cI > 0 ? cellToLobby(this.component.cI) : 0;
    return {
      pubkey: this.identity.pubkeyHex,
      cellId: this.component.cI,
      lobbyId,
      componentType: this.component.cT,
      name: this.component.n,
      relay: this.options.relay,
      connected: this.conn.connected,
      lastPublished: this.lastPublished,
      catalogSize: this.catalog.listingSize,
      askCount: this.catalog.askSize,
      donationCount: this.catalog.donationSize
    };
  }
  // ─── 8.9 geoToCell (static utility) ──────────────────────────────────────
  static geoToCell(lat, lng) {
    return geoToCell(lat, lng);
  }
  // ─── 8.10 cellToLobby (static utility) ───────────────────────────────────
  static cellToLobby(cellId) {
    return cellToLobby(cellId);
  }
  // ─── Avatar resolution ────────────────────────────────────────────────────
  /**
   * Resolve the path to an avatar image relative to the assets directory.
   * e.g. avatarPath('s', 3) → 'assets/avatars/s/3.webp'
   */
  static avatarPath(componentType, avatarId) {
    // Match project layout: npm/assets/avatars/<componentType>/<avatarId>.webp
    // Use npm/ prefix because avatar assets are packaged under the npm/assets directory.
    return `npm/assets/avatars/${componentType}/${avatarId}.webp`;
  }
  // ─── Disconnect ───────────────────────────────────────────────────────────
  /** Cleanly disconnect from the relay */
  disconnect() {
    this.conn.destroy();
  }
  // ─── Internal ─────────────────────────────────────────────────────────────
  _buildTestModel() {
    const { lat, lng } = randomCityCoord();
    const cT = randomFrom(COMPONENT_TYPES);
    const maxAvatar = AVATAR_COUNTS[cT] ?? 9;
    return {
      name: randomFrom(STORE_NAMES),
      phone: randomPhone(),
      type: cT,
      lat,
      lng,
      avatarId: Math.ceil(Math.random() * maxAvatar),
      status: Math.random() > 0.3,
      workTime: "08:00_20:00",
      isAsking: Math.random() > 0.6,
      isDonating: Math.random() > 0.7
    };
  }
};
/**
 * @djowda/difp — Djowda Interconnected Food Protocol SDK
 *
 * @version 0.1.0-alpha
 * @license MIT
 *
 * Public API barrel export.
 */

export { AVATAR_COUNTS, COMPONENT_TYPES, COMPONENT_TYPE_NAMES, DEFAULT_RANGE, DEFAULT_RELAY, DifpClient, DifpError, LOBBY_SIZE, MAX_RANGE, cellIdToXY, cellToGeo, cellToLobby, decodeIdList, decodeListing, encodeIdList, encodeListing, geoToCell, getNearbyLobbyIds, init, lobbyIdToXY };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map