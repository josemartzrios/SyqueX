import Nav from '../components/Nav'
import Hero from '../components/Hero'
import Benefits from '../components/Benefits'
import Pricing from '../components/Pricing'
import Footer from '../components/Footer'

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Benefits />
        <Pricing />
      </main>
      <Footer />
    </>
  )
}
