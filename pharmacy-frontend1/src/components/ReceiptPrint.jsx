import React, { forwardRef } from 'react';
import './ReceiptPrint.css';

// Helper function to format date/time in GMT+5
const formatGMT5 = (date) => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleString('en-US', {
    timeZone: 'Asia/Karachi', // GMT+5
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
};

const ReceiptPrint = forwardRef(({ cart = [], total = 0, discount = 0, netTotal = 0, amountReceived = 0, changeDue = 0, customerName = '', billNumber = '' }, ref) => (
  <div className="receipt-container" ref={ref}>
    <div className="receipt-header">
      {/* <img src="/18234108_v1033-b-04-b.svg" alt="Logo" className="receipt-logo" /> */}
      <h3>Dr. Saima Clinic</h3>
      <p>Date: {formatGMT5(new Date())}</p>
      {billNumber ? <p><strong>Bill:</strong> {billNumber}</p> : null}
      {customerName && <p>Customer: {customerName}</p>}
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
            <td>Rs.{item.total.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <hr />
    <p>Total: <span className="right">Rs.{total.toFixed(2)}</span></p>
    <p>Discount: <span className="right">Rs.{discount.toFixed(2)}</span></p>
    <p><strong>Net Total: <span className="right">Rs.{netTotal.toFixed(2)}</span></strong></p>
    <p>Paid: <span className="right">Rs.{amountReceived.toFixed(2)}</span></p>
    <div className="highlight-box">
      <strong>Change: <span className="right">Rs.{changeDue.toFixed(2)}</span></strong>
    </div>
    <div className="thank-you-box">
      <p>Thank you for visiting!</p>
    </div>
  </div>
));

ReceiptPrint.displayName = 'ReceiptPrint';

export default ReceiptPrint;