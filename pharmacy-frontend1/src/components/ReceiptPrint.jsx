import React, { forwardRef } from 'react';
import './ReceiptPrint.css';

const Receipt = forwardRef(({ cart, total, discount, netTotal, amountReceived, changeDue }, ref) => (
  <div className="receipt-container" ref={ref}>
    <img src="/18234108_v1033-b-04-b.svg" alt="Logo" className="receipt-logo" />
    <h2 className="clinic-name">Dr. Saima Clinic</h2>
    <p className="receipt-date">Date: {new Date().toLocaleString()}</p>
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
    <div className="totals">
      <p>Total: <span>Rs.{total.toFixed(2)}</span></p>
      <p>Discount: <span>Rs.{discount.toFixed(2)}</span></p>
      <p className="net-total">Net Total: <span>Rs.{netTotal.toFixed(2)}</span></p>
      <p>Paid: <span>Rs.{amountReceived.toFixed(2)}</span></p>
      <p>Returned: <span>Rs.{changeDue.toFixed(2)}</span></p>
    </div>
    <p className="thanks">Thank you for visiting!</p>
  </div>
));

const ReceiptPrint = forwardRef((props, ref) => (
  <Receipt {...props} ref={ref} />
));

export default ReceiptPrint;
