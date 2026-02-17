import { db, ref, onValue, update, push, set, remove } from './firebase-config.js';

let tg = null;
let currentOrderKey = null;
let orders = [];
let customers = [];
let chartInstance = null;
let currentOrderView = 'new';

function init() {
  if (window.Telegram?.WebApp) {
    tg = window.Telegram.WebApp;
    tg.expand();
    tg.ready();
    
    const version = parseFloat(tg.version || '6.0');
    if (version >= 6.1) {
      try {
        tg.setHeaderColor('#0f0f0f');
      } catch (e) {
        console.log('setHeaderColor not supported');
      }
    }
  }
  
  listenToOrders();
  listenToCustomers();
  
  setTimeout(updateStats, 1000);
}

// Navigation - MENU OLIB TASHLANDI
window.switchTab = function(tabName) {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    if(item.dataset.tab === tabName) item.classList.add('active');
  });
  
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.remove('active');
  });
  document.getElementById(tabName + 'Section').classList.add('active');
  
  if(tabName === 'stats') updateStats();
};

window.switchOrderView = function(view) {
  currentOrderView = view;
  document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');
  renderOrders();
};

// Firebase Listeners
function listenToOrders() {
  const ordersRef = ref(db, 'orders');
  onValue(ordersRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      orders = Object.entries(data).map(([key, value]) => ({
        firebaseKey: key,
        ...value
      })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      checkNewOrders();
      renderOrders();
      updateStats();
    }
  });
}

function listenToCustomers() {
  const ordersRef = ref(db, 'orders');
  onValue(ordersRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const customerMap = new Map();
      Object.values(data).forEach(order => {
        if (!customerMap.has(order.phone)) {
          customerMap.set(order.phone, {
            name: order.name,
            phone: order.phone,
            orders: 0,
            totalSpent: 0,
            lastOrder: order.createdAt
          });
        }
        const c = customerMap.get(order.phone);
        c.orders++;
        c.totalSpent += order.total || 0;
        if (new Date(order.createdAt) > new Date(c.lastOrder)) {
          c.lastOrder = order.createdAt;
        }
      });
      customers = Array.from(customerMap.values()).sort((a, b) => b.totalSpent - a.totalSpent);
      renderCustomers();
    }
  });
}

function checkNewOrders() {
  const oldOrders = JSON.parse(localStorage.getItem('orders') || '[]');
  const oldKeys = new Set(oldOrders.map(o => o.firebaseKey));
  const newOrders = orders.filter(o => !oldKeys.has(o.firebaseKey) && o.status === 'pending');
  
  if (newOrders.length > 0) {
    playNotificationSound();
    
    const version = parseFloat(tg?.version || '6.0');
    
    if (version >= 6.2 && tg?.showPopup) {
      try {
        tg.showPopup({
          title: '🛎️ Yangi buyurtma!',
          message: `${newOrders[0].name} - ${newOrders[0].total?.toLocaleString()} so'm`
        });
      } catch (e) {
        showToast(`🛎️ Yangi buyurtma! ${newOrders[0].name} - ${newOrders[0].total?.toLocaleString()} so'm`);
      }
    } else if (tg?.showAlert) {
      tg.showAlert(`🛎️ Yangi buyurtma!\\n${newOrders[0].name} - ${newOrders[0].total?.toLocaleString()} so'm`);
    } else {
      showToast(`🛎️ Yangi buyurtma! ${newOrders[0].name} - ${newOrders[0].total?.toLocaleString()} so'm`);
    }
  }
  localStorage.setItem('orders', JSON.stringify(orders));
}

function renderOrders() {
  const container = document.getElementById('ordersListContainer');
  const filtered = orders.filter(o => o.status === (currentOrderView === 'new' ? 'pending' : 'accepted'));
  
  const newCount = orders.filter(o => o.status === 'pending').length;
  document.getElementById('newOrdersCount').textContent = newCount;
  document.getElementById('newBadge').textContent = newCount;
  document.getElementById('ordersNavBadge').textContent = newCount;
  
  const today = new Date().toDateString();
  const todayRev = orders
    .filter(o => new Date(o.createdAt).toDateString() === today && o.status === 'accepted')
    .reduce((sum, o) => sum + (o.total || 0), 0);
  document.getElementById('todayRevenue').textContent = (todayRev / 1000).toFixed(0) + 'k';
  
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="1">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <p>${currentOrderView === 'new' ? 'Yangi buyurtmalar yo\'q' : 'Qabul qilingan buyurtmalar yo\'q'}</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = filtered.map(order => createOrderCard(order)).join('');
  
  container.querySelectorAll('.order-card').forEach(card => {
    card.addEventListener('click', () => openOrderModal(card.dataset.id));
  });
}

