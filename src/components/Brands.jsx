// Order Plaza × 3D Kadastr (partner) — in the header and in the footer
export default function Brands({ home = false }) {
  return (
    <div className="brands">
      <a className="logo" href="#top" aria-label={home ? 'Order Plaza — bosh sahifa' : undefined}>
        <img className="logo-img" src="assets/img/order-plaza-mark.webp" width="34" height="34" alt="" aria-hidden="true" />
        <span><b>Order Plaza</b><small>Business center</small></span>
      </a>
      <span className="brand-x" aria-hidden="true">&times;</span>
      <span className="partner" title={home ? 'Hamkor: 3D Kadastr' : undefined}>
        <img className="logo-img kd" src="assets/img/kadastr-3d-logo.webp" width="34" height="34" alt="3D Kadastr logotipi" />
        <span><b>3D Kadastr</b><small>Hamkor</small></span>
      </span>
    </div>
  );
}
