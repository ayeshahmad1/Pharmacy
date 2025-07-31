import React, { forwardRef } from 'react';
import './ReceiptPrint.css';

const Receipt = forwardRef(({ cart, total, discount, netTotal, amountReceived, changeDue }, ref) => (
  <div className="receipt-container" ref={ref}>
    <image src="/18234108_v1033-b-04-b.svg" alt="Logo" className="receipt-logo" />
    <h3>Dr. Saima Clinic</h3>
    <p>Date: {new Date().toLocaleString()}</p>
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
    <p>Total: Rs.{total.toFixed(2)}</p>
    <p>Discount: Rs.{discount.toFixed(2)}</p>
    <p><strong>Net Total: Rs.{netTotal.toFixed(2)}</strong></p>
    <p>Paid: Rs.{amountReceived.toFixed(2)}</p>
    <p>Returned: Rs.{changeDue.toFixed(2)}</p>
    <p className="thanks">Thank you!</p>
  </div>
));

const ReceiptPrint = forwardRef((props, ref) => (
  <Receipt {...props} ref={ref} />
));

export default ReceiptPrint;
