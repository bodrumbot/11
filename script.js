import { db, ref, push, set } from './firebase-config.js';
import { getMenuFromLocal, categories } from './menu.js';
import { saveProfileDB, getProfileDB, getOrdersDB, deleteProfileDB, addOrderDB } from './db.js';

let tg = null;
if (window.Telegram && window.Telegram.WebApp) {
  tg = window.Telegram.WebApp;
  tg.expand();
  tg.ready();
}

// ==========================================
// MAHSULOTLAR VA STATE
// ==========================================

const menu = getMenuFromLocal();
let cart = [];
let currentLocation = null;
let activeCategory = 'all';
let searchQuery = '';
let currentProfile = null;
let currentFoodItem = null;
let currentOrderId = null;

// ==========================================
// DOM ELEMENTS
// ==========================================

const menuContent = document.getElementById('menuContent');
const categoriesContainer = document.getElementById('categories');
const searchInput = document.getElementById('searchInput');
const foodModal = document.getElementById('foodDetailModal');
const paymentModal = document.getElementById('paymentModal');

// Profile elements
const profileAvatar = document.getElementById('profileAvatar');
const profileName = document.getElementById('profileName');
const profilePhone = document.getElementById('profilePhone');
const editName = document.getElementById('editName');
const editPhone = document.getElementById('editPhone');
const saveProfileBtn = document.getElementById('saveProfileBtn');
const firstTimeModal = document.getElementById('firstTimeModal');
const modalName = document.getElementById('modalName');
const modalPhone = document.getElementById('modalPhone');
const modalSaveBtn = document.getElementById('modalSaveBtn');
const logoutBtn = document.getElementById('logoutBtn');

// ==========================================
// DEBUG FUNKSIYASI
// ==========================================

function debugLog(step, data = null) {
  console.log(`[DEBUG] ${step}`, data || '');
}

// ==========================================
// CATEGORIES
// ==========================================

function renderCategories() {
  categoriesContainer.innerHTML = categories.map(cat => `
    <button class="category-btn ${cat.id === 'all' ? 'active' : ''}" data-cat="${cat.id}">
      <span class="category-icon">${cat.icon}</span>
      <span>${cat.name}</span>
    </button>
  `).join('');

  categoriesContainer.addEventListener('click', e => {
    const btn = e.target.closest('.category-btn');
    if (!btn) return;
    
    document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCategory = btn.dataset.cat;
    renderMenu();
  });
}

// ==========================================
// MENU RENDER
// ==========================================

