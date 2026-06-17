// Global variables
let cart = [];
let selectedItem = null;
let currentItems = [];   // item list loaded from Google Apps Script

// DOM elements
const wholesalerSelect = document.getElementById('wholesalerSelect');
const customerNameInput = document.getElementById('customerName');
const searchInput = document.getElementById('itemSearch');
const suggestionsGrid = document.getElementById('suggestionsGrid');
const suggestionsBody = document.getElementById('suggestionsBody');
const stockDisplay = document.getElementById('stockDisplay');
const qtyInput = document.getElementById('qty');
const freeInput = document.getElementById('free');
const addBtn = document.getElementById('addBtn');
const cartBody = document.getElementById('cartBody');
const submitBtn = document.getElementById('submitOrderBtn');
const clearCartBtn = document.getElementById('clearCartBtn');
const msgArea = document.getElementById('msgArea');

// 🔁 REPLACE THIS WITH YOUR GOOGLE APPS SCRIPT WEB APP URL
const APP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwPr0sL6eP3xnU7_vSAUAJYoY31zUeP145gGZHrn7wOCRtWRx1bx6dblreMYJ32nXAm/exec';

// Helper: show message
function showMessage(msg, isError = false) {
    msgArea.innerHTML = `<div class="message ${isError ? 'error' : 'success'}">${msg}</div>`;
    setTimeout(() => msgArea.innerHTML = '', 4000);
}

// Fetch items for the selected wholesaler
async function fetchItems(wholesalerId) {
    if (!wholesalerId) {
        currentItems = [];
        stockDisplay.innerHTML = '📊 Select a wholesaler first';
        return;
    }
    try {
        const url = `${APP_SCRIPT_URL}?wholesaler_id=${encodeURIComponent(wholesalerId)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Network error');
        const items = await response.json();
        if (!Array.isArray(items)) throw new Error('Invalid response');
        currentItems = items;
        stockDisplay.innerHTML = `📊 Loaded ${currentItems.length} items for ${wholesalerId}`;
        // Clear search
        searchInput.value = '';
        suggestionsGrid.style.display = 'none';
    } catch (err) {
        console.error(err);
        currentItems = [];
        stockDisplay.innerHTML = '❌ Failed to load items';
        showMessage('Error loading items: ' + err.message, true);
    }
}

// Search items (max 10)
function searchItems(term) {
    if (!term || term.length < 2) return [];
    const lowerTerm = term.toLowerCase();
    return currentItems
        .filter(item => 
            item.itemname.toLowerCase().includes(lowerTerm) || 
            item.itemcode.toString().includes(term)
        )
        .slice(0, 10);
}

// Render suggestions grid
function renderSuggestions(items) {
    suggestionsBody.innerHTML = '';
    if (items.length === 0) {
        suggestionsGrid.style.display = 'none';
        return;
    }
    items.forEach(item => {
        const row = suggestionsBody.insertRow();
        row.insertCell(0).textContent = item.itemcode;
        row.insertCell(1).textContent = item.itemname;
        row.insertCell(2).textContent = item.currentstock;
        row.addEventListener('click', () => selectItem(item));
    });
    suggestionsGrid.style.display = 'block';
}

function selectItem(item) {
    selectedItem = item;
    searchInput.value = `${item.itemname} (${item.itemcode})`;
    suggestionsGrid.style.display = 'none';
    stockDisplay.innerHTML = `📊 <strong>${item.itemname}</strong> | Stock: ${item.currentstock}`;
}

// Search as user types
searchInput.addEventListener('input', (e) => {
    const term = e.target.value;
    const matches = searchItems(term);
    renderSuggestions(matches);
});

// Hide suggestions when clicking outside
document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !suggestionsGrid.contains(e.target)) {
        suggestionsGrid.style.display = 'none';
    }
});

// Add to cart
function addToCart() {
    if (!selectedItem) { showMessage('Select an item first', true); return; }
    let qty = parseFloat(qtyInput.value);
    let free = parseFloat(freeInput.value);
    if (isNaN(qty)) qty = 0;
    if (isNaN(free)) free = 0;
    if (qty + free === 0) { showMessage('Qty or Free must be > 0', true); return; }
    if (qty > selectedItem.currentstock) { showMessage('Insufficient stock', true); return; }
    
    const existing = cart.find(i => i.itemcode === selectedItem.itemcode);
    if (existing) {
        existing.qty += qty;
        existing.free += free;
    } else {
        cart.push({
            itemcode: selectedItem.itemcode,
            itemname: selectedItem.itemname,
            qty: qty,
            free: free
        });
    }
    renderCart();
    qtyInput.value = '1';
    freeInput.value = '0';
    showMessage(`Added ${selectedItem.itemname}`);
    // Clear search after adding
    searchInput.value = '';
    selectedItem = null;
    stockDisplay.innerHTML = '📊 Select an item to see stock';
    suggestionsGrid.style.display = 'none';
}

// Render cart table
function renderCart() {
    if (cart.length === 0) {
        cartBody.innerHTML = '<tr><td colspan="5">No items added yet</td></tr>';
        return;
    }
    let html = '';
    cart.forEach((item, idx) => {
        html += <tr>
                    <td>${escapeHtml(item.itemname)}</td>
                    <td>${item.itemcode}</td>
                    <td>${item.qty}</td>
                    <td>${item.free}</td>
                    <td><button class="remove-btn" data-index="${idx}">Remove</button></td>
                 </tr>`;
    });
    cartBody.innerHTML = html;
    document.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(btn.dataset.index);
            cart.splice(idx, 1);
            renderCart();
        });
    });
}

