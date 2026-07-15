// src/pages/PurchasesPage.jsx
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './PurchasesPage.css';

/* ── Week helpers ──────────────────────────────────────────── */
function getWeekBounds(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun … 6=Sat
  const diffToMon = (day + 6) % 7;   // days since Monday
  const mon = new Date(d);
  mon.setDate(d.getDate() - diffToMon);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return { weekStart: mon, weekEnd: sun };
}

function isThisWeek(dateStr) {
  const { weekStart, weekEnd } = getWeekBounds();
  const d = new Date(dateStr);
  return d >= weekStart && d <= weekEnd;
}

function toDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function fmtDate(dateStr) {
  return dateStr ? dateStr.slice(0, 10) : '—';
}

/* ── Group by week label ───────────────────────────────────── */
function weekLabel(dateStr) {
  const { weekStart, weekEnd } = getWeekBounds(new Date(dateStr));
  return `${toDateInput(weekStart)} → ${toDateInput(weekEnd)}`;
}

function groupByWeek(purchases) {
  const groups = {};
  [...purchases]
    .sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate))
    .forEach((p) => {
      const label = weekLabel(p.purchaseDate);
      if (!groups[label]) groups[label] = [];
      groups[label].push(p);
    });
  return groups; // { "2025-06-16 → 2025-06-22": [...], ... }
}

