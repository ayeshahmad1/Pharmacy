import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './MedicinesPage.css';

function MedicinesPage() {
  const navigate = useNavigate();
  const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  const [medicines, setMedicines] = useState([]);
  const [form, setForm] = useState({ name: '', type: '', batchNo: '', expiryDate: '', quantity: '', price: '', supplier: '' });
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    const fetchMedicines = async () => {
      try {
        const res = await axios.get(`${API}/medicines`);
        setMedicines(res.data);
      } catch (error) {
        console.error('Error fetching medicines:', error);
      }
    };
    fetchMedicines();
  }, [API]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await axios.put(`${API}/medicines/${editingId}`, form);
        setEditingId(null);
      } else {
        await axios.post(`${API}/medicines`, form);
      }
      setForm({ name: '', type: '', batchNo: '', expiryDate: '', quantity: '', price: '', supplier: '' });

      const res = await axios.get(`${API}/medicines`);
      setMedicines(res.data);
    } catch (error) {
      console.error('Error submitting medicine:', error);
      alert('Error saving medicine: ' + (error?.response?.data?.error || error.message));
    }
  };

  const handleEdit = (med) => {
    setForm({
      ...med,
      expiryDate: med.expiryDate ? med.expiryDate.slice(0, 10) : ''
    });
    setEditingId(med._id);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this medicine?')) return;
    try {
      await axios.delete(`${API}/medicines/${id}`);
      const res = await axios.get(`${API}/medicines`);
      setMedicines(res.data);
    } catch (error) {
      console.error('Error deleting medicine:', error);
      alert('Error deleting medicine: ' + (error?.response?.data?.error || error.message));
    }
  };

  return (
    <div className="inventory-page">
      <button
        type="button"
        onClick={() => navigate('/dashboard')}
        style={{ marginBottom: '16px', padding: '8px 16px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
      >
        ← Back to Dashboard
      </button>
      <h2 className="inventory-title">Manage Inventory</h2>
      <form onSubmit={handleSubmit} className="inventory-form">
        <input type="text" placeholder="Medicine Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} required>
          <option value="">Select Type</option>
          <option value="tablet">Tablet</option>
          <option value="capsule">Capsule</option>
          <option value="syrup">Syrup</option>
          <option value="injection">Injection</option>
          <option value="cream">Cream</option>
          <option value="sachet">Sachet</option>
          <option value="gel">Gel</option>
          <option value="milk">Milk</option>
        </select>
        <input type="text" placeholder="Batch No" value={form.batchNo} onChange={(e) => setForm({ ...form, batchNo: e.target.value })} required />
        <input type="date" placeholder="Expiry Date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} required />
        <input type="number" placeholder="Quantity" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
        <input type="number" placeholder="Price (Rs.)" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
        <input type="text" placeholder="Supplier" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} required />
        <button type="submit" className="submit-btn">{editingId ? 'Update' : 'Add'} Medicine</button>
      </form>
      <div className="inventory-table-wrapper">
        <table className="inventory-table">
          <thead>
            <tr>
              <th>Name</th><th>Type</th><th>Batch</th><th>Expiry</th><th>Qty</th><th>Price</th><th>Supplier</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {medicines.map((med) => (
              <tr key={med._id}>
                <td>{med.name}</td><td>{med.type}</td><td>{med.batchNo}</td><td>{med.expiryDate?.slice(0, 10)}</td>
                <td>{med.quantity}</td><td>Rs. {med.price}</td><td>{med.supplier}</td>
                <td>
                  <button className="edit-btn" onClick={() => handleEdit(med)}>Edit</button>
                  <button className="delete-btn" onClick={() => handleDelete(med._id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default MedicinesPage;
