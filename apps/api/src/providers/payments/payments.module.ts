import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { FakePaymentProvider } from './fake-payment.provider.js';
import { PaymentProvider } from './payment.provider.js';
import { RazorpayProvider } from './razorpay.provider.js';

@Global()
@Module({
  providers: [
    {
      provide: PaymentProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): PaymentProvider => {
        const keyId = config.get('RAZORPAY_KEY_ID', { infer: true });
        const secret = config.get('RAZORPAY_KEY_SECRET', { infer: true });
        const webhook = config.get('RAZORPAY_WEBHOOK_SECRET', { infer: true });
        return config.get('PAYMENT_PROVIDER', { infer: true }) === 'razorpay'
          ? new RazorpayProvider(keyId, secret, webhook)
          : new FakePaymentProvider(keyId, secret, webhook);
      },
    },
  ],
  exports: [PaymentProvider],
})
export class PaymentsProviderModule {}
