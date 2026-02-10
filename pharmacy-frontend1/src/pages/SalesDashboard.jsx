// src/pages/SalesDashboard.jsx
import { useState } from 'react';
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
      const total = filtered.reduce((sum, sale) => sum + (sale.totalPrice || 0), 0);
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
      <h2 className="sales-title">Sales Dashboard</h2>
      
      {/* Date Range Filters */}
      <div style={{ 
        display: 'flex', 
        gap: '15px', 
        marginBottom: '20px', 
        alignItems: 'flex-end',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={{ fontWeight: '500' }}>From Date:</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{
              padding: '8px',
              fontSize: '14px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              minWidth: '160px'
            }}
          />
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={{ fontWeight: '500' }}>To Date:</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{
              padding: '8px',
              fontSize: '14px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              minWidth: '160px'
            }}
          />
        </div>
        
        <button
          onClick={fetchSales}
          disabled={loading || !fromDate || !toDate}
          style={{
            padding: '10px 20px',
            backgroundColor: loading ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: loading || !fromDate || !toDate ? 'not-allowed' : 'pointer',
            minHeight: '40px'
          }}
        >
          {loading ? 'Loading...' : 'Load Sales'}
        </button>
      </div>

      {filteredSales.length > 0 && (
        <p className="sales-summary">Total Revenue: Rs.{totalRevenue.toFixed(2)} ({filteredSales.length} sale{filteredSales.length !== 1 ? 's' : ''})</p>
      )}

      {filteredSales.length === 0 && fromDate && toDate && !loading && (
        <p style={{ color: '#666', marginBottom: '20px' }}>No sales found for the selected date range.</p>
      )}

      {filteredSales.length > 0 && (
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
              // Handle cashier name display - check multiple possible formats
              let cashierName = 'N/A';
              if (sale.cashierName) {
                cashierName = sale.cashierName;
              } else if (sale.cashierId) {
                if (typeof sale.cashierId === 'object' && sale.cashierId !== null) {
                  cashierName = sale.cashierId.name || 'N/A';
                } else if (typeof sale.cashierId === 'string') {
                  // If it's just an ID string, we can't get the name without another API call
                  cashierName = 'Unknown Cashier';
                }
              }
              
              return (
                <tr key={sale._id}>
                  <td>{formatDateGMT5(sale.createdAt)}<br/><small style={{ color: '#666' }}>{formatTimeGMT5(sale.createdAt)}</small></td>
                  <td>{cashierName}</td>
                  <td>
                    <ul>
                      {sale.items.map((item, i) => (
                        <li key={i}>{item.medicineId?.name || 'Unknown'} x{item.quantity} (Rs.{item.price})</li>
                      ))}
                    </ul>
                  </td>
                  <td>Rs.{sale.totalPrice}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default SalesDashboard;
