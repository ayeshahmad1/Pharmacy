// src/pages/SalesDashboard.jsx
import { useEffect, useState } from 'react';
import axios from 'axios';
import './SalesDashboard.css';

function SalesDashboard() {
  const API = import.meta.env.VITE_API_URL;
  const [sales, setSales] = useState([]);
  const [totalRevenue, setTotalRevenue] = useState(0);

  useEffect(() => {
    const fetchSales = async () => {
      try {
        const res = await axios.get(`${API}/sales`);
        setSales(res.data);
        const total = res.data.reduce((sum, sale) => sum + sale.totalPrice, 0);
        setTotalRevenue(total);
      } catch (err) {
        console.error('Error fetching sales:', err);
      }
    };
    fetchSales();
  }, [API]);

  return (
    <div className="sales-page">
      <h2 className="sales-title">Sales Dashboard</h2>
      <p className="sales-summary">Total Revenue: Rs.{totalRevenue.toFixed(2)}</p>

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
          {sales.map((sale) => (
            <tr key={sale._id}>
              <td>{new Date(sale.createdAt).toLocaleDateString()}</td>
              <td>{sale.cashierId?.name || 'N/A'}</td>
              <td>
                <ul>
                  {sale.items.map((item, i) => (
                    <li key={i}>{item.medicineId?.name || 'Unknown'} x{item.quantity} (Rs.{item.price})</li>
                  ))}
                </ul>
              </td>
              <td>Rs.{sale.totalPrice}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default SalesDashboard;
