import Brands from './Brands.jsx';

export default function Footer() {
  return (
    <footer className="foot">
      <div className="wrap foot-in">
        <Brands />
        <p>Eskiz loyiha. Vizualizatsiyalar va maket loyiha bosqichidagi taklifni koʻrsatadi; yakuniy yechimlar farq qilishi mumkin.</p>
        <p className="muted">© 2026 Order Plaza · 3D teksturalar, modellar va osmon: <a href="https://polyhaven.com" target="_blank" rel="noopener">Poly Haven</a> (CC0)</p>
      </div>
    </footer>
  );
}
