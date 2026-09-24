import { Footer } from '@/components/site/footer';
import { Header } from '@/components/site/header';

/** Inner pages: solid header. The home page renders its own overlay header. */
export default function SiteLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <Header />
      <div className="flex-1">{children}</div>
      <Footer />
    </>
  );
}
