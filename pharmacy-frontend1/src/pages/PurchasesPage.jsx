// src/pages/PurchasesPage.jsx
import { useEffect, useState } from 'react';
import axios from 'axios';
import './PurchasesPage.css';

function PurchasesPage() {
  const [purchases, setPurchases] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [form, setForm] = useState({ medicineId: '', quantity: '', purchasePrice: '', supplier: '' });
  const [editingId, setEditingId] = useState(null);

  const fetchData = async () => {
    const [purRes, medRes] = await Promise.all([
      axios.get('http://localhost:5000/api/purchases'),
      axios.get('http://localhost:5000/api/medicines')
    ]);
    setPurchases(purRes.data);
    setMedicines(medRes.data);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingId) {
      await axios.put(`http://localhost:5000/api/purchases/${editingId}`, form);
      setEditingId(null);
    } else {
      await axios.post('http://localhost:5000/api/purchases', form);
    }
    setForm({ medicineId: '', quantity: '', purchasePrice: '', supplier: '' });
    fetchData();
  };

  const handleEdit = (p) => {
    setForm({
      medicineId: p.medicineId?._id || '',
      quantity: p.quantity,
      purchasePrice: p.purchasePrice,
      supplier: p.supplier
    });
    setEditingId(p._id);
  };

  const handleDelete = async (id) => {
    await axios.delete(`http://localhost:5000/api/purchases/${id}`);
    fetchData();
  };

  return (
    <div className="purchase-page">
      <h2 className="purchase-title">Manage Purchases</h2>
      <form onSubmit={handleSubmit} className="purchase-form">
        <select className="form-select" value={form.medicineId} onChange={(e) => setForm({ ...form, medicineId: e.target.value })} required>
          <option value="">Select Medicine</option>
          {medicines.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
        </select>
        <input className="form-input" type="number" placeholder="Quantity" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
        <input className="form-input" type="number" placeholder="Purchase Price" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} required />
        <input className="form-input" type="text" placeholder="Supplier" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} required />
        <button type="submit" className="submit-btn">{editingId ? 'Update' : 'Add'} Purchase</button>
      </form>
      <table className="purchase-table">
        <thead>
          <tr>
            <th>Medicine</th><th>Qty</th><th>Price</th><th>Supplier</th><th>Date</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {purchases.map((p) => (
            <tr key={p._id}>
              <td>{p.medicineId?.name || 'N/A'}</td>
              <td>{p.quantity}</td>
              <td>{p.purchasePrice}</td>
              <td>{p.supplier}</td>
              <td>{p.purchaseDate?.slice(0, 10)}</td>
              <td>
                <button className="edit-btn" onClick={() => handleEdit(p)}>Edit</button>
                <button className="delete-btn" onClick={() => handleDelete(p._id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default PurchasesPage;
