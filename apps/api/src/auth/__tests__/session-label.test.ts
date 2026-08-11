import { describe, expect, it } from 'vitest';
import { sessionLabelFromUserAgent } from '../session.js';

describe('sessionLabelFromUserAgent', () => {
  it('returns null for empty agents', () => {
    expect(sessionLabelFromUserAgent(null)).toBeNull();
    expect(sessionLabelFromUserAgent(undefined)).toBeNull();
    expect(sessionLabelFromUserAgent('')).toBeNull();
  });

  it('labels common desktop and mobile agents', () => {
    expect(
      sessionLabelFromUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      ),
    ).toBe('Chrome · macOS');
    expect(
      sessionLabelFromUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari · iPhone');
  });
});
