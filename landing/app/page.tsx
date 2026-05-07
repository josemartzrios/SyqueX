import Nav from '../components/Nav'
import Hero from '../components/Hero'
import SocialProofBar from '../components/SocialProofBar'
import BeforeAfter from '../components/BeforeAfter'
import HowItWorks from '../components/HowItWorks'
import FeatureHighlight from '../components/FeatureHighlight'
import ChatGPTComparison from '../components/ChatGPTComparison'
import Pricing from '../components/Pricing'
import FAQ from '../components/FAQ'
import FinalCTA from '../components/FinalCTA'
import Footer from '../components/Footer'

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <SocialProofBar />
        <BeforeAfter />
        <HowItWorks />
        <FeatureHighlight />
        <ChatGPTComparison />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  )
}
