import React, { forwardRef } from 'react';
import './ReceiptPrint.css';

const Receipt = forwardRef(({ cart, total, discount, netTotal, amountReceived, changeDue }, ref) => (
  <div className="receipt-container" ref={ref}>
    <div className="receipt-header">
      <img src="/logo.png" alt="Logo" className="receipt-logo" />
      <h3>Dr. Saima Clinic</h3>
      <p>Date: {new Date().toLocaleString()}</p>
    </div>
    <hr />
    <table className="receipt-table">
      <thead>
        <tr>
          <th>Medicine</th>
          <th>Qty</th>
          <th>Price</th>
        </tr>
      </thead>
      <tbody>
        {cart.map((item) => (
          <tr key={item._id}>
            <td>{item.name}</td>
            <td>{item.quantity}</td>
            <td>Rs.{(item.originalPrice * item.quantity).toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <hr />
    <p>Total: <span className="right">Rs.{total.toFixed(2)}</span></p>
    <p>Discount (10%): <span className="right">Rs.{discount.toFixed(2)}</span></p>
    <p><strong>Net Total: <span className="right">Rs.{netTotal.toFixed(2)}</span></strong></p>
    <p>Paid: <span className="right">Rs.{amountReceived.toFixed(2)}</span></p>
    <div className="highlight-box">
      <strong>Returned: <span className="right">Rs.{changeDue.toFixed(2)}</span></strong>
    </div>
    <div className="thank-you-box">
      <p>Thank you for visiting!</p>
    </div>
  </div>
));

const ReceiptPrint = forwardRef((props, ref) => (
  <Receipt {...props} ref={ref} />
));

export default ReceiptPrint;
