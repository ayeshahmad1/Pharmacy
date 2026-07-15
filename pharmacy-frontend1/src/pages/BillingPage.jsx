// src/pages/BillingPage.jsx
import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './BillingPage.css';
import ReceiptPrint from '../components/ReceiptPrint';

/** Builds the full printable HTML document (styles + body) for a receipt. */
function buildReceiptDoc(bodyHtml, title = 'Print') {
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
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>${receiptStyles}</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

/**
 * Print helper. In the Electron desktop app it prints via the native IPC pipeline
 * (window.open is blocked there, which is why printing used to fail). In a plain
 * browser it falls back to a popup window + window.print().
 */
function openPrintWindow(bodyHtml, { title = 'Print', width = 420, height = 700 } = {}) {
  const fullDoc = buildReceiptDoc(bodyHtml, title);

  // Electron desktop app → native print.
  if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.printHTML) {
    window.electronAPI.printHTML(fullDoc)
      .then((res) => {
        if (res && res.success === false && res.reason && !/cancel/i.test(res.reason)) {
          alert('Printing failed: ' + res.reason);
        }
      })
      .catch((err) => alert('Printing failed: ' + (err?.message || err)));
    return;
  }

  // Browser fallback.
  const w = window.open('', '_blank', `width=${width},height=${height}`);
  if (!w) {
    alert('Popup blocked. Please allow popups for this site to print.');
    return;
  }
  w.document.open();
  w.document.write(fullDoc);
  w.document.close();
  w.onload = () => {
    try { w.focus(); } catch {}
    try { w.print(); } catch {}
    w.onafterprint = () => { try { w.close(); } catch {} };
  };
}

/**
 * Runs an axios request with automatic retries for TRANSIENT failures only
 * (network error / timeout / HTTP 5xx). Client errors (4xx) are NOT retried.
 * Safe for sale POSTs because the payload carries a stable idempotency key —
 * a retry that actually reached the server returns the same sale, never a duplicate.
 */
async function withRetry(makeRequest, { retries = 3, baseDelayMs = 700 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await makeRequest();
    } catch (err) {
      lastErr = err;
      const retriable = !err?.response || err.response.status >= 500;
      if (!retriable || attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
    }
  }
  throw lastErr;
}

/** Unit price on saved sale lines: discounted (what customer pays) → original → legacy `price`. */
function saleItemUnitPrice(it) {
  const p = it.discountedPrice ?? it.originalPrice ?? it.price;
  if (p == null || p === '') return null;
  const n = Number(p);
  return Number.isFinite(n) ? n.toFixed(2) : null;
}

