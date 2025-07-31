// src/pages/BillingPage.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useReactToPrint } from 'react-to-print';
import ReceiptPrint from '../components/ReceiptPrint';
import './BillingPage.css';

function BillingPage() {
  const API = import.meta.env.VITE_APP_URL;
  const navigate = useNavigate();
  const receiptRef = useRef();
  const [medicines, setMedicines] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [amountReceived, setAmountReceived] = useState(0);

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

    if (quantity + alreadyInCart > med.quantity) {
      alert(`Only ${med.quantity - alreadyInCart} more units of ${med.name} available.`);
      return;
    }

    const discountedPrice = parseFloat((med.price * 0.9).toFixed(2));

    if (existingItem) {
      const updatedCart = cart.map(item =>
        item._id === med._id
          ? {
              ...item,
              quantity: item.quantity + quantity,
              total: (item.quantity + quantity) * discountedPrice
            }
          : item
      );
      setCart(updatedCart);
    } else {
      setCart([
        ...cart,
        {
          _id: med._id,
          name: med.name,
          originalPrice: med.price,
          price: discountedPrice,
          quantity,
          total: discountedPrice * quantity
        }
      ]);
    }

    setSearchText('');
    setQuantity(1);
  };

  const handleRemoveItem = (id) => {
    setCart(cart.filter(item => item._id !== id));
  };

  const originalTotal = cart.reduce((sum, item) => sum + item.originalPrice * item.quantity, 0);
  const discountAmount = parseFloat((originalTotal * 0.1).toFixed(2));
  const netTotal = parseFloat((originalTotal - discountAmount).toFixed(2));
  const changeDue = Math.max(amountReceived - netTotal, 0);

  const handlePrint = useReactToPrint({
    content: () => receiptRef.current
  });

  const handleCheckout = async () => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (cart.length === 0) return;
    if (amountReceived < netTotal) {
      alert('Amount received is less than net total.');
      return;
    }

    try {
      await axios.post(`${API}/sales`, {
        items: cart.map(({ _id, quantity, originalPrice }) => ({
          medicineId: _id,
          quantity,
          price: originalPrice
        })),
        totalPrice: netTotal,
        cashierId: user._id
      });

      handlePrint(); // print only after posting is successful

      setTimeout(() => {
        setCart([]);
        setAmountReceived(0);
      }, 300);
    } catch (err) {
      console.error('Checkout error:', err);
      alert('Failed to complete sale.');
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
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Enter medicine name"
          />
          <datalist id="medicine-options">
            {medicines.map(m => <option key={m._id} value={m.name} />)}
          </datalist>

          <input type="number" value={quantity} onChange={e => setQuantity(Number(e.target.value))} />
          <button onClick={handleAddToCart}>Add to Cart</button>
        </div>

        <table>
          <thead>
            <tr><th>#</th><th>Name</th><th>Price</th><th>Qty</th><th>Total</th><th>Action</th></tr>
          </thead>
          <tbody>
            {cart.map((item, i) => (
              <tr key={item._id}>
                <td>{i + 1}</td>
                <td>{item.name}</td>
                <td>{item.price}</td>
                <td>{item.quantity}</td>
                <td>{item.total.toFixed(2)}</td>
                <td><button onClick={() => handleRemoveItem(item._id)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="billing-right">
        <h3>Summary</h3>
        <p>Total: Rs.{originalTotal.toFixed(2)}</p>
        <p>Discount: Rs.{discountAmount.toFixed(2)}</p>
        <p>Net Total: Rs.{netTotal.toFixed(2)}</p>
        <label>Amount Received</label>
        <input
          type="number"
          value={amountReceived}
          onChange={e => setAmountReceived(Number(e.target.value))}
        />
        <p>Change Due: Rs.{changeDue.toFixed(2)}</p>
        <button onClick={handleCheckout}>Checkout & Print</button>
      </div>

      {/* This will be used for printing */}
      <div style={{ display: 'none' }}>
        <ReceiptPrint
          ref={receiptRef}
          cart={cart}
          total={originalTotal}
          discount={discountAmount}
          netTotal={netTotal}
          amountReceived={amountReceived}
          changeDue={changeDue}
        />
      </div>
    </div>
  );
}

export default BillingPage;
