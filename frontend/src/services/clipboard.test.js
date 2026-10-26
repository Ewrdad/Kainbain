import { describe, it, expect, vi, beforeEach } from 'vitest';
import { copyToClipboard } from './clipboard';

describe('clipboard service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses navigator.clipboard.writeText when available and returns true on success', async () => {
    const writeTextMock = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    const result = await copyToClipboard('Hello world');
    expect(result).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith('Hello world');
  });

  it('falls back to document.execCommand when navigator.clipboard.writeText throws', async () => {
    const writeTextMock = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    const execCommandMock = vi.fn().mockReturnValue(true);
    document.execCommand = execCommandMock;

    const result = await copyToClipboard('Fallback log content');
    expect(result).toBe(true);
    expect(execCommandMock).toHaveBeenCalledWith('copy');
  });

  it('handles non-string arguments safely', async () => {
    const writeTextMock = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    const result = await copyToClipboard(12345);
    expect(result).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith('12345');
  });
});