function createOrderCard(order) {
  const date = new Date(order.createdAt);
  const time = date.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  const itemsText = order.items?.map(i => `${i.name} x${i.qty}`).join(', ') || '';
  
  return `
    <div class="order-card ${order.status}" data-id="${order.firebaseKey}">
      <div class="order-header">
        <span class="order-id">#${order.firebaseKey.slice(-6)}</span>
        <span class="order-time">${time}</span>
      </div>
      <div class="order-customer">
        ${order.name || "Noma'lum"}
      </div>
      <div class="order-phone">+998 ${order.phone}</div>
      <div class="order-items-preview">${itemsText}</div>
      <div class="order-footer">
        <span class="order-total">${order.total?.toLocaleString()} so'm</span>
        <span class="order-status ${order.status}">${order.status === 'pending' ? 'Yangi' : 'Qabul qilindi'}</span>
      </div>
    </div>
  `;
}

// Customers
function renderCustomers() {
  const container = document.getElementById('customersList');
  const search = document.getElementById('customerSearch')?.value.toLowerCase() || '';
  
  const filtered = customers.filter(c => 
    c.name.toLowerCase().includes(search) || c.phone.includes(search)
  );
  
  document.getElementById('totalCustomers').textContent = customers.length;
  document.getElementById('vipCustomers').textContent = customers.filter(c => c.orders >= 5).length;
  
  const today = new Date().toDateString();
  const activeToday = customers.filter(c => new Date(c.lastOrder).toDateString() === today).length;
  document.getElementById('activeToday').textContent = activeToday;
  
  container.innerHTML = filtered.map((c, i) => `
    <div class="customer-item" onclick="viewCustomer('${c.phone}')">
      <div class="customer-avatar">${c.name.charAt(0).toUpperCase()}</div>
      <div class="customer-info">
        <div class="customer-name">${c.name}</div>
        <div class="customer-meta">
          <span>+998 ${c.phone}</span>
          ${c.orders >= 5 ? '<span class="customer-badge">VIP</span>' : ''}
        </div>
      </div>
      <div class="customer-spent">
        <span class="spent-amount">${(c.totalSpent/1000).toFixed(0)}k</span>
        <span class="spent-label">so'm</span>
      </div>
    </div>
  `).join('');
}

window.searchCustomers = function() {
  renderCustomers();
};

window.viewCustomer = function(phone) {
  const c = customers.find(x => x.phone === phone);
  const customerOrders = orders.filter(o => o.phone === phone).sort((a,b) => 
    new Date(b.createdAt) - new Date(a.createdAt)
  );
  
  const content = document.getElementById('customerDetailContent');
  content.innerHTML = `
    <div class="customer-info-card">
      <div class="info-row">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff6600" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <div class="info-content">
          <span class="info-label">Mijoz</span>
          <span class="info-value">${c.name}</span>
        </div>
      </div>
      <div class="info-row">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff6600" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        <div class="info-content">
          <span class="info-label">Telefon</span>
          <span class="info-value">+998 ${c.phone}</span>
        </div>
      </div>
    </div>
    <h4 style="margin: 20px 0 12px; color: #888; font-size: 14px; text-transform: uppercase;">Buyurtmalar tarixi (${customerOrders.length})</h4>
    <div style="display: flex; flex-direction: column; gap: 8px;">
      ${customerOrders.slice(0, 10).map(o => `
        <div style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 12px; border: 1px solid #333;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="font-weight: 600;">#${o.firebaseKey.slice(-6)}</span>
            <span style="color: #00ff88; font-weight: 700;">${o.total?.toLocaleString()} so'm</span>
          </div>
          <div style="font-size: 12px; color: #666;">
            ${new Date(o.createdAt).toLocaleDateString('uz-UZ')} • ${o.items?.length} ta mahsulot
          </div>
        </div>
      `).join('')}
    </div>
  `;
  
  document.getElementById('customerModal').classList.add('show');
};

window.closeCustomerModal = function() {
  document.getElementById('customerModal').classList.remove('show');
};

// Statistics
window.setPeriod = function(period) {
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  updateStats(period);
};

