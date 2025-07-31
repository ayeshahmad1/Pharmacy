// src/pages/BillingPage.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './BillingPage.css';
import ReceiptPrintTrigger from '../components/ReceiptPrint';

function BillingPage() {
  const API = import.meta.env.VITE_APP_URL;
  const navigate = useNavigate();
  const [medicines, setMedicines] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [amountReceived, setAmountReceived] = useState(0);
  const [printReceipt, setPrintReceipt] = useState(false);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || user.role !== 'cashier') {
      alert('Access denied: Cashiers only');
      navigate('/');
    }
  }, [navigate]);

  useEffect(() => {
    axios.get(`${API}/medicines`)
      .then(res => setMedicines(res.data))
      .catch(err => console.error('Error fetching medicines:', err));
  }, []);

  const handleAddToCart = () => {
    const med = medicines.find(m => m.name.toLowerCase() === searchText.toLowerCase());
    if (!med || quantity <= 0) return;

    const existingItem = cart.find(item => item._id === med._id);
    const alreadyInCart = existingItem ? existingItem.quantity : 0;
    const available = med.quantity;

    if (quantity + alreadyInCart > available) {
      alert(`Only ${available - alreadyInCart} more units of ${med.name} are available.`);
      return;
    }

    const discountedPrice = parseFloat((med.price * 0.9).toFixed(2)); // 10% discount

    if (existingItem) {
      const updatedCart = cart.map(item => {
        if (item._id === med._id) {
          const newQty = item.quantity + quantity;
          return {
            ...item,
            quantity: newQty,
            total: newQty * discountedPrice
          };
        }
        return item;
      });
      setCart(updatedCart);
    } else {
      const item = {
        _id: med._id,
        name: med.name,
        quantity,
        price: discountedPrice,
        originalPrice: med.price,
        total: discountedPrice * quantity
      };
      setCart([...cart, item]);
    }

    setQuantity(1);
    setSearchText('');
  };

  const handleRemoveItem = (id) => {
    setCart(cart.filter(item => item._id !== id));
  };

  const total = cart.reduce((acc, item) => acc + item.total, 0);
  const originalTotal = cart.reduce((acc, item) => acc + item.originalPrice * item.quantity, 0);
  const discount = parseFloat((originalTotal - total).toFixed(2));
  const netTotal = total;
  const changeDue = Math.max(amountReceived - netTotal, 0);

  const handleCheckout = async () => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (cart.length === 0) return;
    if (amountReceived < netTotal) {
      alert('Amount received is less than the net total.');
      return;
    }

    try {
      await axios.post(`${API}/sales`, {
        items: cart.map(({ _id, quantity, price }) => ({ medicineId: _id, quantity, price })),
        totalPrice: netTotal,
        cashierId: user._id
      });
      setPrintReceipt(true);
      setTimeout(() => {
        setCart([]);
        setAmountReceived(0);
        setPrintReceipt(false);
      }, 500);
    } catch (err) {
      console.error('Error submitting sale:', err);
      alert('Error submitting sale');
    }
  };

  return (
    <div className="billing-wrapper">
      <div className="billing-left">
        <h2>Cashier Billing</h2>
        <div className="form-section">
          <input
            type="text"
            list="medicine-options"
            placeholder="Type or select medicine"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="medicine-search-input"
          />
          <datalist id="medicine-options">
            {medicines.map((med) => (
              <option key={med._id} value={med.name} />
            ))}
          </datalist>

          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value))}
            min={1}
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
                <td>Rs.{item.price.toFixed(2)}</td>
                <td>{item.quantity}</td>
                <td>Rs.{item.total.toFixed(2)}</td>
                <td><button onClick={() => handleRemoveItem(item._id)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="billing-right">
        <h3>Summary</h3>
        <p>Total (after discount): Rs.{total.toFixed(2)}</p>
        <p>Amount Received (Rs.)</p>
        <input
          type="number"
          value={amountReceived}
          onChange={(e) => setAmountReceived(Number(e.target.value))}
          min={0}
          className="discount-input"
        />
        <p>Change Due: Rs.{changeDue.toFixed(2)}</p>
        <button onClick={handleCheckout} disabled={cart.length === 0 || amountReceived < netTotal}>Checkout</button>
      </div>

      <ReceiptPrintTrigger
        cart={cart}
        total={originalTotal}
        discount={discount}
        netTotal={netTotal}
        amountReceived={amountReceived}
        changeDue={changeDue}
        trigger={printReceipt}
      />
    </div>
  );
}

export default BillingPage;
