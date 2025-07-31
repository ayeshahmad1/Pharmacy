// src/pages/BillingPage.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './BillingPage.css';
import ReceiptPrint from '../components/ReceiptPrint';

function BillingPage() {
  const API = import.meta.env.VITE_APP_URL;
  const navigate = useNavigate();
  const [medicines, setMedicines] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [amountReceived, setAmountReceived] = useState(0);
  const receiptRef = useRef();

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

    const discountedPrice = parseFloat((med.price * 0.9).toFixed(2));
    const item = {
      _id: med._id,
      name: med.name,
      originalPrice: med.price,
      price: discountedPrice,
      quantity,
      total: discountedPrice * quantity
    };

    if (existingItem) {
      const updatedCart = cart.map(i => {
        if (i._id === med._id) {
          const newQty = i.quantity + quantity;
          return {
            ...i,
            quantity: newQty,
            total: newQty * i.price
          };
        }
        return i;
      });
      setCart(updatedCart);
    } else {
      setCart([...cart, item]);
    }

    setSearchText('');
    setQuantity(1);
  };

  const handleRemoveItem = (id) => {
    setCart(cart.filter(item => item._id !== id));
  };

  const totalOriginal = cart.reduce((acc, item) => acc + item.originalPrice * item.quantity, 0);
  const totalDiscount = cart.reduce((acc, item) => acc + (item.originalPrice - item.price) * item.quantity, 0);
  const netTotal = cart.reduce((acc, item) => acc + item.total, 0);
  const changeDue = Math.max(amountReceived - netTotal, 0);

  const handleCheckout = async () => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (cart.length === 0) return;
    if (amountReceived < netTotal) {
      alert('Amount received is less than the total.');
      return;
    }

    try {
      await axios.post(`${API}/sales`, {
        items: cart.map(({ _id, quantity, originalPrice }) => ({
          medicineId: _id,
          quantity,
          price: originalPrice
        })),
        totalPrice: totalOriginal,
        cashierId: user._id
      });

      setTimeout(() => {
        window.print();
        setCart([]);
        setAmountReceived(0);
      }, 100);
    } catch (err) {
      console.error('Error during checkout:', err);
      alert('Checkout failed.');
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
        <p>Total: Rs.{netTotal.toFixed(2)}</p>
        <p>Amount Received</p>
        <input
          type="number"
          value={amountReceived}
          onChange={(e) => setAmountReceived(Number(e.target.value))}
          min={0}
        />
        <p>Change Due: Rs.{changeDue.toFixed(2)}</p>
        <button onClick={handleCheckout} disabled={cart.length === 0 || amountReceived < netTotal}>Checkout</button>
      </div>

      {/* Hidden Receipt Component */}
      <div style={{ display: 'none' }}>
        <ReceiptPrint
          ref={receiptRef}
          cart={cart}
          total={totalOriginal}
          discount={totalDiscount}
          netTotal={netTotal}
          amountReceived={amountReceived}
          changeDue={changeDue}
        />
      </div>
    </div>
  );
}

export default BillingPage;