function updateStats(period = 'day') {
  const now = new Date();
  let startDate = new Date();
  
  if (period === 'day') startDate.setHours(0,0,0,0);
  else if (period === 'week') startDate.setDate(now.getDate() - 7);
  else if (period === 'month') startDate.setMonth(now.getMonth() - 1);
  
  const filtered = orders.filter(o => {
    const d = new Date(o.createdAt);
    return d >= startDate && d <= now && o.status === 'accepted';
  });
  
  const revenue = filtered.reduce((sum, o) => sum + (o.total || 0), 0);
  document.getElementById('statRevenue').textContent = (revenue/1000).toFixed(0) + 'k';
  document.getElementById('statOrders').textContent = filtered.length;
  
  const ctx = document.getElementById('mainChart');
  if (!ctx) return;
  
  if (chartInstance) chartInstance.destroy();
  
  const dailyData = {};
  filtered.forEach(o => {
    const d = new Date(o.createdAt).toLocaleDateString('uz-UZ', { weekday: 'short' });
    dailyData[d] = (dailyData[d] || 0) + o.total;
  });
  
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: Object.keys(dailyData),
      datasets: [{
        label: 'Daromad',
        data: Object.values(dailyData),
        borderColor: '#FFD700',
        backgroundColor: 'rgba(255, 215, 0, 0.1)',
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#FFD700',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { 
          grid: { color: 'rgba(212, 175, 55, 0.1)' }, 
          ticks: { 
            color: '#888',
            callback: function(value) { return (value/1000) + 'k'; }
          } 
        },
        x: { 
          grid: { display: false }, 
          ticks: { color: '#888' } 
        }
      }
    }
  });
  
  const productStats = {};
  filtered.forEach(o => {
    o.items?.forEach(i => {
      productStats[i.name] = (productStats[i.name] || 0) + i.qty;
    });
  });
  
  const sorted = Object.entries(productStats).sort((a,b) => b[1] - a[1]).slice(0, 5);
  
  document.getElementById('topProductsList').innerHTML = sorted.map((item, i) => `
    <div class="top-item">
      <div class="top-rank ${i < 3 ? ['gold', 'silver', 'bronze'][i] : ''}">${i + 1}</div>
      <div class="top-info">
        <div class="top-name">${item[0]}</div>
        <div class="top-count">${item[1]} ta sotildi</div>
      </div>
    </div>
  `).join('');
}

// Order Modal
window.openOrderModal = function(orderId) {
  const order = orders.find(o => o.firebaseKey === orderId);
  if (!order) return;
  
  currentOrderKey = orderId;
  document.getElementById('modalOrderId').textContent = orderId.slice(-6);
  document.getElementById('modalCustomer').textContent = order.name;
  document.getElementById('modalPhone').textContent = '+998 ' + order.phone;
  document.getElementById('modalTotal').textContent = order.total?.toLocaleString() + ' so\'m';
  
  const loc = document.getElementById('modalLocation');
  if (order.location?.includes(',')) {
    const [lat, lng] = order.location.split(',');
    loc.href = `https://maps.google.com/?q=${lat},${lng}`;
    loc.parentElement.parentElement.style.display = 'flex';
  } else {
    loc.parentElement.parentElement.style.display = 'none';
  }
  
  document.getElementById('modalPayment').textContent = (order.paymentMethod || 'Naqd').toUpperCase();
  
  document.getElementById('modalItems').innerHTML = order.items?.map(i => `
    <div class="item-row">
      <div class="item-info">
        <div class="item-name">${i.name}</div>
        <div class="item-qty">${i.qty} x ${i.price?.toLocaleString()} so'm</div>
      </div>
      <div class="item-price">${(i.qty * i.price).toLocaleString()} so'm</div>
    </div>
  `).join('');
  
  document.getElementById('modalActions').style.display = order.status === 'pending' ? 'flex' : 'none';
  document.getElementById('orderModal').classList.add('show');
};

window.closeModal = function() {
  document.getElementById('orderModal').classList.remove('show');
  currentOrderKey = null;
};

window.acceptOrder = async function() {
  if (!currentOrderKey) return;
  try {
    await update(ref(db, `orders/${currentOrderKey}`), {
      status: 'accepted',
      acceptedAt: new Date().toISOString()
    });
    showToast('✅ Qabul qilindi');
    closeModal();
  } catch (e) {
    showToast('❌ Xatolik');
  }
};

window.rejectOrder = async function() {
  if (!currentOrderKey || !confirm('Rostdan ham bekor qilmoqchimisiz?')) return;
  try {
    await update(ref(db, `orders/${currentOrderKey}`), {
      status: 'rejected',
      rejectedAt: new Date().toISOString()
    });
    showToast('❌ Bekor qilindi');
    closeModal();
  } catch (e) {
    showToast('❌ Xatolik');
  }
};

function playNotificationSound() {
  const audio = document.getElementById('notifySound');
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch(e => {});
  }
}

function showToast(msg) {
  const version = parseFloat(tg?.version || '6.0');
  
  if (version >= 6.0 && tg?.showAlert) {
    tg.showAlert(msg);
  } else {
    const div = document.createElement('div');
    div.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.9); color: white; padding: 16px 24px;
      border-radius: 12px; z-index: 9999; font-weight: 600;
      border: 1px solid #333;
    `;
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 2000);
  }
}

// Init
document.addEventListener('DOMContentLoaded', init);




