// src/components/ReceiptPrint.jsx
import React, { forwardRef } from 'react';
import './ReceiptPrint.css';

const ReceiptPrint = forwardRef(({ cart, total, discount, netTotal, amountReceived, changeDue }, ref) => {
  const currentDate = new Date().toLocaleString();

  return (
    <div className="receipt-container" ref={ref}>
      <h3 className="receipt-title">Pharmacy POS</h3>
      <p>{currentDate}</p>

      <hr />

      <table className="receipt-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {cart.map((item, i) => (
            <tr key={i}>
              <td>{item.name}</td>
              <td>{item.quantity}</td>
              <td>{item.originalPrice.toFixed(2)}</td>
              <td>{(item.originalPrice * item.quantity).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <hr />

      <div className="totals">
        <p>Total: Rs.{total.toFixed(2)}</p>
        <p>Discount (10%): Rs.{discount.toFixed(2)}</p>
        <p>Net Total: Rs.{netTotal.toFixed(2)}</p>
        <p>Received: Rs.{amountReceived.toFixed(2)}</p>
        <p>Returned: Rs.{changeDue.toFixed(2)}</p>
      </div>

      <p className="thanks">Thank you for your purchase!</p>
    </div>
  );
});

export default ReceiptPrint;
