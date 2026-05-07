import Nav from '../components/Nav'
import Hero from '../components/Hero'
import Benefits from '../components/Benefits'
import FAQ from '../components/FAQ'
import Pricing from '../components/Pricing'
import Footer from '../components/Footer'

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Benefits />
        <FAQ />
        <Pricing />
      </main>
      <Footer />
    </>
  )
}
