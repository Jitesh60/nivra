import { Msg91SmsProvider } from './msg91-sms.provider.js';

describe('Msg91SmsProvider', () => {
  it('posts the OTP to the flow API without the leading +', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ type: 'success' })));
    await new Msg91SmsProvider({ authKey: 'k', templateId: 't', fetch }).sendOtp(
      '+919876543210',
      '123456',
    );
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(Msg91SmsProvider.url);
    expect(init.headers).toMatchObject({ authkey: 'k' });
    expect(JSON.parse(init.body as string)).toMatchObject({
      template_id: 't',
      recipients: [{ mobiles: '919876543210', otp: '123456' }],
    });
  });

  it('throws when MSG91 reports an error', async () => {
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ type: 'error', message: 'bad template' })),
    );
    await expect(
      new Msg91SmsProvider({ authKey: 'k', templateId: 't', fetch }).sendOtp('+919876543210', '1'),
    ).rejects.toThrow(/bad template/);
  });
});
