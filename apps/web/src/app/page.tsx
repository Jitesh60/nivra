import { CategoryGrid } from '@/components/sections/categories';
import { DownloadOrWaitlist } from '@/components/sections/download';
import { EarningsCalculator } from '@/components/sections/earnings-calculator';
import { FaqList } from '@/components/sections/faq';
import { Hero } from '@/components/sections/hero';
import { HowItWorksTabs } from '@/components/sections/how-it-works';
import { TrustGrid } from '@/components/sections/trust';
import { WhySajha } from '@/components/sections/why-sajha';
import { Footer } from '@/components/site/footer';
import { Header } from '@/components/site/header';
import { Section } from '@/components/site/section';
import { GlowLink } from '@/components/ui/glow-button';

export default function Home() {
  return (
    <>
      <Header overlay />
      <main>
        <Hero />
        <Section
          id="how-it-works"
          eyebrow="How it works"
          title="Rent in four simple steps"
          intro="Whether you’re borrowing for a weekend or lending something that sits in a cupboard."
        >
          <HowItWorksTabs />
        </Section>
        <Section
          eyebrow="Categories"
          title="Things people rarely need, but really need once"
          className="bg-ink-50"
        >
          <CategoryGrid />
        </Section>
        <Section eyebrow="Why Nivra" title="Owning is expensive. Sharing isn’t.">
          <WhySajha />
        </Section>
        <Section
          eyebrow="Trust & safety"
          title="Built so both sides feel safe"
          className="bg-ink-50"
        >
          <TrustGrid />
        </Section>
        <Section
          id="lend"
          eyebrow="Become a lender"
          title="What could your idle things earn?"
          intro="Move the sliders to see what one item could make you."
        >
          <EarningsCalculator />
        </Section>
        <Section eyebrow="FAQ" title="Questions, answered" className="bg-ink-50">
          <FaqList limit={5} />
          <GlowLink href="/faq" variant="brand" className="mt-8">
            See all questions
          </GlowLink>
        </Section>
        <DownloadOrWaitlist />
      </main>
      <Footer />
    </>
  );
}
