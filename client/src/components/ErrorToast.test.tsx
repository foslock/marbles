import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ErrorToast } from './ErrorToast';

describe('ErrorToast', () => {
  it('renders error message', () => {
    render(<ErrorToast message="Something went wrong" onClose={vi.fn()} />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('auto-dismisses after timeout', async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<ErrorToast message="Error" onClose={onClose} />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onClose).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
