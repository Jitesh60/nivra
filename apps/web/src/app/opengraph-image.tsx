import { ICON_SVG } from '@sajha/ui';
import { ImageResponse } from 'next/og';

export const alt = 'Sajha: borrow what you need, lend what you don’t use';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  const iconSrc = `data:image/svg+xml;base64,${Buffer.from(ICON_SVG).toString('base64')}`;
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 80,
        color: 'white',
        background:
          'radial-gradient(circle at 20% 20%, #11846A, transparent 55%), radial-gradient(circle at 85% 80%, #D95806, transparent 50%), #062722',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <img src={iconSrc} width={88} height={88} alt="" />
        <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: -2, color: '#FBF8F2' }}>
          nivra
        </div>
      </div>
      <div style={{ fontSize: 76, fontWeight: 700, marginTop: 20, lineHeight: 1.1 }}>
        Borrow what you need.
      </div>
      <div style={{ fontSize: 76, fontWeight: 700, color: '#FDD38A', lineHeight: 1.1 }}>
        Lend what you don’t use.
      </div>
    </div>,
    size,
  );
}