/** Sale or return total from DB: prefer netTotal, then legacy totalPrice. */
function saleReceiptTotal(s) {
  const n = Number(s.netTotal ?? s.totalPrice ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function BillingPage() {
  const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  const navigate = useNavigate();

  // POS state
  const [medicines, setMedicines] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [selectedMedicineId, setSelectedMedicineId] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [discount, setDiscount] = useState(0);
  const [amountReceived, setAmountReceived] = useState(0);
  const [customerName, setCustomerName] = useState('');
  // Return state
  const [returnPasswordModalOpen, setReturnPasswordModalOpen] = useState(false);
  const [returnPassword, setReturnPassword] = useState('');
  const [returnPasswordError, setReturnPasswordError] = useState('');
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnMode, setReturnMode] = useState('bill'); // 'bill' | 'manual'
  const [billNumberInput, setBillNumberInput] = useState('');
  const [fetchedBill, setFetchedBill] = useState(null);
  const [billReturnQtys, setBillReturnQtys] = useState({});
  const [returnCart, setReturnCart] = useState([]);
  const [returnSearch, setReturnSearch] = useState('');
  const [returnSelectedMedicineId, setReturnSelectedMedicineId] = useState(null);
  const [returnQuantity, setReturnQuantity] = useState(1);
  const [returnUnitPrice, setReturnUnitPrice] = useState('');
  const [receiptBillNumber, setReceiptBillNumber] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [returnShowSuggestions, setReturnShowSuggestions] = useState(false);
  const receiptRef = useRef();
  const returnSubmittingRef = useRef(false);
  // Prevents a rapid double-click (or Enter-key repeat) from firing two sales,
  // each with a different idempotency key, which would deduct stock twice.
  const checkoutSubmittingRef = useRef(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  // Stable idempotency key for the current cart. Kept across retries so that if a
  // failed request actually did reach the server, retrying returns that same sale
  // instead of creating a duplicate. Reset on success and whenever the cart changes.
  const checkoutKeyRef = useRef(null);

  // Return password (can be set via environment variable or use default)
  const RETURN_PASSWORD = import.meta.env.VITE_RETURN_PASSWORD || 'return123';

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

  // Load medicines (retry transient failures so the till populates even on a shaky link)
  useEffect(() => {
    withRetry(() => axios.get(`${API}/medicines`, { timeout: 12000 }))
      .then(res => setMedicines(res.data))
      .catch(err => console.error('Error fetching medicines:', err));
  }, [API]);

  // Filter medicines based on search text
  const filteredMedicines = medicines.filter(med =>
    med.name.toLowerCase().includes(searchText.toLowerCase())
  ).slice(0, 10); // Limit to 10 suggestions

  // Handle medicine selection from dropdown
  const handleMedicineSelect = (med) => {
    setSearchText(med.name);
    setSelectedMedicineId(med._id);
    setShowSuggestions(false);
  };

  const returnFilteredMedicines = medicines.filter(med =>
    med.name.toLowerCase().includes(returnSearch.toLowerCase())
  ).slice(0, 10);

  const handleReturnMedicineSelect = (med) => {
    setReturnSearch(med.name);
    setReturnSelectedMedicineId(med._id);
    setReturnShowSuggestions(false);
  };

  // Add to cart
  const handleAddToCart = () => {
  let med = null;
  if (selectedMedicineId) {
    med = medicines.find(m => m._id === selectedMedicineId);
  }
  if (!med || med.name.toLowerCase() !== searchText.toLowerCase()) {
    med = medicines.find(
      m => m.name.toLowerCase() === searchText.toLowerCase()
    );
  }
  if (!med || quantity <= 0) return;

  const existing = cart.find(i => i._id === med._id);
  const alreadyQty = existing?.quantity || 0;

  if (quantity + alreadyQty > med.quantity) {
    alert(`Only ${med.quantity - alreadyQty} more units of ${med.name} available.`);
    return;
  }

  if (existing) {
    setCart(cart.map(i =>
      i._id === med._id
        ? {
            ...i,
            quantity: i.quantity + quantity,
            total: (i.quantity + quantity) * i.price
          }
        : i
    ));
  } else {
    setCart([
      ...cart,
      {
        _id: med._id,
        name: med.name,
        price: med.price,
        quantity,
        total: med.price * quantity
      }
    ]);
  }

  setQuantity(1);
  setSearchText('');
  setShowSuggestions(false);
  // Cart changed → this is a new logical sale; mint a fresh idempotency key.
  checkoutKeyRef.current = null;
};


  const handleRemoveItem = (id) => {
    setCart(cart.filter(i => i._id !== id));
    checkoutKeyRef.current = null;
  };

  // Return password verification
  const handleReturnPasswordSubmit = (e) => {
    e.preventDefault();
    if (returnPassword === RETURN_PASSWORD) {
      setReturnPasswordError('');
      setReturnPassword('');
      setReturnPasswordModalOpen(false);
      setReturnMode('bill');
      setBillNumberInput('');
      setFetchedBill(null);
      setBillReturnQtys({});
      setReturnCart([]);
      setReturnSearch('');
      setReturnQuantity(1);
      setReturnUnitPrice('');
      setReturnModalOpen(true);
    } else {
      setReturnPasswordError('Incorrect password. Please try again.');
      setReturnPassword('');
    }
  };

  // Return cart handlers (manual mode – staff enters refund unit price)
  const handleAddToReturnCart = () => {
    let med = null;
    if (returnSelectedMedicineId) {
      med = medicines.find(m => m._id === returnSelectedMedicineId);
    }
    if (!med || med.name.toLowerCase() !== returnSearch.toLowerCase()) {
      med = medicines.find(
        m => m.name.toLowerCase() === returnSearch.toLowerCase()
      );
    }
    if (!med) {
      alert('Please select a valid medicine.');
      return;
    }
    if (!returnQuantity || returnQuantity <= 0) {
      alert('Return quantity must be greater than 0.');
      return;
    }
    const unitPrice = Number(returnUnitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      alert('Enter the refund amount per unit (Rs.) for this line.');
      return;
    }

    const existing = returnCart.find(i => i._id === med._id);
    if (existing) {
      setReturnCart(returnCart.map(i =>
        i._id === med._id
          ? {
              ...i,
              quantity: i.quantity + returnQuantity,
              unitPrice,
              lineTotal: unitPrice * (i.quantity + returnQuantity)
            }
          : i
      ));
    } else {
      setReturnCart([
        ...returnCart,
        {
          _id: med._id,
          name: med.name,
          unitPrice,
          quantity: returnQuantity,
          lineTotal: unitPrice * returnQuantity
        }
      ]);
    }

    setReturnSearch('');
    setReturnQuantity(1);
    setReturnUnitPrice('');
  };

  const handleFetchBill = async () => {
    const n = billNumberInput.trim();
    if (!n) {
      alert('Enter the bill number from the receipt.');
      return;
    }
    try {
      const res = await axios.get(`${API}/sales/bill/${encodeURIComponent(n)}`);
      setFetchedBill(res.data);
      setBillReturnQtys({});
    } catch (err) {
      setFetchedBill(null);
      alert(err?.response?.data?.error || err.message || 'Could not load bill');
    }
  };

  const handleRemoveReturnItem = (id) => {
    setReturnCart(returnCart.filter(i => i._id !== id));
  };

  const closeReturnModal = () => {
    setReturnModalOpen(false);
    setReturnMode('bill');
    setBillNumberInput('');
    setFetchedBill(null);
    setBillReturnQtys({});
    setReturnCart([]);
    setReturnSearch('');
    setReturnQuantity(1);
    setReturnUnitPrice('');
  };

  const handleReturn = async () => {
    if (returnSubmittingRef.current) return;
    returnSubmittingRef.current = true;
    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) {
        alert('User not found. Please login again.');
        navigate('/');
        return;
      }
      const user = JSON.parse(userStr);

      if (returnMode === 'bill') {
        if (!fetchedBill) {
          alert('Load a bill first.');
          return;
        }
        const items = fetchedBill.lines
          .map((line) => ({
            medicineId: line.medicineId,
            quantity: Number(billReturnQtys[line.medicineId] || 0)
          }))
          .filter((row) => row.quantity > 0);

        if (items.length === 0) {
          alert('Enter a return quantity for at least one line.');
          return;
        }

        await axios.post(`${API}/sales/return`, {
          billNumber: fetchedBill.billNumber,
          items,
          cashierId: user._id
        });

        alert('Return recorded from bill.');

        setMedicines((prev) =>
          prev.map((med) => {
            const row = items.find((x) => String(x.medicineId) === String(med._id));
            return row
              ? { ...med, quantity: (med.quantity || 0) + row.quantity }
              : med;
          })
        );
      } else {
        if (returnCart.length === 0) {
          alert('Return cart is empty.');
          return;
        }

        await axios.post(`${API}/sales/return`, {
          items: returnCart.map(({ _id, quantity, unitPrice }) => ({
            medicineId: _id,
            quantity,
            unitPrice
          })),
          cashierId: user._id
        });

        alert('Manual return recorded.');

        setMedicines((prevMedicines) =>
          prevMedicines.map((med) => {
            const returnedItem = returnCart.find((item) => item._id === med._id);
            if (returnedItem) {
              return { ...med, quantity: (med.quantity || 0) + returnedItem.quantity };
            }
            return med;
          })
        );
      }

      try {
        const res = await axios.get(`${API}/medicines`);
        setMedicines(res.data);
      } catch (refreshErr) {
        console.warn('Could not refresh medicines from server after return:', refreshErr);
      }

      closeReturnModal();
    } catch (err) {
      console.error('Error processing return:', err);
      alert('Error processing return: ' + (err?.response?.data?.error || err.message));
    } finally {
      returnSubmittingRef.current = false;
    }
  };

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
  // Re-entrancy guard: ignore additional clicks while a sale is already in flight.
  if (checkoutSubmittingRef.current) return;
  checkoutSubmittingRef.current = true;
  setIsCheckingOut(true);
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

    // Snapshot the cart/discount before any state resets.
    const cartItems = [...cart];
    const savedDiscount = discount;
    // Stable idempotency key: reused across retries of THIS cart so a retry can
    // never create a duplicate sale. A new key is minted only once per cart.
    if (!checkoutKeyRef.current) {
      checkoutKeyRef.current = `sale_${user._id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    const idempotencyKey = checkoutKeyRef.current;

    try {
      // Attempt to create sale via API. Transient blips (network/timeout/5xx) are
      // retried automatically with the SAME idempotency key, so a brief Atlas hiccup
      // recovers silently instead of interrupting the cashier — and cannot duplicate.
      const saleRes = await withRetry(() => axios.post(`${API}/sales`, {
        items: cartItems.map(({ _id, quantity }) => ({ medicineId: _id, quantity })),
        orderDiscountRs: savedDiscount,
        cashierId: user._id,
        idempotencyKey,
      }, { timeout: 15000 }));

      // Update local medicines immediately (optimistic update)
      updateLocalMedicines(cartItems);

      // Try to refresh from server (but don't fail if it doesn't work)
      try {
        const res = await withRetry(() => axios.get(`${API}/medicines`, { timeout: 12000 }));
        setMedicines(res.data);
      } catch (refreshErr) {
        console.warn('Could not refresh medicines from server, using local deduction:', refreshErr);
      }

      const bn = saleRes.data?.billNumber || '';
      flushSync(() => setReceiptBillNumber(bn));
      printCurrentReceipt();
      flushSync(() => setReceiptBillNumber(''));

      setCart([]);
      setDiscount(0);
      setAmountReceived(0);
      setCustomerName('');
      // Sale is safely persisted — retire this cart's idempotency key.
      checkoutKeyRef.current = null;
      alert(bn ? `Sale completed! Bill: ${bn}` : 'Sale completed!');

    } catch (saleErr) {
      // The sale did NOT complete. Whether the server was unreachable, timed out,
      // or returned an error, we must NOT pretend it succeeded: no stock is
      // deducted, no receipt is printed, and the cart is left intact so the
      // cashier can simply press Checkout again. The idempotency key is kept,
      // so a retry cannot create a duplicate if the request did reach the server.
      const isConnectionError = !saleErr?.response || saleErr?.response?.status >= 500;
      const detail = saleErr?.response?.data?.error || saleErr?.message || 'Unknown error';

      if (isConnectionError) {
        console.error('Sale not saved (server unreachable / error):', detail);
        alert(
          'Sale NOT saved — could not reach the server.\n\n' +
          'Nothing was charged and no stock was deducted.\n' +
          'Check the internet/database connection and press Checkout again.\n\n' +
          `Details: ${detail}`
        );
        return; // keep cart, discount and amount received for a clean retry
      }

      // Validation / insufficient-stock / other client errors.
      console.error('Sale rejected:', detail);
      alert('Sale NOT saved: ' + detail + '\nNo stock was deducted. Please review the cart and try again.');
      return;
    }
  } catch (err) {
    console.error('Error submitting sale:', err);
    const errorMsg = err?.response?.data?.error || err.message || 'Unknown error';
    alert('Error submitting sale: ' + errorMsg);
  } finally {
    // Release the guard once the sale attempt has fully settled.
    checkoutSubmittingRef.current = false;
    setIsCheckingOut(false);
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
            <div><strong>${idx + 1}</strong> — ${formatTimeGMT5(s.createdAt)} — ${s.cashierId?.name || 'N/A'}${s.billNumber ? ` — Bill ${s.billNumber}` : ''}${s.isReturn ? ' (RETURN)' : ''}</div>
            ${s.items.map(it => `
              <div>${it.medicineId?.name || 'Item'} ×${it.quantity} @ Rs.${saleItemUnitPrice(it) ?? '0.00'}</div>
            `).join('')}
            <div class="right total">Sale total: Rs.${saleReceiptTotal(s).toFixed(2)}</div>
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
      {/* Corner Return Button */}
      <button
        onClick={() => setReturnPasswordModalOpen(true)}
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: '#dc3545',
          color: 'white',
          border: 'none',
          borderRadius: '50%',
          width: '60px',
          height: '60px',
          fontSize: '24px',
          fontWeight: 'bold',
          cursor: 'pointer',
          boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
          zIndex: 999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.2s, box-shadow 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.1)';
          e.currentTarget.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.4)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
        }}
        title="Return Medicine"
      >
        ↶
      </button>

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
                setSelectedMedicineId(null);
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
                    onClick={() => handleMedicineSelect(med)}
                    style={{
                      padding: '10px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #eee',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: '500' }}>{med.name}</span>
                      <span style={{ fontSize: '12px', color: '#666' }}>
                        {med.type && `${med.type} `}{med.batchNo && `| Batch: ${med.batchNo}`}
                      </span>
                    </div>
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
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setQuantity(Number.isNaN(v) ? 1 : Math.max(1, v));
            }}
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
        <p className="billing-total-line">Net Total: Rs.{netTotal.toFixed(2)}</p>

        <label>Amount Received (Rs.)</label>
        <input
          type="number"
          value={amountReceived}
          onChange={(e) => setAmountReceived(Number(e.target.value))}
          min={0}
          className="discount-input"
        />
        <p>Change Due: Rs.{changeDue.toFixed(2)}</p>

        <button onClick={handleCheckout} disabled={cart.length === 0 || amountReceived < netTotal || isCheckingOut}>
          {isCheckingOut ? 'Processing…' : 'Checkout'}
        </button>

        {/* View Inventory button */}
        <button
          onClick={() => setInventoryOpen(true)}
          style={{ backgroundColor: '#0891b2' }}
          title="View current inventory"
        >
          View Inventory
        </button>

        {/* End Day controls */}
        <label>Select Day</label>
        <input
          type="date"
          value={endDayDate}
          onChange={(e) => setEndDayDate(e.target.value)}
          className="discount-input"
        />
        <button
          onClick={handleFetchDay}
          style={{ backgroundColor: '#4b5563' }}
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
            billNumber={receiptBillNumber}
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
                  <div>
                    <strong>#{idx + 1}</strong> — {formatTimeGMT5(s.createdAt)} —{' '}
                    {s.cashierId?.name || 'N/A'}
                    {s.billNumber && (
                      <span style={{ color: '#1565c0' }}> — Bill {s.billNumber}</span>
                    )}
                    {s.isReturn && (
                      <span style={{ color: '#c62828', fontWeight: 'bold' }}> (RETURN)</span>
                    )}
                  </div>
                  <div>
                    {s.items.map((it, i) => (
                      <div key={i}>
                        {(it.medicineId?.name || 'Item')} ×{it.quantity} @ Rs.{saleItemUnitPrice(it) ?? '0.00'}
                      </div>
                    ))}
                  </div>
                  <div><strong>Sale total:</strong> Rs.{saleReceiptTotal(s).toFixed(2)}</div>
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

      {/* Return Password Prompt Modal */}
      {returnPasswordModalOpen && (
        <div className="modal-overlay" onClick={() => {
          setReturnPasswordModalOpen(false);
          setReturnPassword('');
          setReturnPasswordError('');
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <h3>Return Medicine - Password Required</h3>
            <form onSubmit={handleReturnPasswordSubmit}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                  Enter Password:
                </label>
                <input
                  type="password"
                  value={returnPassword}
                  onChange={(e) => {
                    setReturnPassword(e.target.value);
                    setReturnPasswordError('');
                  }}
                  placeholder="Enter return password"
                  style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: '16px',
                    border: returnPasswordError ? '2px solid #dc3545' : '1px solid #ccc',
                    borderRadius: '4px',
                    boxSizing: 'border-box'
                  }}
                  autoFocus
                />
                {returnPasswordError && (
                  <p style={{ color: '#dc3545', marginTop: '8px', fontSize: '14px' }}>
                    {returnPasswordError}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <button
                  type="submit"
                  style={{
                    backgroundColor: '#28a745',
                    color: 'white',
                    padding: '12px 24px',
                    fontSize: '16px',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Verify
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReturnPasswordModalOpen(false);
                    setReturnPassword('');
                    setReturnPasswordError('');
                  }}
                  style={{
                    backgroundColor: '#6c757d',
                    color: 'white',
                    padding: '12px 24px',
                    fontSize: '16px',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Return Medicine Modal */}
      {returnModalOpen && (
        <div className="modal-overlay" onClick={closeReturnModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <h3>Return Medicine</h3>
            <p style={{ fontSize: '14px', color: '#555', marginTop: 0 }}>
              Use the bill number from the receipt when possible. Otherwise use manual entry and type the refund price per unit.
            </p>

            <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="returnMode"
                  checked={returnMode === 'bill'}
                  onChange={() => { setReturnMode('bill'); setFetchedBill(null); setBillReturnQtys({}); }}
                />
                With bill number
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="returnMode"
                  checked={returnMode === 'manual'}
                  onChange={() => { setReturnMode('manual'); setFetchedBill(null); setBillReturnQtys({}); }}
                />
                Manual (no bill)
              </label>
            </div>

            {returnMode === 'bill' && (
              <div className="form-section" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="Bill number (e.g. B-2026-04-03-00001)"
                    value={billNumberInput}
                    onChange={(e) => setBillNumberInput(e.target.value)}
                    style={{ flex: 1, minWidth: '200px', padding: '10px', fontSize: '15px' }}
                  />
                  <button type="button" onClick={handleFetchBill} style={{ padding: '10px 16px' }}>
                    Load bill
                  </button>
                  <button type="button" onClick={closeReturnModal} style={{ padding: '10px 16px', backgroundColor: '#6c757d', color: '#fff' }}>
                    Cancel
                  </button>
                </div>

                {fetchedBill && (
                  <>
                    <p style={{ fontSize: '13px', margin: '8px 0 0' }}>
                      <strong>Bill</strong> {fetchedBill.billNumber} — returnable qty per line:
                    </p>
                    <div style={{ maxHeight: '240px', overflow: 'auto', border: '1px solid #ddd', borderRadius: 4 }}>
                      <table style={{ width: '100%', fontSize: '14px' }}>
                        <thead>
                          <tr style={{ background: '#f5f5f5' }}>
                            <th style={{ textAlign: 'left', padding: 8 }}>Item</th>
                            <th style={{ padding: 8 }}>Returnable</th>
                            <th style={{ padding: 8 }}>Unit (paid)</th>
                            <th style={{ padding: 8 }}>Return qty</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fetchedBill.lines.map((line) => (
                            <tr key={line.medicineId}>
                              <td style={{ padding: 8 }}>{line.name}</td>
                              <td style={{ textAlign: 'center', padding: 8 }}>{line.returnableQty}</td>
                              <td style={{ textAlign: 'right', padding: 8 }}>{Number(line.unitPrice).toFixed(2)}</td>
                              <td style={{ padding: 8 }}>
                                <input
                                  type="number"
                                  min={0}
                                  max={line.returnableQty}
                                  value={billReturnQtys[line.medicineId] ?? ''}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    if (raw === '') {
                                      setBillReturnQtys((prev) => ({ ...prev, [line.medicineId]: '' }));
                                      return;
                                    }
                                    let v = parseInt(raw, 10);
                                    if (Number.isNaN(v)) v = 0;
                                    v = Math.min(Math.max(0, v), line.returnableQty);
                                    setBillReturnQtys((prev) => ({ ...prev, [line.medicineId]: v }));
                                  }}
                                  style={{ width: '72px', padding: 6 }}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
                      <button
                        type="button"
                        onClick={handleReturn}
                        style={{ backgroundColor: '#dc3545', color: '#fff', padding: '12px 24px', fontSize: '16px' }}
                      >
                        Process return from bill
                      </button>
                      <button type="button" onClick={closeReturnModal} style={{ backgroundColor: '#6c757d', color: '#fff', padding: '12px 24px' }}>
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {returnMode === 'manual' && (
              <>
                <div className="form-section" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
                  <div style={{ position: 'relative', width: '100%' }}>
                    <input
                      type="text"
                      placeholder="Type or select medicine"
                      value={returnSearch}
                      onChange={(e) => {
                        setReturnSearch(e.target.value);
                        setReturnSelectedMedicineId(null);
                        setReturnShowSuggestions(e.target.value.length > 0);
                      }}
                      onFocus={() => {
                        if (returnSearch.length > 0) {
                          setReturnShowSuggestions(true);
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => setReturnShowSuggestions(false), 200);
                      }}
                      className="medicine-search-input"
                      style={{ width: '100%', padding: '10px', fontSize: '15px' }}
                    />
                    {returnShowSuggestions && returnFilteredMedicines.length > 0 && (
                      <div className="medicine-suggestions">
                        {returnFilteredMedicines.map((med) => (
                          <div
                            key={med._id}
                            className="medicine-suggestion-item"
                            onClick={() => handleReturnMedicineSelect(med)}
                            style={{
                              padding: '10px',
                              cursor: 'pointer',
                              borderBottom: '1px solid #eee',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              backgroundColor: '#fff',
                              color: '#000'
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: '500' }}>{med.name}</span>
                              <span style={{ fontSize: '12px', color: '#666' }}>
                                {med.type && `${med.type} `}{med.batchNo && `| Batch: ${med.batchNo}`}
                              </span>
                            </div>
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

                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ minWidth: '90px' }}>Qty</label>
                    <input
                      type="number"
                      value={returnQuantity}
                      onChange={(e) => setReturnQuantity(parseInt(e.target.value, 10) || 1)}
                      min={1}
                      style={{ width: '80px', padding: '10px', fontSize: '15px' }}
                    />
                    <label style={{ minWidth: '100px' }}>Refund / unit (Rs.)</label>
                    <input
                      type="number"
                      value={returnUnitPrice}
                      onChange={(e) => setReturnUnitPrice(e.target.value)}
                      min={0}
                      step="0.01"
                      placeholder="e.g. 150"
                      style={{ flex: 1, minWidth: '100px', padding: '10px', fontSize: '15px' }}
                    />
                    <button
                      type="button"
                      onClick={handleAddToReturnCart}
                      style={{ backgroundColor: '#ffc107', color: 'black', padding: '10px 20px' }}
                    >
                      Add line
                    </button>
                  </div>
                </div>

                {returnCart.length > 0 && (
                  <>
                    <h4 style={{ marginTop: '20px', marginBottom: '10px' }}>Return lines</h4>
                    <div style={{ maxHeight: '240px', overflow: 'auto', marginBottom: '15px' }}>
                      <table style={{ width: '100%', fontSize: '14px' }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left' }}>Name</th>
                            <th>Qty</th>
                            <th>Rs./unit</th>
                            <th>Line total</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {returnCart.map((item) => (
                            <tr key={item._id}>
                              <td>{item.name}</td>
                              <td>{item.quantity}</td>
                              <td>{Number(item.unitPrice).toFixed(2)}</td>
                              <td>Rs.{Number(item.lineTotal).toFixed(2)}</td>
                              <td>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveReturnItem(item._id)}
                                  style={{ backgroundColor: '#dc3545', color: 'white', padding: '5px 10px' }}
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
                      <button
                        type="button"
                        onClick={handleReturn}
                        style={{ backgroundColor: '#dc3545', color: '#fff', padding: '12px 24px', fontSize: '16px' }}
                      >
                        Process manual return
                      </button>
                      <button type="button" onClick={closeReturnModal} style={{ backgroundColor: '#6c757d', color: '#fff', padding: '12px 24px' }}>
                        Cancel
                      </button>
                    </div>
                  </>
                )}

                {returnCart.length === 0 && (
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
                    <button type="button" onClick={closeReturnModal} style={{ backgroundColor: '#6c757d', color: '#fff', padding: '12px 24px' }}>
                      Close
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default BillingPage;
