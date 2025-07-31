// src/components/ReceiptPrint.jsx
import React, { forwardRef } from 'react';
import './ReceiptPrint.css';

const ReceiptPrint = forwardRef(({ cart, amountReceived, changeDue }, ref) => {
  if (!cart || cart.length === 0) return null;

  const originalTotal = cart.reduce((acc, item) => acc + item.originalPrice * item.quantity, 0);
  const discountAmount = originalTotal * 0.1;
  const netTotal = originalTotal - discountAmount;

  return (
    <div className="receipt-container" ref={ref}>
      <div className="receipt-header">
        <h3>Dr. Saima Clinic</h3>
        <p>Date: {new Date().toLocaleString()}</p>
        <hr />
      </div>

      <table className="receipt-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Qty</th>
            <th>Rate</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {cart.map((item) => (
            <tr key={item._id}>
              <td>{item.name}</td>
              <td>{item.quantity}</td>
              <td>Rs.{item.originalPrice.toFixed(2)}</td>
              <td>Rs.{(item.originalPrice * item.quantity).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <hr />

      <div className="highlight-box">
        <p>Total Amount: <span className="right">Rs.{originalTotal.toFixed(2)}</span></p>
        <p>Discount (10%): <span className="right">Rs.{discountAmount.toFixed(2)}</span></p>
        <p>Net Total: <span className="right">Rs.{netTotal.toFixed(2)}</span></p>
        <p>Amount Received: <span className="right">Rs.{amountReceived.toFixed(2)}</span></p>
        <p>Change Returned: <span className="right">Rs.{changeDue.toFixed(2)}</span></p>
      </div>

      <div className="thank-you-box">
        <p>Thank you for your purchase!</p>
      </div>
    </div>
  );
});

export default ReceiptPrint;
