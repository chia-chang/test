/**
 * 炙序 GYOZA — 線上訂單 → Google Sheet（Google Apps Script）
 *
 * 使用方式（詳見 docs/google-sheets-setup.md）：
 *  1. 建立 Google 試算表 → 擴充功能 → Apps Script，貼上本檔內容
 *  2. 執行一次 setup()（會建立 Orders / OrderItems / Products 三張工作表並套用格式）
 *  3. 部署 → 新增部署作業 → 網頁應用程式（執行身分：我；存取：所有人），複製 /exec 網址
 *  4. 把網址填進 index.html 的 ORDER_ENDPOINT
 */

// ===== 設定 =====
var CONFIG = {
  NOTIFY_EMAIL: '',          // 新訂單通知信收件者（店家），留空則不寄
  SEND_CUSTOMER_EMAIL: true, // 是否寄訂單確認信給顧客
  STORE_NAME: '炙序 GYOZA',
  DELIVERY_FEE: 120,
  MAX_ITEMS: 30,             // 單筆訂單最多品項數
  MAX_QTY: 99,               // 單一品項最多份數
  TIMEZONE: 'Asia/Taipei',
  STATUSES: ['新訂單', '製作中', '可取餐', '配送中', '已完成', '已取消']
};

var SHEETS = {
  ORDERS: 'Orders',
  ITEMS: 'OrderItems',
  PRODUCTS: 'Products'
};

var ORDER_HEADERS = ['訂單編號', '建立時間', '狀態', '姓名', '手機', 'Email', '取餐方式', '配送地址', '備註', '品項明細', '小計', '運費', '總計'];
var ITEM_HEADERS = ['訂單編號', '品項代碼', '品項名稱', '單價', '數量', '小計'];
var PRODUCT_HEADERS = ['id', 'category', 'name', 'price', 'active'];

// 與 index.html 的菜單一致；setup() 會寫入 Products 工作表。之後改價請直接改試算表（以試算表為準）。
var SEED_PRODUCTS = [
  ['p01', 'potsticker', '經典鮮肉鍋貼', 85], ['p02', 'potsticker', '韭香黃金鍋貼', 90],
  ['p03', 'potsticker', '椒麻爆汁鍋貼', 105], ['p04', 'potsticker', '玉米鮮甜鍋貼', 95],
  ['d01', 'dumpling', '手作高麗菜水餃', 90], ['d02', 'dumpling', '鮮蝦玉米水餃', 125],
  ['d03', 'dumpling', '香辣紅油抄手', 110], ['d04', 'dumpling', '鮮蔬素水餃', 95],
  ['s01', 'soup', '酸辣湯', 50], ['s02', 'soup', '玉米濃湯', 50],
  ['s03', 'soup', '冰釀烏梅汁', 45], ['s04', 'soup', '無糖冷泡茶', 40],
  ['a01', 'side', '蒜香涼拌小黃瓜', 45], ['a02', 'side', '香滷豆干', 45],
  ['a03', 'side', '涼拌海帶絲', 40], ['a04', 'side', '香辣滷米血', 55],
  ['gift01', 'gift', '招牌招財鍋貼禮盒', 499]
];

// ===== 試算表初始化與選單 =====
function onOpen() {
  SpreadsheetApp.getUi().createMenu('炙序訂單')
    .addItem('初始化工作表', 'setup')
    .addItem('今日訂單統計', 'showTodaySummary')
    .addToUi();
}

