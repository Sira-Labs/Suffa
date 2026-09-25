import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClassCertificates } from '@/modules/classes/ClassCertificates';
import { ClassesApi, type Certificate } from '@/services/classes/classesApi';

const AWARDED: Certificate = {
  id: '3f1c2d4e-0000-4000-8000-000000000001',
  userId: 'u-amina',
  learnerName: 'Amina',
  unit: 1,
  unitTitle: 'Begrüßung',
  mastery: 94,
  className: 'Arabisch 1a',
  teacherName: 'Frau Yilmaz',
  awardedAt: '2026-09-25T09:00:00.000Z',
};

function fakeApi() {
  const requests: { method: string; path: string; body: unknown }[] = [];
  let awarded: Certificate[] = [];
  const api = new ClassesApi(async (input, init) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ method, path: String(input), body });
    if (method === 'POST') {
      awarded = [AWARDED];
      return Response.json(AWARDED, { status: 201 });
    }
    return Response.json({
      threshold: 90,
      eligible: awarded.length
        ? []
        : [
            {
              userId: 'u-amina',
              name: 'Amina',
              unit: 1,
              unitTitle: 'Begrüßung',
              mastery: 94,
            },
          ],
      awarded,
    });
  });
  return { api, requests };
}

describe('Class certificates (story 14.3)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('awards an eligible learner and prints the certificate', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const { api, requests } = fakeApi();
    render(<ClassCertificates api={api} classId="c1" />);
    const eligible = await screen.findByRole('region', {
      name: 'Bereit für ein Zertifikat',
    });
    expect(
      within(eligible).getByText(/Einheit 1 \(Begrüßung\) · 94 %/)
    ).toBeInTheDocument();
    await userEvent.click(within(eligible).getByRole('button', { name: 'Vergeben' }));
    expect(requests.find((r) => r.method === 'POST')).toMatchObject({
      path: '/api/v1/classes/c1/certificates',
      body: { userId: 'u-amina', unit: 1 },
    });

    const awarded = screen.getByRole('region', { name: 'Vergebene Zertifikate' });
    await userEvent.click(
      await within(awarded).findByRole('button', { name: 'Drucken' })
    );
    const sheet = await screen.findByRole('article', { name: 'Zertifikat Einheit 1' });
    expect(sheet.textContent).toContain('Amina');
    expect(sheet.textContent).toContain('94 % der Wörter');
    expect(sheet.textContent).toContain('Frau Yilmaz');
    expect(document.body.classList.contains('printing-certificate')).toBe(true);
    await vi.waitFor(() => expect(print).toHaveBeenCalled());
    window.dispatchEvent(new Event('afterprint'));
    await vi.waitFor(() =>
      expect(screen.queryByRole('article', { name: 'Zertifikat Einheit 1' })).toBeNull()
    );
    expect(document.body.classList.contains('printing-certificate')).toBe(false);
  });
});
