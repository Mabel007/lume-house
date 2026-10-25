import { Link } from "react-router-dom";
import { Breadcrumbs } from "../../components/PageHeader";
import { customerContent } from "../../config/customerContent";

export function AboutPage() {
  return <article className="wrap page-section about-page">
    <Breadcrumbs title="About" ancestors={[{ label: "Home", to: "/" }]} />
    <header className="about-opening">
      <div><p className="eyebrow">LUMÉ HOUSE / OUR STORY</p><h1>A home should feel like yours.</h1><p className="about-intro">The pieces you reach for. The textures you settle into. The little details that make a space feel personal.</p><nav className="about-section-links" aria-label="About sections"><Link to="/about#our-story">Our story</Link><Link to="/about#our-values">Our values</Link></nav></div>
      <figure><img src="/images/a-place-for-the-everyday.webp" width={1100} height={1100} alt="Vases, greenery and candles on a wooden tray in a warm living room" fetchPriority="high"/><figcaption>Beautiful things live here.</figcaption></figure>
    </header>
    <section className="about-story" aria-labelledby="our-story"><p className="eyebrow">ROOM FOR THE EVERYDAY</p><div><h2 id="our-story" tabIndex={-1}>A considered space, one piece at a time.</h2><p>Lumé House is a modern Sierra Leonean home and lifestyle store, shaped around a simple idea: everyday spaces can feel beautiful, comfortable and your own.</p><p>Our collection brings together home and lifestyle pieces with a warm, contemporary point of view. A quiet corner, a shared table, a familiar room — start with the details that feel right for you.</p></div></section>
    <section className="about-mission" aria-labelledby="mission-title"><p className="eyebrow">OUR MISSION</p><h2 id="mission-title">Beauty with a place in your life.</h2><p>{customerContent.mission}</p></section>
    <section className="about-values" aria-labelledby="our-values"><p className="eyebrow">WHAT MATTERS TO US</p><h2 id="our-values" tabIndex={-1}>Our values.</h2><div className="about-values-grid">{customerContent.values.map((value, index) => <section key={value.name}><span className="eyebrow" aria-hidden="true">0{index + 1}</span><h3>{value.name}</h3><p>{value.description}</p></section>)}</div></section>
    <section className="about-shopping" aria-labelledby="about-shopping-title"><p className="eyebrow">MAKE ROOM FOR WHAT YOU LOVE</p><h2 id="about-shopping-title">Find something that feels like you.</h2><Link className="button" to="/">Explore the collection <span aria-hidden="true">↗</span></Link><Link className="text-link" to="/help">A question before you shop?</Link></section>
  </article>;
}
