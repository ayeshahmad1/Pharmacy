// src/components/ReceiptPrint.jsx
import './ReceiptPrint.css';

function ReceiptPrint({ cart, originalTotal, discountAmount, netTotal, amountReceived, changeDue }) {
  const currentDate = new Date().toLocaleString();

  return (
    <div className="receipt-container">
      <div className="receipt-header">
        <h3>Pharmacy POS</h3>
        <p>{currentDate}</p>
      </div>

      <hr />

      <table className="receipt-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {cart.map((item, idx) => (
            <tr key={idx}>
              <td>{item.name}</td>
              <td>{item.quantity}</td>
              <td>{item.originalPrice?.toFixed(2) || '0.00'}</td>
              <td>{(item.originalPrice * item.quantity)?.toFixed(2) || '0.00'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <hr />

      <div className="highlight-box">
        <p>Total: Rs.{originalTotal?.toFixed(2) || '0.00'}</p>
        <p>Discount (10%): Rs.{discountAmount?.toFixed(2) || '0.00'}</p>
        <p>Net Total: Rs.{netTotal?.toFixed(2) || '0.00'}</p>
        <p>Received: Rs.{amountReceived?.toFixed(2) || '0.00'}</p>
        <p>Returned: Rs.{changeDue?.toFixed(2) || '0.00'}</p>
      </div>

      <div className="thank-you-box">Thank you for your purchase!</div>
    </div>
  );
}

export default ReceiptPrint;