function setup() {
  var ss = SpreadsheetApp.getActive();

  var orders = getOrCreate_(ss, SHEETS.ORDERS, ORDER_HEADERS);
  var statusRange = orders.getRange(2, 3, orders.getMaxRows() - 1, 1);
  statusRange.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(CONFIG.STATUSES, true).setAllowInvalid(false).build());
  var rules = [
    ['新訂單', '#fde7d3'], ['製作中', '#fff3c4'], ['可取餐', '#d9f0d3'], ['配送中', '#d6e6f7'], ['已完成', '#e6e6e6'], ['已取消', '#f4cccc']
  ].map(function (r) {
    return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(r[0]).setBackground(r[1]).setRanges([statusRange]).build();
  });
  orders.setConditionalFormatRules(rules);
  orders.getRange(2, 2, orders.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  orders.getRange(2, 5, orders.getMaxRows() - 1, 1).setNumberFormat('@'); // 手機維持文字，保留開頭 0
  orders.getRange(2, 11, orders.getMaxRows() - 1, 3).setNumberFormat('"NT$" #,##0');

  getOrCreate_(ss, SHEETS.ITEMS, ITEM_HEADERS);

  var products = getOrCreate_(ss, SHEETS.PRODUCTS, PRODUCT_HEADERS);
  if (products.getLastRow() < 2) {
    var rows = SEED_PRODUCTS.map(function (p) { return p.concat([true]); });
    products.getRange(2, 1, rows.length, 5).setValues(rows);
    products.getRange(2, 5, rows.length, 1).insertCheckboxes();
  }
  var def = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) ss.deleteSheet(def);
  SpreadsheetApp.getActive().toast('已完成初始化', CONFIG.STORE_NAME);
}

function getOrCreate_(ss, name, headers) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#55392b').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  return sh;
}

// ===== Web App 入口 =====
function doGet(e) {
  // 健康檢查／菜單（供前端確認價格用）
  var action = e && e.parameter && e.parameter.action;
  if (action === 'products') return json_({ ok: true, products: readProducts_() });
  return json_({ ok: true, service: 'zhixu-orders' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json_({ ok: false, error: '系統忙碌中，請稍後再試' });
  }
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var order = validate_(data);
    var number = nextOrderNumber_();
    writeOrder_(number, order);
    try { notify_(number, order); } catch (mailErr) { console.warn('通知信寄送失敗：' + mailErr); }
    return json_({ ok: true, orderNumber: number, total: order.total });
  } catch (err) {
    if (err && err.userMessage) return json_({ ok: false, error: err.userMessage });
    console.error(err);
    return json_({ ok: false, error: '系統發生錯誤，請稍後再試' });
  } finally {
    lock.releaseLock();
  }
}

// ===== 驗證（價格一律以試算表 Products 為準，不信任前端金額）=====
function fail_(msg) { var e = new Error(msg); e.userMessage = msg; throw e; }
function str_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max); }

function validate_(d) {
  if (d.website) fail_('無法送出訂單'); // honeypot：機器人才會填
  var fulfillment = str_(d.fulfillment, 10);
  if (['pickup', 'dinein', 'delivery'].indexOf(fulfillment) < 0) fail_('取餐方式不正確');

  var name = str_(d.name, 50), phone = str_(d.phone, 18), email = str_(d.email, 100), address = str_(d.address, 120), note = str_(d.note, 200);
  if (!name) fail_('請填寫姓名');
  if (!/^[0-9+()\-\s]{8,18}$/.test(phone)) fail_('手機號碼格式不正確');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail_('Email 格式不正確');
  if (fulfillment === 'delivery' && !address) fail_('宅配請填寫配送地址');

  if (!Array.isArray(d.items) || !d.items.length) fail_('購物車是空的');
  if (d.items.length > CONFIG.MAX_ITEMS) fail_('品項過多');
  var catalog = readProducts_(), lines = [], subtotal = 0, seen = {}, hasGift = false;
  d.items.forEach(function (it) {
    var id = str_(it && it.id, 20), qty = Math.floor(Number(it && it.qty));
    var p = catalog[id];
    if (!p || !p.active) fail_('有商品目前無法訂購：' + id);
    if (seen[id]) fail_('商品重複：' + p.name);
    if (!(qty >= 1 && qty <= CONFIG.MAX_QTY)) fail_('數量不正確：' + p.name);
    seen[id] = true;
    if (p.category === 'gift') hasGift = true;
    var line = p.price * qty;
    subtotal += line;
    lines.push({ id: id, name: p.name, price: p.price, qty: qty, line: line });
  });
  if (fulfillment === 'dinein' && hasGift) fail_('冷凍禮盒無法選擇內用');
  var fee = fulfillment === 'delivery' ? CONFIG.DELIVERY_FEE : 0;
  return { fulfillment: fulfillment, name: name, phone: phone, email: email, address: address, note: note, lines: lines, subtotal: subtotal, fee: fee, total: subtotal + fee };
}

