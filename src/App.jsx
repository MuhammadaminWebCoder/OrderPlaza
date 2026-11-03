import { useEffect } from 'react';
import Header from './components/Header.jsx';
import Hero from './components/Hero.jsx';
import About from './components/About.jsx';
import Maket from './components/Maket.jsx';
import Gallery from './components/Gallery.jsx';
import Interior from './components/Interior.jsx';
import Engineering from './components/Engineering.jsx';
import Location from './components/Location.jsx';
import Footer from './components/Footer.jsx';
import Lightbox from './components/Lightbox.jsx';
import { setupReveals } from './lib/reveal.js';

export default function App() {
  useEffect(() => setupReveals(), []);
  return (
    <>
      <a className="skip" href="#bino">Asosiy mazmunga oʻtish</a>
      <Header />
      <main>
        <Hero />
        <About />
        <Maket />
        <Gallery />
        <Interior />
        <Engineering />
        <Location />
      </main>
      <Footer />
      <Lightbox />
    </>
  );
}