function renderMenu() {
  let filtered = menu.filter(item => item.available !== false);
  
  if (activeCategory !== 'all') {
    filtered = filtered.filter(item => item.category === activeCategory);
  }
  
  if (searchQuery) {
    filtered = filtered.filter(item => 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }

  if (filtered.length === 0) {
    menuContent.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">🔍</div>
        <p>Hech narsa topilmadi</p>
      </div>
    `;
    return;
  }

  if (activeCategory === 'all' && !searchQuery) {
    const grouped = {};
    categories.forEach(cat => {
      if (cat.id === 'all') return;
      const catItems = filtered.filter(item => item.category === cat.id);
      if (catItems.length > 0) {
        grouped[cat.id] = {
          ...cat,
          items: catItems
        };
      }
    });

    menuContent.innerHTML = Object.values(grouped).map(group => `
      <div class="category-section">
        <h2 class="category-title">${group.icon} ${group.name}</h2>
        <div class="menu-grid">
          ${group.items.map(item => createCard(item)).join('')}
        </div>
      </div>
    `).join('');
  } else {
    menuContent.innerHTML = `
      <div class="menu-grid" style="margin-top: 16px;">
        ${filtered.map(item => createCard(item)).join('')}
      </div>
    `;
  }
}

function createCard(item) {
  return `
    <div class="card" data-id="${item.id}" onclick="openFoodModal(${item.id})">
      <div class="card-image-container">
        <img src="${item.image}" alt="${item.name}" loading="lazy" onerror="this.style.display='none'">
      </div>
      <h3>${item.name}</h3>
      <div class="price">${item.price.toLocaleString()} so'm</div>
      <button class="add-btn-only" onclick="event.stopPropagation(); addToCart(${item.id})">Savatchaga</button>
    </div>
  `;
}

// ==========================================
// FOOD DETAIL MODAL
// ==========================================

window.openFoodModal = function(id) {
  const item = menu.find(p => p.id === id);
  if (!item) return;
  
  currentFoodItem = item;
  
  const imgEl = document.getElementById('foodModalImage');
  imgEl.src = item.image || '';
  imgEl.alt = item.name;
  
  document.getElementById('foodModalName').textContent = item.name;
  document.getElementById('foodModalPrice').textContent = item.price.toLocaleString() + ' so\'m';
  document.getElementById('foodModalDescription').textContent = item.description || 'Tavsif mavjud emas';
  
  foodModal.classList.add('show');
  document.body.style.overflow = 'hidden';
};

window.closeFoodModal = function() {
  foodModal.classList.remove('show');
  document.body.style.overflow = '';
  currentFoodItem = null;
};

document.getElementById('foodModalAddBtn').addEventListener('click', () => {
  if (currentFoodItem) {
    addToCart(currentFoodItem.id);
    closeFoodModal();
  }
});

foodModal.addEventListener('click', (e) => {
  if (e.target === foodModal) {
    closeFoodModal();
  }
});

// ==========================================
// SEARCH
// ==========================================

searchInput.addEventListener('input', e => {
  searchQuery = e.target.value.trim();
  renderMenu();
});

// ==========================================
// CART
// ==========================================

const CART_KEY = 'bodrum_cart';

function saveCartLS() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function loadCartLS() {
  const raw = localStorage.getItem(CART_KEY);
  cart = raw ? JSON.parse(raw) : [];
}

window.addToCart = function(id) {
  const product = menu.find(p => p.id === id);
  const exist = cart.find(c => c.id === id);
  
  if (exist) exist.qty++;
  else cart.push({ ...product, qty: 1 });
  
  saveCartLS();
  renderCart();
  
  const badge = document.getElementById('cartBadge');
  badge.style.transform = 'scale(1.3)';
  setTimeout(() => badge.style.transform = 'scale(1)', 200);
};

function renderCart() {
  const cartList = document.getElementById('cartList');
  const cartBadge = document.getElementById('cartBadge');
  const cartTotal = document.getElementById('cartTotal');
  
  cartList.innerHTML = '';
  let total = 0;
  
  if (cart.length === 0) {
    cartList.innerHTML = '<div class="empty-cart">Savat bo\'sh</div>';
    cartBadge.textContent = '0';
    cartTotal.textContent = 'Umumiy: 0 so\'m';
    return;
  }
  
  cart.forEach((item, idx) => {
    total += item.price * item.qty;
    cartList.insertAdjacentHTML('beforeend', `
      <div class="cart-item">
        <div class="cart-item-image-container">
          <img src="${item.image}" alt="${item.name}" onerror="this.style.display='none'">
        </div>
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-price">${(item.price * item.qty).toLocaleString()} so'm</div>
        </div>
        <div class="cart-item-controls">
          <div class="cart-item-qty">
            <button onclick="updateQty(${idx}, -1)">−</button>
            <span>${item.qty}</span>
            <button onclick="updateQty(${idx}, 1)">+</button>
          </div>
          <button class="cart-item-delete" onclick="removeFromCart(${idx})">🗑</button>
        </div>
      </div>
    `);
  });
  
  cartBadge.textContent = cart.reduce((s, i) => s + i.qty, 0);
  cartTotal.textContent = `Umumiy: ${total.toLocaleString()} so'm`;
}

window.updateQty = function(idx, delta) {
  if (delta < 0 && cart[idx].qty > 1) {
    cart[idx].qty--;
  } else if (delta > 0) {
    cart[idx].qty++;
  } else {
    cart.splice(idx, 1);
  }
  saveCartLS();
  renderCart();
};

window.removeFromCart = function(idx) {
  cart.splice(idx, 1);
  saveCartLS();
  renderCart();
};

// ==========================================
// TAB SWITCH
// ==========================================

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab, .tab-content').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
    
    if (btn.dataset.tab === 'profile') {
      renderProfile();
    }
  });
});

window.switchTab = function(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  
  document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
  document.getElementById(tabName)?.classList.add('active');
  
  if (tabName === 'profile') renderProfile();
};

// ==========================================
// LOCATION
// ==========================================

function requestLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve(`${pos.coords.latitude},${pos.coords.longitude}`),
      err => reject(err),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
}

// ==========================================
// PAYMENT MODAL - FAQAT PAYME
// ==========================================

