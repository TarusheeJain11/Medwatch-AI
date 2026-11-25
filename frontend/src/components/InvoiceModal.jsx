export default function InvoiceModal({ order, onClose }) {
    if (!order) return null;

    const tx = order.paymentTransaction;
    const cb = order.costBreakdown || {};

    return (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="inv-title">
            <div className="modal-card" style={{ maxWidth: 640 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, borderBottom: "1px solid var(--mw-border)", paddingBottom: 14 }}>
                    <div>
                        <span className="status-badge verified">Tax Invoice &amp; Payment Receipt</span>
                        <h2 id="inv-title" style={{ fontSize: 22, marginTop: 6 }}>
                            {order.receiptNumber} · Order {order.orderNumber}
                        </h2>
                        <p style={{ fontSize: 12, color: "var(--mw-muted)" }}>
                            Issued {new Date(order.createdAt).toLocaleString()} · MedWatch AI Verified Fulfillment
                        </p>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>
                            Print / Save PDF
                        </button>
                        <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
                            Close ✕
                        </button>
                    </div>
                </div>

                <div className="grid-2" style={{ marginTop: 14, marginBottom: 14 }}>
                    <div className="card-compact" style={{ background: "#F8FCFC" }}>
                        <strong style={{ fontSize: 12, color: "var(--mw-muted)" }}>DISPATCHING PHARMACY</strong>
                        <p style={{ fontWeight: 700, marginTop: 4 }}>{order.pharmacy?.name || "Verified Pharmacy"}</p>
                        <p style={{ fontSize: 12, color: "var(--mw-muted)" }}>
                            {order.pharmacy?.address}, {order.pharmacy?.city}
                        </p>
                    </div>
                    <div className="card-compact" style={{ background: "#F8FCFC" }}>
                        <strong style={{ fontSize: 12, color: "var(--mw-muted)" }}>DELIVERY &amp; PAYMENT</strong>
                        <p style={{ fontSize: 13, marginTop: 4 }}>
                            <strong>Zone:</strong> {order.deliveryDetails?.addressLine || order.serviceArea}
                        </p>
                        <p style={{ fontSize: 12, color: "var(--mw-muted)" }}>
                            Method: {order.paymentMethod || tx?.methodDetails?.label || "Gateway"} · Status: <strong>{order.paymentStatus}</strong>
                        </p>
                        {tx?.transactionId && (
                            <p style={{ fontSize: 11, color: "var(--mw-muted)" }}>
                                Txn: <code>{tx.transactionId}</code> · Pay ID: <code>{tx.gatewayPaymentId}</code>
                            </p>
                        )}
                        {order.deliveryOtp && (
                            <p style={{ fontSize: 12, color: "var(--mw-teal)", fontWeight: 700, marginTop: 4 }}>
                                Safe Handoff OTP: {order.deliveryOtp}
                            </p>
                        )}
                    </div>
                </div>

                <div className="table-wrap">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th>SKU</th>
                                <th>Qty</th>
                                <th>Rate</th>
                                <th>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(order.items || []).map((item, idx) => (
                                <tr key={idx}>
                                    <td><strong>{item.name}</strong></td>
                                    <td><code>{item.sku}</code></td>
                                    <td>{item.quantity}</td>
                                    <td>₹{item.unitPrice}</td>
                                    <td>₹{item.lineTotal}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="card-compact" style={{ marginTop: 14, background: "#F8FCFC", display: "grid", gap: 6, fontSize: 13 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Subtotal</span><span>₹{cb.subtotal ?? 0}</span>
                    </div>
                    {(cb.discountAmount || 0) > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--mw-success)" }}>
                            <span>Promo Discount ({order.couponCode})</span><span>-₹{cb.discountAmount}</span>
                        </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Courier &amp; Handling Fee</span><span>₹{cb.serviceFee ?? 25}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>GST (5%)</span><span>₹{cb.taxAmount ?? 0}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 800, borderTop: "1px solid var(--mw-border)", paddingTop: 8 }}>
                        <span>Total Paid</span><span style={{ color: "var(--mw-teal)" }}>₹{cb.totalAmount ?? 0}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