function clearCart() { if (cart.length) { cart = []; renderCart(); showMessage('Cart cleared'); } }

// Submit order to Google Apps Script (POST)
async function submitOrder() {
    const wholesaler = wholesalerSelect.value;
    const customer = customerNameInput.value.trim();
    if (!wholesaler) { showMessage('Select a wholesaler', true); return; }
    if (!customer) { showMessage('Enter your name', true); return; }
    if (cart.length === 0) { showMessage('Cart is empty', true); return; }

    const orderData = {
        wholesaler_id: wholesaler,
        customer: customer,
        orderDate: new Date().toISOString(),
        items: cart.map(i => ({ itemcode: i.itemcode, qty: i.qty, free: i.free }))
    };

    try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';

        const response = await fetch(APP_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });

        const result = await response.json();

        if (result.success) {
            const orderId = result.orderId || 'N/A';
            showMessage(`✅ Order #${orderId} submitted! It will be processed soon.`);
            // Clear everything
            cart = [];
            renderCart();
            customerNameInput.value = '';
            searchInput.value = '';
            selectedItem = null;
            stockDisplay.innerHTML = '📊 Select an item to see stock';
            suggestionsGrid.style.display = 'none';
        } else {
            showMessage(`❌ Order failed: ${result.error || 'Unknown error'}`, true);
        }
    } catch (err) {
        console.error('Submit error:', err);
        showMessage('❌ Network error: ' + err.message, true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '✅ Submit Order';
    }
}
// When wholesaler changes, fetch items for that wholesaler
wholesalerSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val) {
        fetchItems(val);
        // Clear cart when switching wholesaler (optional)
        if (cart.length > 0) {
            if (confirm('Switching wholesaler will clear your cart. Continue?')) {
                cart = [];
                renderCart();
            } else {
                e.target.value = ''; // revert
            }
        }
    } else {
        currentItems = [];
        stockDisplay.innerHTML = '📊 Select a wholesaler first';
        searchInput.value = '';
        suggestionsGrid.style.display = 'none';
    }
});

addBtn.addEventListener('click', addToCart);
clearCartBtn.addEventListener('click', clearCart);
submitBtn.addEventListener('click', submitOrder);
