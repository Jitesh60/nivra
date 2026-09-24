import { PaymentsTabs } from './payments-tabs';

export default function PaymentsLayout({ children }: LayoutProps<'/payments'>) {
  return (
    <>
      <PaymentsTabs />
      {children}
    </>
  );
}
