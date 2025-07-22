import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

function Dashboard() {
  const navigate = useNavigate();

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || user.role !== 'admin') {
      alert('Access denied: Admins only');
      navigate('/');
    }
  }, [navigate]);

  return (
    <div className="dashboard-home">
      <h1>Welcome, Admin</h1>
      <p>Select a page to manage:</p>
      <div className="dashboard-buttons">
        <button onClick={() => navigate('/medicines')}>Manage Inventory</button>
        <button onClick={() => navigate('/purchases')}>Manage Purchases</button>
        <button onClick={() => navigate('/sales')}>View Sales</button>
      </div>
    </div>
  );
}

export default Dashboard;