/* ═══════════════════════════════════════════════════════════ */
function PurchasesPage() {
  const navigate = useNavigate();
  const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

  /* ── shared data ── */
  const [purchases, setPurchases]   = useState([]);
  const [medicines, setMedicines]   = useState([]);
  const [form, setForm]             = useState({ medicineId: '', quantity: '', purchasePrice: '', supplier: '' });
  const [editingId, setEditingId]   = useState(null);

  /* ── autocomplete ── */
  const [medSearch, setMedSearch]         = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const autocompleteRef = useRef(null);

  /* ── history panel ── */
  const [histFrom, setHistFrom]   = useState('');
  const [histTo, setHistTo]       = useState('');
  const [histResults, setHistResults] = useState(null);   // null = not searched yet
  const [histLoading, setHistLoading] = useState(false);
  const [expandedWeek, setExpandedWeek] = useState(null); // which week accordion is open

  /* ── derived ── */
  const thisWeekPurchases = purchases.filter((p) => isThisWeek(p.purchaseDate));

  const filteredMedicines = medSearch.trim()
    ? medicines.filter((m) => m.name.toLowerCase().includes(medSearch.toLowerCase()))
    : medicines;

  /* ── close autocomplete on outside click ── */
  useEffect(() => {
    const handler = (e) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target))
        setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ── initial data load ── */
  useEffect(() => {
    fetchAll();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    try {
      const [purRes, medRes] = await Promise.all([
        axios.get(`${API}/purchases`),
        axios.get(`${API}/medicines`),
      ]);
      setPurchases(purRes.data);
      setMedicines(medRes.data);
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  }

  /* ── form handlers ── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await axios.put(`${API}/purchases/${editingId}`, form);
        setEditingId(null);
      } else {
        await axios.post(`${API}/purchases`, form);
      }
      setForm({ medicineId: '', quantity: '', purchasePrice: '', supplier: '' });
      setMedSearch('');
      await fetchAll();
    } catch (err) {
      console.error('Error submitting form:', err);
    }
  };

  const handleEdit = (p) => {
    setForm({
      medicineId:    p.medicineId?._id || '',
      quantity:      p.quantity,
      purchasePrice: p.purchasePrice,
      supplier:      p.supplier,
    });
    setMedSearch(p.medicineId?.name || '');
    setEditingId(p._id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this purchase?')) return;
    try {
      await axios.delete(`${API}/purchases/${id}`);
      await fetchAll();
    } catch (err) {
      console.error('Error deleting purchase:', err);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm({ medicineId: '', quantity: '', purchasePrice: '', supplier: '' });
    setMedSearch('');
  };

  /* ── history search ── */
  const handleHistorySearch = () => {
    if (!histFrom || !histTo) return;
    setHistLoading(true);
    const from = new Date(histFrom); from.setHours(0, 0, 0, 0);
    const to   = new Date(histTo);   to.setHours(23, 59, 59, 999);
    const results = purchases
      .filter((p) => {
        const d = new Date(p.purchaseDate);
        return d >= from && d <= to;
      })
      .sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate));
    setHistResults(results);
    setHistLoading(false);
    setExpandedWeek(null);
  };

  const handleHistoryClear = () => {
    setHistFrom('');
    setHistTo('');
    setHistResults(null);
    setExpandedWeek(null);
  };

  /* ── week bounds for display ── */
  const { weekStart, weekEnd } = getWeekBounds();

  /* ── history grouped by week (for sidebar accordion) ── */
  const historyGroups = histResults ? groupByWeek(histResults) : {};

  /* ════════════════════════════════════════════════════════ */
  return (
    <div className="purchase-page">

      {/* ── Page Header ── */}
      <button
        type="button"
        onClick={() => navigate('/dashboard')}
        style={{ marginBottom: '16px', padding: '8px 16px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
      >
        ← Back to Dashboard
      </button>
      <h2 className="purchase-title">Manage Purchases</h2>

      {/* ─────────────────────────────────────────────────── */}
      {/* SECTION 1 — Add / Edit form                        */}
      {/* ─────────────────────────────────────────────────── */}
      <section className="purchase-section">
        <div className="section-header">
          <span className="section-icon">➕</span>
          <h3 className="section-title">{editingId ? 'Edit Purchase' : 'Add New Purchase'}</h3>
        </div>
        <form onSubmit={handleSubmit} className="purchase-form">
          {/* medicine autocomplete */}
          <div className="med-autocomplete" ref={autocompleteRef}>
            <input
              id="medicine-search"
              className="form-input med-search-input"
              type="text"
              placeholder="Search medicine…"
              value={medSearch}
              autoComplete="off"
              required
              onChange={(e) => { setMedSearch(e.target.value); setForm({ ...form, medicineId: '' }); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
            />
            {showSuggestions && filteredMedicines.length > 0 && (
              <ul className="med-suggestions">
                {filteredMedicines.map((m) => (
                  <li key={m._id} className="med-suggestion-item"
                    onMouseDown={() => { setForm({ ...form, medicineId: m._id }); setMedSearch(m.name); setShowSuggestions(false); }}>
                    {m.name}
                  </li>
                ))}
              </ul>
            )}
            {showSuggestions && medSearch.trim() && filteredMedicines.length === 0 && (
              <ul className="med-suggestions"><li className="med-suggestion-empty">No medicines found</li></ul>
            )}
            <input type="hidden" value={form.medicineId} required />
          </div>

          <input className="form-input" type="number" placeholder="Quantity"       value={form.quantity}      onChange={(e) => setForm({ ...form, quantity:      e.target.value })} required />
          <input className="form-input" type="number" placeholder="Purchase Price" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} required />
          <input className="form-input" type="text"   placeholder="Supplier"       value={form.supplier}      onChange={(e) => setForm({ ...form, supplier:      e.target.value })} required />

          <div className="form-actions">
            <button type="submit" className="submit-btn">
              {editingId ? '✔ Update Purchase' : '➕ Add Purchase'}
            </button>
            {editingId && (
              <button type="button" className="cancel-btn" onClick={handleCancel}>
                ✕ Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      {/* ─────────────────────────────────────────────────── */}
      {/* SECTION 2 — This week's purchases                  */}
      {/* ─────────────────────────────────────────────────── */}
      <section className="purchase-section">
        <div className="section-header">
          <span className="section-icon">📅</span>
          <div>
            <h3 className="section-title">This Week's Purchases</h3>
            <p className="section-subtitle">
              {toDateInput(weekStart)} — {toDateInput(weekEnd)}
              &nbsp;·&nbsp;
              <span className="badge">{thisWeekPurchases.length} record{thisWeekPurchases.length !== 1 ? 's' : ''}</span>
            </p>
          </div>
        </div>

        {thisWeekPurchases.length === 0 ? (
          <p className="empty-state">No purchases recorded this week.</p>
        ) : (
          <div className="purchase-table-wrapper">
            <table className="purchase-table">
              <thead>
                <tr>
                  <th>Medicine</th><th>Qty</th><th>Price</th><th>Supplier</th><th>Date</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {thisWeekPurchases.map((p) => (
                  <tr key={p._id}>
                    <td>{p.medicineId?.name || 'N/A'}</td>
                    <td>{p.quantity}</td>
                    <td>Rs. {p.purchasePrice}</td>
                    <td>{p.supplier}</td>
                    <td>{fmtDate(p.purchaseDate)}</td>
                    <td>
                      <button className="edit-btn"   onClick={() => handleEdit(p)}>Edit</button>
                      <button className="delete-btn" onClick={() => handleDelete(p._id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ─────────────────────────────────────────────────── */}
      {/* SECTION 3 — Purchase History (date-range search)   */}
      {/* ─────────────────────────────────────────────────── */}
      <section className="purchase-section history-section">
        <div className="section-header">
          <span className="section-icon">🗂️</span>
          <div>
            <h3 className="section-title">Purchase History</h3>
            <p className="section-subtitle">Search past purchases by date range</p>
          </div>
        </div>

        {/* Date-range filter bar */}
        <div className="history-filter-bar">
          <div className="hist-filter-group">
            <label>From</label>
            <input type="date" value={histFrom} onChange={(e) => setHistFrom(e.target.value)} className="hist-date-input" />
          </div>
          <div className="hist-filter-group">
            <label>To</label>
            <input type="date" value={histTo} onChange={(e) => setHistTo(e.target.value)} className="hist-date-input" />
          </div>
          <button
            className="hist-search-btn"
            onClick={handleHistorySearch}
            disabled={!histFrom || !histTo || histLoading}
          >
            {histLoading ? 'Loading…' : '🔍 Search'}
          </button>
          {histResults !== null && (
            <button className="hist-clear-btn" onClick={handleHistoryClear}>Clear</button>
          )}
        </div>

        {/* Results */}
        {histResults === null && (
          <p className="empty-state">Enter a date range above to view purchase history.</p>
        )}

        {histResults !== null && histResults.length === 0 && (
          <p className="empty-state">No purchases found for the selected date range.</p>
        )}

        {histResults !== null && histResults.length > 0 && (
          <>
            <p className="hist-summary">
              Found <strong>{histResults.length}</strong> purchase{histResults.length !== 1 ? 's' : ''} across {Object.keys(historyGroups).length} week{Object.keys(historyGroups).length !== 1 ? 's' : ''}
            </p>

            {/* Week accordion groups */}
            <div className="week-accordion">
              {Object.entries(historyGroups).map(([label, rows]) => (
                <div key={label} className="week-group">
                  <button
                    className={`week-group-header ${expandedWeek === label ? 'open' : ''}`}
                    onClick={() => setExpandedWeek(expandedWeek === label ? null : label)}
                  >
                    <span className="week-label">📆 Week of {label}</span>
                    <span className="week-meta">
                      {rows.length} purchase{rows.length !== 1 ? 's' : ''} &nbsp;·&nbsp; Rs.&nbsp;{rows.reduce((s, r) => s + Number(r.purchasePrice), 0).toLocaleString()}
                    </span>
                    <span className="week-chevron">{expandedWeek === label ? '▲' : '▼'}</span>
                  </button>

                  {expandedWeek === label && (
                    <div className="purchase-table-wrapper week-table">
                      <table className="purchase-table">
                        <thead>
                          <tr>
                            <th>Medicine</th><th>Qty</th><th>Price</th><th>Supplier</th><th>Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((p) => (
                            <tr key={p._id}>
                              <td>{p.medicineId?.name || 'N/A'}</td>
                              <td>{p.quantity}</td>
                              <td>Rs. {p.purchasePrice}</td>
                              <td>{p.supplier}</td>
                              <td>{fmtDate(p.purchaseDate)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

    </div>
  );
}

export default PurchasesPage;
