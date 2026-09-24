import { csvCell } from './waitlist.service.js';

describe('csvCell', () => {
  it('leaves plain values alone', () => {
    expect(csvCell('rahul@example.com')).toBe('rahul@example.com');
    expect(csvCell(null)).toBe('');
  });

  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('Pune, MH')).toBe('"Pune, MH"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
  });

  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell('+91')).toBe("'+91");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });
});
