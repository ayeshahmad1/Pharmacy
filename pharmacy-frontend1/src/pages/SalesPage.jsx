import { useEffect, useState } from 'react';
import axios from 'axios';

function SalesPage() {
  const [sales, setSales] = useState([]);

  useEffect(() => {
    axios.get('http://localhost:5000/api/sales')
      .then((res) => setSales(res.data))
      .catch((err) => console.error('Error fetching sales:', err));
  }, []);

  const totalSales = sales.reduce((acc, sale) => acc + sale.totalPrice, 0);

  return (
    <div>
      <h2>Monthly Sales Report</h2>
      <p style={{ fontSize: '24px', fontWeight: 'bold' }}>Rs. {totalSales.toFixed(2)}</p>
    </div>
  );
}

export default SalesPage;
