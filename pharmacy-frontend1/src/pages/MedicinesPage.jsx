import { useEffect, useState } from 'react';
import axios from 'axios';
import './MedicinesPage.css';

function MedicinesPage() {
  const API = import.meta.env.VITE_API_URL;
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
    if (editingId) {
      await axios.put(`${API}/medicines/${editingId}`, form);
      setEditingId(null);
    } else {
      await axios.post(`${API}/medicines`, form);
    }
    setForm({ name: '', type: '', batchNo: '', expiryDate: '', quantity: '', price: '', supplier: '' });

    try {
      const res = await axios.get(`${API}/medicines`);
      setMedicines(res.data);
    } catch (error) {
      console.error('Error fetching medicines:', error);
    }
  };

  const handleEdit = (med) => {
    setForm(med);
    setEditingId(med._id);
  };

  const handleDelete = async (id) => {
    await axios.delete(`${API}/medicines/${id}`);
    try {
      const res = await axios.get(`${API}/medicines`);
      setMedicines(res.data);
    } catch (error) {
      console.error('Error fetching medicines:', error);
    }
  };

  return (
    <div className="inventory-page">
      <h2 className="inventory-title">Manage Inventory</h2>
      <form onSubmit={handleSubmit} className="inventory-form">
        <input type="text" placeholder="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} required>
          <option value="">Select Type</option>
          <option value="tablet">Tablet</option>
          <option value="capsule">Capsule</option>
          <option value="syrup">Syrup</option>
          <option value="injection">Injection</option>
        </select>
        <input type="text" placeholder="batchNo" value={form.batchNo} onChange={(e) => setForm({ ...form, batchNo: e.target.value })} required />
        <input type="date" placeholder="expiryDate" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} required />
        <input type="number" placeholder="quantity" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
        <input type="number" placeholder="price" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
        <input type="text" placeholder="supplier" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} required />
        <button type="submit" className="submit-btn">{editingId ? 'Update' : 'Add'} Medicine</button>
      </form>
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
              <td>{med.quantity}</td><td>{med.price}</td><td>{med.supplier}</td>
              <td>
                <button className="edit-btn" onClick={() => handleEdit(med)}>Edit</button>
                <button className="delete-btn" onClick={() => handleDelete(med._id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default MedicinesPage;
