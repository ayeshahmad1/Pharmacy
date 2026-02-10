// src/pages/BillingPage.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './BillingPage.css';
import ReceiptPrint from '../components/ReceiptPrint';

/** ---- Popup print helper (opens system print dialog) ---- */
function openPrintWindow(html, { title = 'Print', width = 420, height = 700 } = {}) {
  const w = window.open('', '_blank', `width=${width},height=${height}`);
  if (!w) {
    alert('Popup blocked. Please allow popups for this site to print.');
    return;
  }
  const receiptStyles = `
    body { font-family: monospace; margin: 0; }
    .wrap { width: 58mm; padding: 8px; margin: 0 auto; }
    h3 { margin: 4px 0; font-size: 16px; text-align: center; }
    hr { border: none; border-top: 1px dashed #333; margin: 6px 0; }
    .row { border-bottom: 1px dotted #999; padding: 4px 0; }
    .right { text-align: right; }
    .center { text-align: center; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 2px 0; text-align: left; font-size: 12px; }
    .total { font-weight: bold; }
    @page { margin: 0; }
  `;
  w.document.open();
  w.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>${receiptStyles}</style>
</head>
<body>${html}</body>
</html>`);
  w.document.close();
  w.onload = () => {
    try { w.focus(); } catch {}
    try { w.print(); } catch {}
    w.onafterprint = () => { try { w.close(); } catch {} };
  };
}

function BillingPage() {
  const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  const navigate = useNavigate();

  // POS state
  const [medicines, setMedicines] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [discount, setDiscount] = useState(0);
  const [amountReceived, setAmountReceived] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const receiptRef = useRef();

  // End Day state
  const [endDayDate, setEndDayDate] = useState(() => {
    const dt = new Date();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${dt.getFullYear()}-${mm}-${dd}`;
  });
  const [endDayOpen, setEndDayOpen] = useState(false);
  const [daySummary, setDaySummary] = useState(null);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [inventorySearch, setInventorySearch] = useState('');

  // Auth guard
  useEffect(() => {
    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) {
        alert('Access denied: Cashiers only');
        navigate('/');
        return;
      }
      const user = JSON.parse(userStr);
      if (!user || user.role !== 'cashier') {
        alert('Access denied: Cashiers only');
        navigate('/');
      }
    } catch (err) {
      console.error('Error parsing user from localStorage:', err);
      navigate('/');
    }
  }, [navigate]);

  // Load medicines
  useEffect(() => {
    axios.get(`${API}/medicines`)
      .then(res => setMedicines(res.data))
      .catch(err => console.error('Error fetching medicines:', err));
  }, [API]);

  // Filter medicines based on search text
  const filteredMedicines = medicines.filter(med =>
    med.name.toLowerCase().includes(searchText.toLowerCase())
  ).slice(0, 10); // Limit to 10 suggestions

  // Handle medicine selection from dropdown
  const handleMedicineSelect = (medName) => {
    setSearchText(medName);
    setShowSuggestions(false);
  };

  // Add to cart
  const handleAddToCart = () => {
    const med = medicines.find(m => m.name.toLowerCase() === searchText.toLowerCase());
    if (!med || quantity <= 0) return;

    const existing = cart.find(i => i._id === med._id);
    const already = existing ? existing.quantity : 0;
    if (quantity + already > med.quantity) {
      alert(`Only ${med.quantity - already} more units of ${med.name} are available.`);
      return;
    }

    if (existing) {
      setCart(cart.map(i => i._id === med._id
        ? { ...i, quantity: i.quantity + quantity, total: (i.quantity + quantity) * i.price }
        : i
      ));
    } else {
      setCart([...cart, {
        _id: med._id, name: med.name, price: med.price,
        quantity, total: med.price * quantity
      }]);
    }

    setQuantity(1);
    setSearchText('');
    setShowSuggestions(false);
  };

  const handleRemoveItem = (id) => setCart(cart.filter(i => i._id !== id));

  // Totals
  const total = cart.reduce((acc, item) => acc + item.total, 0);
  const netTotal = Math.max(total - discount, 0);
  const changeDue = Math.max(amountReceived - netTotal, 0);

  // Discount guard (10%)
  const handleDiscountChange = (e) => {
    const value = Number(e.target.value);
    const max = total * 0.1;
    if (value > max) {
      alert(`Discount cannot exceed 10% of total (Rs. ${max.toFixed(2)}).`);
      setDiscount(max);
    } else {
      setDiscount(Math.max(0, value));
    }
  };

  /** Print ONLY the current receipt (single sale) in a popup */
  const printCurrentReceipt = () => {
    if (!receiptRef.current) return;
    // Use the rendered receipt HTML and wrap it with our minimal styles
    const html = `<div class="wrap">${receiptRef.current.outerHTML}</div>`;
    openPrintWindow(html, { title: 'Receipt', width: 420, height: 700 });
  };

  // Helper function to update local medicine quantities (for offline/fallback)
  const updateLocalMedicines = (cartItems) => {
    setMedicines((prevMedicines) => {
      return prevMedicines.map((med) => {
        const cartItem = cartItems.find((item) => item._id === med._id);
        if (cartItem) {
          const newQty = Math.max(0, (med.quantity || 0) - cartItem.quantity);
          return { ...med, quantity: newQty };
        }
        return med;
      });
    });
  };

  // Checkout flow
  const handleCheckout = async () => {
    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) {
        alert('User not found. Please login again.');
        navigate('/');
        return;
      }
      const user = JSON.parse(userStr);
      
      if (cart.length === 0) return;
      if (amountReceived < netTotal) {
        alert('Amount received is less than the net total.');
        return;
      }

      // Store cart items before clearing (for local deduction if needed)
      const cartItems = [...cart];
      
      try {
        // Attempt to create sale via API
        await axios.post(`${API}/sales`, {
          items: cart.map(({ _id, quantity, price }) => ({ medicineId: _id, quantity, price })),
          totalPrice: netTotal,
          cashierId: user._id
        });

        alert('Sale completed!');
        
        // Update local medicines immediately (optimistic update)
        updateLocalMedicines(cartItems);

        // Try to refresh from server (but don't fail if it doesn't work)
        try {
          const res = await axios.get(`${API}/medicines`);
          setMedicines(res.data);
        } catch (refreshErr) {
          console.warn('Could not refresh medicines from server, using local deduction:', refreshErr);
          // Local deduction already applied, continue with sale
        }

        // Print in popup (with system dialog), then reset cart
        printCurrentReceipt();
        setCart([]);
        setDiscount(0);
        setAmountReceived(0);
        setCustomerName('');
      } catch (saleErr) {
        // If sale API fails, still apply local deduction as fallback
        const errorMsg = saleErr?.response?.data?.error || saleErr.message || 'Unknown error';
        const isNetworkError = !saleErr?.response; // Network error (no response)
        const isServerError = saleErr?.response?.status >= 500; // Server error
        
        if (isNetworkError || isServerError) {
          // Database/server not responding - apply local deduction
          console.warn('Database not responding, applying local deduction:', errorMsg);
          updateLocalMedicines(cartItems);
          
          alert(`Sale completed locally! Inventory updated. Warning: Could not save to database. Error: ${errorMsg}`);
          
          // Print receipt and reset
          printCurrentReceipt();
          setCart([]);
          setDiscount(0);
          setAmountReceived(0);
          setCustomerName('');
          
          // Try to sync later in background
          setTimeout(async () => {
            try {
              await axios.post(`${API}/sales`, {
                items: cartItems.map(({ _id, quantity, price }) => ({ medicineId: _id, quantity, price })),
                totalPrice: netTotal,
                cashierId: user._id
              });
              console.log('Sale synced to database successfully');
            } catch (retryErr) {
              console.error('Failed to sync sale to database:', retryErr);
            }
          }, 2000);
        } else {
          // Client error (validation, insufficient stock, etc.) - don't apply local deduction
          throw saleErr;
        }
      }
    } catch (err) {
      console.error('Error submitting sale:', err);
      const errorMsg = err?.response?.data?.error || err.message || 'Unknown error';
      alert('Error submitting sale: ' + errorMsg);
    }
  };

  /** ===== End Day: fetch/print/delete by date ===== */
  const handleFetchDay = async () => {
    try {
      const res = await axios.get(`${API}/sales/by-date`, { params: { date: endDayDate } });
      setDaySummary(res.data); // { date, count, total, sales: [...] }
      setEndDayOpen(true);
    } catch (err) {
      console.error('Fetch day error:', err?.response?.data || err.message);
      alert(err?.response?.data?.error || 'Failed to fetch sales for that day');
    }
  };

  const handleDeleteDay = async () => {
    if (!window.confirm(`Delete ALL sales for ${endDayDate}? This cannot be undone.`)) return;
    try {
      const res = await axios.post(`${API}/sales/close-day`, { date: endDayDate });
      setDaySummary(res.data);
      alert(`Deleted ${res.data.count} sale(s) for ${endDayDate}.`);
    } catch (err) {
      console.error('Delete day error:', err?.response?.data || err.message);
      alert(err?.response?.data?.error || 'Failed to delete sales for that day');
    }
  };

  // Helper function to format date/time in GMT+5
  const formatGMT5 = (date) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleString('en-US', {
      timeZone: 'Asia/Karachi', // GMT+5
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  const formatDateGMT5 = (date) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('en-US', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const formatTimeGMT5 = (date) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Karachi',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  /** Print End‑of‑Day summary in a popup (long receipt) */
  const printDaySummary = () => {
    if (!daySummary) return;
    const html = `
      <div class="wrap">
        <h3>End of Day Summary</h3>
        <div class="center">Date: ${formatDateGMT5(daySummary.date)}</div>
        <hr/>
        ${daySummary.sales.map((s, idx) => `
          <div class="row">
            <div><strong>${idx + 1}</strong> — ${formatTimeGMT5(s.createdAt)} — ${s.cashierId?.name || 'N/A'}</div>
            ${s.items.map(it => `
              <div>${it.medicineId?.name || 'Item'} ×${it.quantity} @ Rs.${it.price}</div>
            `).join('')}
            <div class="right total">Rs.${Number(s.totalPrice || 0).toFixed(2)}</div>
          </div>
        `).join('')}
        <hr/>
        <div class="center total">Total Sales: Rs.${Number(daySummary.total || 0).toFixed(2)}</div>
      </div>
    `;
    openPrintWindow(html, { title: 'End of Day', width: 420, height: 900 });
  };

  return (
    <div className="billing-wrapper">
      {/* LEFT: cart */}
      <div className="billing-left">
        <h2>Cashier Billing</h2>
        <div className="form-section">
          <div style={{ position: 'relative', width: '100%', maxWidth: '600px' }}>
            <input
              type="text"
              placeholder="Type medicine name to search..."
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setShowSuggestions(e.target.value.length > 0);
              }}
              onFocus={() => {
                if (searchText.length > 0) {
                  setShowSuggestions(true);
                }
              }}
              onBlur={() => {
                // Delay hiding suggestions to allow click on suggestion
                setTimeout(() => setShowSuggestions(false), 200);
              }}
              className="medicine-search-input"
              style={{ width: '100%', padding: '10px', fontSize: '15px' }}
            />
            {showSuggestions && filteredMedicines.length > 0 && (
              <div className="medicine-suggestions">
                {filteredMedicines.map((med) => (
                  <div
                    key={med._id}
                    className="medicine-suggestion-item"
                    onClick={() => handleMedicineSelect(med.name)}
                    style={{
                      padding: '10px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #eee',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <span style={{ fontWeight: '500' }}>{med.name}</span>
                    <span style={{ 
                      color: med.quantity < 50 ? '#dc3545' : '#28a745',
                      fontWeight: 'bold',
                      marginLeft: '10px'
                    }}>
                      Stock: {med.quantity}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value))}
            min={1}
            style={{ minWidth: '100px' }}
          />
          <button onClick={handleAddToCart}>Add to Cart</button>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th><th>Name</th><th>Price</th><th>Qty</th><th>Total</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {cart.map((item, index) => (
              <tr key={item._id}>
                <td>{index + 1}</td>
                <td>{item.name}</td>
                <td>Rs.{item.price}</td>
                <td>{item.quantity}</td>
                <td>Rs.{item.total}</td>
                <td><button onClick={() => handleRemoveItem(item._id)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* RIGHT: summary + end day */}
      <div className="billing-right">
        <h3>Summary</h3>
        
        <label>Customer Name</label>
        <input
          type="text"
          placeholder="Enter customer name"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          className="discount-input"
        />

        <p>Total: Rs.{total.toFixed(2)}</p>

        <label>Discount (Rs.)</label>
        <input
          type="number"
          value={discount}
          onChange={handleDiscountChange}
          min={0}
          className="discount-input"
        />
        <p>Net Total: Rs.{netTotal.toFixed(2)}</p>

        <label>Amount Received (Rs.)</label>
        <input
          type="number"
          value={amountReceived}
          onChange={(e) => setAmountReceived(Number(e.target.value))}
          min={0}
          className="discount-input"
        />
        <p>Change Due: Rs.{changeDue.toFixed(2)}</p>

        <button onClick={handleCheckout} disabled={cart.length === 0 || amountReceived < netTotal}>
          Checkout
        </button>

        {/* View Inventory button */}
        <button
          onClick={() => setInventoryOpen(true)}
          style={{ backgroundColor: '#17a2b8', marginTop: 8 }}
          title="View current inventory"
        >
          View Inventory
        </button>

        {/* End Day controls */}
        <label style={{ marginTop: 8 }}>Select Day</label>
        <input
          type="date"
          value={endDayDate}
          onChange={(e) => setEndDayDate(e.target.value)}
          className="discount-input"
        />
        <button
          onClick={handleFetchDay}
          style={{ backgroundColor: '#6c757d' }}
          title="Show all sales and total for the selected day; print and/or delete"
        >
          End Day
        </button>

        {/* Hidden (on-screen) receipt for single sale — used to build print HTML */}
        <div>
          <ReceiptPrint
            ref={receiptRef}
            cart={cart}
            total={total}
            discount={discount}
            netTotal={netTotal}
            amountReceived={amountReceived}
            changeDue={changeDue}
            customerName={customerName}
          />
        </div>
      </div>

      {/* Inventory modal */}
      {inventoryOpen && (
        <div className="modal-overlay" onClick={() => setInventoryOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Current Inventory</h3>
            
            {/* Search Bar */}
            <input
              type="text"
              placeholder="Search by name, type, batch, or supplier..."
              value={inventorySearch}
              onChange={(e) => setInventorySearch(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                marginBottom: '15px',
                fontSize: '14px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                boxSizing: 'border-box'
              }}
            />

            <div style={{ maxHeight: '70vh', overflow: 'auto', margin: '10px 0' }}>
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>Name</th><th>Type</th><th>Batch</th><th>Expiry</th><th>Qty</th><th>Price</th><th>Supplier</th>
                  </tr>
                </thead>
                <tbody>
                  {medicines
                    .filter((med) => {
                      const searchTerm = (inventorySearch || '').toLowerCase().trim();
                      if (!searchTerm) return true;
                      
                      const name = (med.name || '').toLowerCase();
                      const type = (med.type || '').toLowerCase();
                      const batch = (med.batchNo || '').toLowerCase();
                      const supplier = (med.supplier || '').toLowerCase();
                      
                      return name.includes(searchTerm) || 
                             type.includes(searchTerm) || 
                             batch.includes(searchTerm) || 
                             supplier.includes(searchTerm);
                    })
                    .map((med) => (
                      <tr 
                        key={med._id}
                        className={med.quantity < 50 ? 'low-stock' : ''}
                      >
                        <td>{med.name}</td>
                        <td>{med.type}</td>
                        <td>{med.batchNo}</td>
                        <td>{med.expiryDate?.slice(0, 10) || 'N/A'}</td>
                        <td style={{ fontWeight: med.quantity < 50 ? 'bold' : 'normal' }}>{med.quantity}</td>
                        <td>Rs.{med.price}</td>
                        <td>{med.supplier}</td>
                      </tr>
                    ))}
                  {medicines.filter((med) => {
                    const searchTerm = (inventorySearch || '').toLowerCase().trim();
                    if (!searchTerm) return false;
                    const name = (med.name || '').toLowerCase();
                    const type = (med.type || '').toLowerCase();
                    const batch = (med.batchNo || '').toLowerCase();
                    const supplier = (med.supplier || '').toLowerCase();
                    return name.includes(searchTerm) || 
                           type.includes(searchTerm) || 
                           batch.includes(searchTerm) || 
                           supplier.includes(searchTerm);
                  }).length === 0 && inventorySearch.trim() !== '' && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                        No medicines found matching "{inventorySearch}"
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: '10px' }}>
              <button onClick={() => {
                setInventoryOpen(false);
                setInventorySearch('');
              }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* End Day modal */}
      {endDayOpen && daySummary && (
        <div className="modal-overlay" onClick={() => setEndDayOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>End of Day — {formatDateGMT5(daySummary.date)}</h3>
            <p><strong>Sales count:</strong> {daySummary.count}</p>
            <p><strong>Total sales:</strong> Rs.{Number(daySummary.total || 0).toFixed(2)}</p>

            <div style={{ maxHeight: 320, overflow: 'auto', textAlign: 'left', margin: '10px 0' }}>
              {daySummary.sales.map((s, idx) => (
                <div key={s._id} style={{ borderBottom: '1px dashed #ccc', padding: '6px 0' }}>
                  <div><strong>#{idx + 1}</strong> — {formatTimeGMT5(s.createdAt)} — {s.cashierId?.name || 'N/A'}</div>
                  <div>
                    {s.items.map((it, i) => (
                      <div key={i}>
                        {(it.medicineId?.name || 'Item')} ×{it.quantity} @ Rs.{it.price}
                      </div>
                    ))}
                  </div>
                  <div><strong>Sale total:</strong> Rs.{Number(s.totalPrice || 0).toFixed(2)}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={printDaySummary}>Print Summary</button>
              <button onClick={handleDeleteDay} style={{ backgroundColor: '#dc3545' }}>
                Delete These Sales
              </button>
              <button onClick={() => setEndDayOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BillingPage;
