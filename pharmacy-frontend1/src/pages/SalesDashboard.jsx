// src/pages/SalesDashboard.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './SalesDashboard.css';

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

// Helper function to format date only in GMT+5
const formatDateGMT5 = (date) => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleDateString('en-US', {
    timeZone: 'Asia/Karachi', // GMT+5
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

// Helper function to format time only in GMT+5
const formatTimeGMT5 = (date) => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Karachi', // GMT+5
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
};

function SalesDashboard() {
  const navigate = useNavigate();
  const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  const [allSales, setAllSales] = useState([]);
  const [filteredSales, setFilteredSales] = useState([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchSales = async () => {
    if (!fromDate || !toDate) {
      alert('Please select both "From" and "To" dates');
      return;
    }

    if (new Date(fromDate) > new Date(toDate)) {
      alert('"From" date cannot be later than "To" date');
      return;
    }

    setLoading(true);
    try {
      const res = await axios.get(`${API}/sales`);
      const allSalesData = res.data;
      
      // Filter sales by date range
      const from = new Date(fromDate);
      from.setHours(0, 0, 0, 0);
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      
      const filtered = allSalesData.filter((sale) => {
        const saleDate = new Date(sale.createdAt);
        return saleDate >= from && saleDate <= to;
      });

      setAllSales(allSalesData);
      setFilteredSales(filtered);
      const total = filtered.reduce(
        (sum, sale) => sum + Number(sale.netTotal ?? sale.totalPrice ?? 0),
        0
      );
      setTotalRevenue(total);
    } catch (err) {
      console.error('Error fetching sales:', err);
      alert('Error fetching sales: ' + (err?.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sales-page">
      <button
        type="button"
        onClick={() => navigate('/dashboard')}
        style={{ marginBottom: '16px', padding: '8px 16px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
      >
        ← Back to Dashboard
      </button>
      <h2 className="sales-title">Sales Dashboard</h2>

      {/* Date Range Filters */}
      <div className="sales-filter-bar">
        <div className="sales-filter-group">
          <label>From Date</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>

        <div className="sales-filter-group">
          <label>To Date</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>

        <button
          className="sales-load-btn"
          onClick={fetchSales}
          disabled={loading || !fromDate || !toDate}
        >
          {loading ? 'Loading...' : 'Load Sales'}
        </button>
      </div>

      {filteredSales.length > 0 && (
        <p className="sales-summary">
          Total Revenue: Rs.{totalRevenue.toFixed(2)} &nbsp;·&nbsp; {filteredSales.length} sale{filteredSales.length !== 1 ? 's' : ''}
        </p>
      )}

      {filteredSales.length === 0 && fromDate && toDate && !loading && (
        <p className="sales-empty">No sales found for the selected date range.</p>
      )}

      {filteredSales.length > 0 && (
        <div className="sales-table-wrapper">
          <table className="sales-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Cashier</th>
                <th>Items</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.map((sale) => {
                let cashierName = 'N/A';
                if (sale.cashierName) {
                  cashierName = sale.cashierName;
                } else if (sale.cashierId) {
                  if (typeof sale.cashierId === 'object' && sale.cashierId !== null) {
                    cashierName = sale.cashierId.name || 'N/A';
                  } else if (typeof sale.cashierId === 'string') {
                    cashierName = 'Unknown Cashier';
                  }
                }

                return (
                  <tr key={sale._id}>
                    <td>
                      {formatDateGMT5(sale.createdAt)}
                      <span className="sales-time-sub">{formatTimeGMT5(sale.createdAt)}</span>
                    </td>
                    <td>{cashierName}</td>
                    <td>
                      <ul>
                        {sale.items.map((item, i) => {
                          const unit = item.discountedPrice ?? item.originalPrice ?? item.price;
                          return (
                            <li key={i}>
                              {item.medicineId?.name || 'Unknown'} ×{item.quantity}
                              {unit != null && ` (Rs.${unit})`}
                            </li>
                          );
                        })}
                      </ul>
                    </td>
                    <td>Rs.{sale.netTotal ?? sale.totalPrice}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default SalesDashboard;