function readProducts_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEETS.PRODUCTS);
  if (!sh) fail_('尚未初始化，請先執行 setup()');
  var out = {};
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[0]) continue;
    out[String(r[0])] = { id: String(r[0]), category: String(r[1]), name: String(r[2]), price: Number(r[3]), active: r[4] !== false };
  }
  return out;
}

// ===== 寫入 =====
function nextOrderNumber_() {
  var props = PropertiesService.getScriptProperties();
  var day = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyyMMdd');
  var key = 'seq_' + day;
  var n = Number(props.getProperty(key) || 0) + 1;
  props.setProperty(key, String(n));
  // 清掉舊日期計數器
  Object.keys(props.getProperties()).forEach(function (k) { if (k.indexOf('seq_') === 0 && k !== key) props.deleteProperty(k); });
  return 'ZX-' + day + '-' + ('000' + n).slice(-4);
}

// 避免 =、+、-、@ 開頭被當成公式執行（Sheet 公式注入）
function safe_(v) {
  v = String(v);
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}

function writeOrder_(number, o) {
  var ss = SpreadsheetApp.getActive();
  var summary = o.lines.map(function (l) { return l.name + ' × ' + l.qty; }).join('、');
  var orders = ss.getSheetByName(SHEETS.ORDERS), items = ss.getSheetByName(SHEETS.ITEMS);
  if (!orders || !items) fail_('尚未初始化，請先執行 setup()');
  var row = [number, new Date(), '新訂單', safe_(o.name), safe_(o.phone), safe_(o.email), fulfillmentLabel_(o.fulfillment), safe_(o.address), safe_(o.note), summary, o.subtotal, o.fee, o.total];
  orders.appendRow(row);
  var lastRow = orders.getLastRow();
  orders.getRange(lastRow, 5).setNumberFormat('@').setValue(safe_(o.phone));
  var itemRows = o.lines.map(function (l) { return [number, l.id, l.name, l.price, l.qty, l.line]; });
  items.getRange(items.getLastRow() + 1, 1, itemRows.length, ITEM_HEADERS.length).setValues(itemRows);
  SpreadsheetApp.flush();
}

function fulfillmentLabel_(f) { return { pickup: '外帶自取', dinein: '內用', delivery: '宅配' }[f] || f; }

// ===== 通知 =====
function notify_(number, o) {
  var lines = o.lines.map(function (l) { return '・' + l.name + ' × ' + l.qty + '　NT$ ' + l.line; }).join('\n');
  var body = '訂單編號：' + number + '\n取餐方式：' + fulfillmentLabel_(o.fulfillment) + '\n' + lines +
    '\n運費：NT$ ' + o.fee + '\n總計：NT$ ' + o.total + '\n付款方式：尚未線上收款，請於取餐／收貨時付款。';
  if (CONFIG.NOTIFY_EMAIL) {
    MailApp.sendEmail(CONFIG.NOTIFY_EMAIL, '[新訂單] ' + number + '｜' + o.name + '｜NT$ ' + o.total,
      body + '\n\n姓名：' + o.name + '\n電話：' + o.phone + '\nEmail：' + o.email + (o.address ? '\n地址：' + o.address : '') + (o.note ? '\n備註：' + o.note : ''));
  }
  if (CONFIG.SEND_CUSTOMER_EMAIL) {
    MailApp.sendEmail({ to: o.email, name: CONFIG.STORE_NAME, subject: '【' + CONFIG.STORE_NAME + '】訂單確認 ' + number, body: o.name + ' 您好，已收到您的訂單：\n\n' + body + '\n\n感謝您的訂購！' });
  }
}

// ===== 今日統計（選單功能）=====
function showTodaySummary() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEETS.ORDERS);
  var rows = sh.getDataRange().getValues().slice(1);
  var today = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
  var count = 0, sum = 0;
  rows.forEach(function (r) {
    if (r[1] instanceof Date && Utilities.formatDate(r[1], CONFIG.TIMEZONE, 'yyyy-MM-dd') === today && r[2] !== '已取消') { count++; sum += Number(r[12]) || 0; }
  });
  SpreadsheetApp.getUi().alert('今日（' + today + '）有效訂單 ' + count + ' 筆，合計 NT$ ' + sum.toLocaleString());
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