document.getElementById('orderBtn').addEventListener('click', async () => {
  if (!cart.length) {
    showNotification('Savat bo\'sh!', 'error');
    return;
  }
  
  const profile = await getProfileDB();
  if (!profile?.name || !profile?.phone) {
    showNotification('Iltimos avval profilni to\'ldiring!', 'error');
    switchTab('profile');
    return;
  }
  
  const btn = document.getElementById('orderBtn');
  btn.disabled = true;
  btn.textContent = 'Joylashuv aniqlanmoqda...';
  
  try {
    currentLocation = await requestLocation();
  } catch (e) {
    console.warn('Location error:', e);
  }
  
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  document.getElementById('paymentTotal').textContent = total.toLocaleString() + ' so\'m';
  document.getElementById('paymentPhone').value = profile.phone || '';
  
  paymentModal.classList.add('show');
  btn.disabled = false;
  btn.textContent = 'Buyurtma berish';
});

document.getElementById('confirmPaymentBtn').addEventListener('click', async () => {
  const phone = document.getElementById('paymentPhone').value.trim();
  
  if (!phone || phone.length !== 9) {
    showNotification('Telefon raqamni to\'g\'ri kiriting!', 'error');
    return;
  }
  
  await processPaymePayment();
});

// Faqat Payme to'lovi
async function processPaymePayment() {
  const profile = await getProfileDB();
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  currentOrderId = 'ORD_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  // Loading ko'rsatish
  document.getElementById('btnText').textContent = 'To\'lov sahifasiga yo\'naltirilmoqda...';
  document.getElementById('btnLoader').style.display = 'inline-block';
  document.getElementById('confirmPaymentBtn').disabled = true;
  
  try {
    // Payme merchant ID - O'ZINGIZNIKI BILAN ALMASHTIRING
    const PAYME_MERCHANT_ID = '698d8268f7c89c2bb7cfc08e';
    
    // Payme parametrlari
    const paymeParams = {
      merchant: PAYME_MERCHANT_ID,
      amount: total * 100, // Payme tiyinda (so'm * 100)
      order_id: currentOrderId,
      detail: 'BODRUM - ' + cart.map(i => i.name).join(', ').substring(0, 100),
      description: 'BODRUM Restaurant',
      callback_url: window.location.origin + '/payment-success.html?order_id=' + currentOrderId,
      callback_timeout: 0,
      lang: 'uz'
    };
    
    // Buyurtmani Firebase ga saqlash
    const pendingOrderData = {
      name: profile.name,
      phone: profile.phone,
      items: cart.map(item => ({
        name: item.name,
        price: item.price,
        qty: item.qty
      })),
      total: total,
      status: 'pending_payment',
      createdAt: new Date().toISOString(),
      location: currentLocation,
      paymentMethod: 'payme',
      paymentStatus: 'pending',
      orderId: currentOrderId,
      tg_id: tg?.initDataUnsafe?.user?.id || null
    };
    
    const ordersRef = ref(db, 'orders');
    const newOrderRef = push(ordersRef);
    await set(newOrderRef, pendingOrderData);
    
    // Localga saqlash
    await addOrderDB({
      text: cart.map(i => `${i.name} x${i.qty}`).join(', '),
      date: new Date().toISOString(),
      total: total,
      items: cart.map(item => ({ name: item.name, qty: item.qty })),
      status: 'pending_payment',
      orderId: currentOrderId
    });
    
    // LocalStorage ga saqlash
    localStorage.setItem('lastOrderId', currentOrderId);
    localStorage.setItem('lastOrderAmount', total);
    localStorage.setItem('lastOrderMethod', 'Payme');
    
    // Payme checkout URL
    const paymeCheckoutUrl = `https://checkout.paycom.uz/${PAYME_MERCHANT_ID}?` + 
      Object.entries(paymeParams)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
    
    // To'lov sahifasiga yo'naltirish
    window.location.href = paymeCheckoutUrl;
    
  } catch (error) {
    console.error('Payment error:', error);
    showNotification('To\'lovda xatolik: ' + error.message, 'error');
    document.getElementById('btnText').textContent = 'Payme orqali to\'lash';
    document.getElementById('btnLoader').style.display = 'none';
    document.getElementById('confirmPaymentBtn').disabled = false;
  }
}

function closePaymentModal() {
  paymentModal.classList.remove('show');
  setTimeout(() => {
    document.getElementById('paymentForm').style.display = 'block';
    document.getElementById('paymentSuccess').style.display = 'none';
    document.getElementById('btnText').textContent = 'Payme orqali to\'lash';
    document.getElementById('btnLoader').style.display = 'none';
    document.getElementById('confirmPaymentBtn').disabled = false;
  }, 300);
}

