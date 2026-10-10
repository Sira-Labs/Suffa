import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CheckpointDialog } from './CheckpointDialog';

const checkpoint = {
  id: 'cp-1',
  atSec: 3,
  data: { kind: 'vocab_flash' as const, ar: 'بَيْتٌ', de: 'Haus' },
};

function Player() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Abspielen</button>
      {open && <CheckpointDialog checkpoint={checkpoint} onDone={() => setOpen(false)} />}
    </>
  );
}

describe('CheckpointDialog focus (WCAG 2.4.3)', () => {
  it('takes the focus when it appears and gives it back when it closes', async () => {
    render(<Player />);
    const play = screen.getByRole('button', { name: 'Abspielen' });
    await userEvent.click(play);
    expect(screen.getByRole('dialog')).toHaveFocus();
    const buttons = screen.getAllByRole('button').filter((b) => b !== play);
    await userEvent.click(buttons[0]!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(play).toHaveFocus();
  });
});
