// src/pages/BillingPage.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './BillingPage.css';
import ReceiptPrint from '../components/ReceiptPrint';

function BillingPage() {
  const API = import.meta.env.VITE_API_URL;
  const navigate = useNavigate();
  const [medicines, setMedicines] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [discount, setDiscount] = useState(0);
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
  }, [API]);

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

    if (existingItem) {
      const updatedCart = cart.map(item => {
        if (item._id === med._id) {
          const newQty = item.quantity + quantity;
          return {
            ...item,
            quantity: newQty,
            total: newQty * item.price
          };
        }
        return item;
      });
      setCart(updatedCart);
    } else {
      const item = {
        _id: med._id,
        name: med.name,
        price: med.price,
        quantity: quantity,
        total: med.price * quantity
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
  const netTotal = Math.max(total - discount, 0);
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
      alert('Sale completed!');
      setTimeout(() => {
        window.print();
        setCart([]);
        setDiscount(0);
        setAmountReceived(0);
      }, 100);
    } catch (err) {
      console.error('Error submitting sale:', err);
      alert('Error submitting sale');
    }
  };

  const handleDiscountChange = (e) => {
  const value = Number(e.target.value);
  const maxDiscount = total * 0.1;

  if (value > maxDiscount) {
    alert(`Discount cannot exceed 10% of total (Rs. ${maxDiscount.toFixed(2)}).`);
    setDiscount(maxDiscount);
  } else if (value < 0) {
    setDiscount(0);
  } else {
    setDiscount(value);
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
                <td>Rs.{item.price}</td>
                <td>{item.quantity}</td>
                <td>Rs.{item.total}</td>
                <td><button onClick={() => handleRemoveItem(item._id)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="billing-right">
        <h3>Summary</h3>
        <p>Total: Rs.{total.toFixed(2)}</p>
        <label>Discount (Rs.)</label>
        <input
          type="number"
          value={discount}
          onChange={handleDiscountChange}
          min={0}
          className="discount-input"
        />
        <p>Net Total: Rs.{netTotal.toFixed(2)}</p>
        <label>Amount Received (Rs.)</label>
        <input
          type="number"
          value={amountReceived}
          onChange={(e) => setAmountReceived(Number(e.target.value))}
          min={0}
          className="discount-input"
        />
        <p>Change Due: Rs.{changeDue.toFixed(2)}</p>
        <button onClick={handleCheckout} disabled={cart.length === 0 || amountReceived < netTotal}>Checkout</button>

        <div>
        <ReceiptPrint
        ref={receiptRef}
        cart={cart}
        total={total}
        discount={discount}
        netTotal={netTotal}
        amountReceived={amountReceived}
        changeDue={changeDue}
      />
        </div>
      </div>
    </div>
  );
}

export default BillingPage;