// ==========================================
// PROFILE FUNCTIONS
// ==========================================

function formatPhone(phone) {
  if (!phone || phone.length !== 9) return '+998 __ _______';
  return `+998 ${phone.slice(0, 2)} ${phone.slice(2, 5)} ${phone.slice(5, 7)} ${phone.slice(7)}`;
}

function getInitials(name) {
  if (!name) return '👤';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

async function renderProfile() {
  debugLog('renderProfile boshlandi');
  
  try {
    currentProfile = await getProfileDB();
    debugLog('getProfileDB natija', currentProfile);
    
    if (currentProfile) {
      profileAvatar.textContent = getInitials(currentProfile.name);
      profileName.textContent = currentProfile.name;
      profilePhone.textContent = formatPhone(currentProfile.phone);
      
      editName.value = currentProfile.name;
      editPhone.value = currentProfile.phone;
      
      firstTimeModal.classList.remove('show');
      
      await loadProfileStats();
    } else {
      profileAvatar.textContent = '👤';
      profileName.textContent = 'Mehmon';
      profilePhone.textContent = '+998 __ _______';
      
      editName.value = '';
      editPhone.value = '';
      
      firstTimeModal.classList.add('show');
      debugLog('Modal ko\'rsatildi');
    }
  } catch (error) {
    debugLog('renderProfile xato', error.message);
    showNotification('Profil yuklashda xatolik', 'error');
  }
}

async function loadProfileStats() {
  try {
    const orders = await getOrdersDB();
    
    const totalOrders = orders.length;
    const totalSpent = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    
    document.getElementById('totalOrders').textContent = totalOrders;
    document.getElementById('totalSpent').textContent = (totalSpent / 1000).toFixed(0) + 'k';
    document.getElementById('ordersCountBadge').textContent = totalOrders;
    
    const vipStatus = document.getElementById('vipStatus');
    if (totalOrders >= 20) {
      vipStatus.textContent = '💎';
      vipStatus.parentElement.style.background = 'linear-gradient(145deg, rgba(212, 175, 55, 0.2) 0%, rgba(212, 175, 55, 0.1) 100%)';
    } else if (totalOrders >= 10) {
      vipStatus.textContent = '🥇';
    } else if (totalOrders >= 5) {
      vipStatus.textContent = '🥈';
    } else {
      vipStatus.textContent = '🥉';
    }
    
    renderOrdersList(orders);
  } catch (error) {
    debugLog('loadProfileStats xato', error.message);
  }
}

function renderOrdersList(orders) {
  const container = document.getElementById('ordersList');
  
  if (orders.length === 0) {
    container.innerHTML = `
      <div class="empty-orders">
        <div class="empty-orders-icon">📭</div>
        <div class="empty-orders-text">Hali buyurtmalar yo'q</div>
        <button class="browse-menu-btn" onclick="switchTab('menu')">Menyuni ko'rish</button>
      </div>
    `;
    return;
  }
  
  container.innerHTML = orders.slice(0, 10).map(order => {
    const date = new Date(order.createdAt || order.date);
    const itemsText = order.items ? order.items.map(i => `${i.name} x${i.qty}`).join(', ') : order.text;
    
    return `
      <div class="order-history-card">
        <div class="order-history-header">
          <span class="order-history-id">#${order.id?.toString().slice(-6) || order.orderId?.slice(-6) || '-----'}</span>
          <span class="order-history-date">${date.toLocaleDateString('uz-UZ')}</span>
        </div>
        <div class="order-history-items">${itemsText}</div>
        <div class="order-history-footer">
          <span class="order-history-total">${(order.total || 0).toLocaleString()} so'm</span>
          <span class="order-history-status ${order.status || 'accepted'}">
            ${order.status === 'pending_payment' ? '⏳ To\'lov kutilmoqda' : 
              order.status === 'pending' ? '⏳ Kutilmoqda' : '✅ Qabul qilingan'}
          </span>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// ASOSIY SAQLASH FUNKSIYASI
// ==========================================

async function saveProfile(name, phone, address = '') {
  debugLog('saveProfile boshlandi', { name, phone, address });
  
  if (!name || name.length < 2) {
    showNotification('Ismni to\'g\'ri kiriting (kamida 2 harf)', 'error');
    return false;
  }
  
  const cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length !== 9) {
    showNotification('Telefon raqamni to\'g\'ri kiriting (9 raqam)', 'error');
    return false;
  }
  
  try {
    const profileData = { 
      name: name.trim(), 
      phone: cleanPhone, 
      address: address || '' 
    };
    
    await saveProfileDB(profileData);
    
    debugLog('saveProfileDB muvaffaqiyatli');
    showNotification('✅ Profil saqlandi!', 'success');
    
    await renderProfile();
    
    return true;
  } catch (e) {
    debugLog('saveProfile xato', e.message);
    console.error('Save profile error:', e);
    showNotification('❌ Saqlashda xatolik: ' + e.message, 'error');
    return false;
  }
}

// Profile tabdagi saqlash tugmasi
saveProfileBtn.addEventListener('click', async () => {
  const name = editName.value.trim();
  const phone = editPhone.value.trim();
  
  const saved = await saveProfile(name, phone, '');
  
  if (saved) {
    saveProfileBtn.classList.add('saved');
    saveProfileBtn.innerHTML = '<span>✅</span><span>Saqlandi!</span>';
    setTimeout(() => {
      saveProfileBtn.classList.remove('saved');
      saveProfileBtn.innerHTML = '<span>💾</span><span>Saqlash</span>';
    }, 2000);
  }
});

// MODAL SAVE BUTTON
modalSaveBtn.addEventListener('click', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  
  debugLog('modalSaveBtn click boshlandi');
  
  const name = modalName.value.trim();
  const phone = modalPhone.value.trim();
  
  debugLog('Input qiymatlar', { name, phone });
  
  if (!name) {
    showNotification('Iltimos, ismingizni kiriting', 'error');
    modalName.focus();
    return;
  }
  
  if (!phone) {
    showNotification('Iltimos, telefon raqamni kiriting', 'error');
    modalPhone.focus();
    return;
  }
  
  const cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length !== 9) {
    showNotification('Telefon raqam 9 ta raqamdan iborat bo\'lishi kerak', 'error');
    modalPhone.focus();
    return;
  }
  
  modalSaveBtn.disabled = true;
  const originalText = modalSaveBtn.textContent;
  modalSaveBtn.textContent = 'Saqlanmoqda...';
  
  try {
    debugLog('saveProfile chaqirilmoqda...');
    const success = await saveProfile(name, cleanPhone);
    
    if (success) {
      debugLog('Muvaffaqiyatli, modal yopilmoqda');
      firstTimeModal.classList.remove('show');
      showNotification('Xush kelibsiz, ' + name + '!', 'success');
    }
  } catch (error) {
    debugLog('Modal save xato', error.message);
    console.error('Modal save error:', error);
    showNotification('Xatolik yuz berdi: ' + error.message, 'error');
  } finally {
    modalSaveBtn.disabled = false;
    modalSaveBtn.textContent = originalText;
    debugLog('Button qayta enable qilindi');
  }
});

logoutBtn.addEventListener('click', async () => {
  if (confirm('Haqiqatan ham akkauntdan chiqmoqchimisiz?')) {
    try {
      await deleteProfileDB();
      cart = [];
      saveCartLS();
      renderCart();
      renderProfile();
      showNotification('Akkauntdan chiqildi', 'success');
    } catch (error) {
      debugLog('Logout xato', error.message);
      showNotification('Chiqishda xatolik', 'error');
    }
  }
});

// Phone input formatting
[editPhone, modalPhone, document.getElementById('paymentPhone')].forEach(input => {
  if (!input) return;
  input.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 9) value = value.slice(0, 9);
    e.target.value = value;
  });
});

// ==========================================
// NOTIFICATION
// ==========================================

function showNotification(message, type = 'info') {
  const div = document.createElement('div');
  const colors = {
    success: 'linear-gradient(135deg, #00D084 0%, #00b06b 100%)',
    error: 'linear-gradient(135deg, #FF4757 0%, #ff3344 100%)',
    info: 'linear-gradient(135deg, #FFD700 0%, #D4AF37 100%)'
  };
  
  div.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: ${colors[type]};
    color: ${type === 'info' ? '#000' : '#fff'};
    padding: 16px 24px;
    border-radius: 12px;
    font-weight: 700;
    z-index: 9999;
    animation: slideDown 0.3s ease;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  `;
  div.textContent = message;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 3000);
}

// ==========================================
// INIT
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  debugLog('DOMContentLoaded');
  
  try {
    loadCartLS();
    renderCategories();
    renderMenu();
    renderCart();
    renderProfile();
    
    debugLog('Init muvaffaqiyatli');
  } catch (error) {
    debugLog('Init xato', error.message);
    console.error('Init error:', error);
  }
});