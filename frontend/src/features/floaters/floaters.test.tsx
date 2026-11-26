import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { json, mockSignedIn } from '../../test/mockApi';
import { renderApp } from '../../test/renderApp';
import { spawnCollision, spawnWall } from './effects';
import { setSpeed, spawnBodies, step, type Body } from './physics';

describe('bouncing physics', () => {
  it('bounces off the walls and reports a wall event', () => {
    const b: Body = { id: 'a', x: 95, y: 50, vx: 100, vy: 0, r: 10 };
    const events = step([b], 0.1, 100, 100);
    expect(b.vx).toBeLessThan(0);
    expect(b.x).toBeLessThanOrEqual(90);
    expect(events).toEqual([{ type: 'wall', x: 100, y: 50, key: 'a:r' }]);
  });

  it('two images that meet exchange velocity (elastic) and report a collision once', () => {
    const a: Body = { id: 'a', x: 40, y: 50, vx: 50, vy: 0, r: 10 };
    const b: Body = { id: 'b', x: 59, y: 50, vx: -50, vy: 0, r: 10 };
    const events = step([a, b], 0.001, 200, 200);
    expect(events.filter((e) => e.type === 'collide')).toHaveLength(1);
    expect(a.vx).toBeCloseTo(-50, 0);
    expect(b.vx).toBeCloseTo(50, 0);
    expect(step([a, b], 0.001, 200, 200).filter((e) => e.type === 'collide')).toHaveLength(0); // ya se alejan
  });

  it('spawns bodies inside the screen and keeps speed when changed', () => {
    const bodies = spawnBodies(['a', 'b', 'c'], 64, 360, 780, 85);
    for (const b of bodies) {
      expect(b.x).toBeGreaterThanOrEqual(32);
      expect(b.x).toBeLessThanOrEqual(360 - 32);
      expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(85);
    }
    setSpeed(bodies, 150);
    expect(Math.hypot(bodies[0]!.vx, bodies[0]!.vy)).toBeCloseTo(150);
  });

  it('collision effects use the chosen shape and color; wall effects are small', () => {
    const burst = spawnCollision('hearts', '#39ff8f', 10, 10, 0, 64);
    expect(burst.length).toBeGreaterThan(5);
    expect(burst.every((p) => p.kind === 'hearts' && p.color === '#39ff8f')).toBe(true);
    const wall = spawnWall('#39ff8f', 0, 10, 0);
    expect(wall.size).toBeLessThanOrEqual(14);
    expect(wall.life).toBeLessThan(400);
  });
});

const FLOATERS = {
  preferences: { enabled: true, size: 64, speed: 'normal', effect_shape: 'splash', effect_color: '#ff6a1a', layer: 'front' },
  images: [{ id: 'f1', position: 0, width: 256, height: 256, created_at: '2026-11-26T00:00:00Z' }],
  max_images: 3,
};

describe('floating images settings', () => {
  it('shows saved images, saves preferences and enforces the 3-image limit in the UI', async () => {
    const user = userEvent.setup();
    const full = { ...FLOATERS, images: [0, 1, 2].map((i) => ({ ...FLOATERS.images[0], id: `f${i}`, position: i })) };
    const fetchMock = mockSignedIn({
      'GET /api/me/floaters': json(200, full),
      'PUT /api/me/preferences/floaters': json(200, {}),
      'GET /api/organizations/current/members': json(200, []),
      'GET /api/organizations/current/subscription': json(404, {}),
    });
    renderApp('/settings');
    expect(await screen.findByText('Ya tienes 3 imágenes. Quita una para agregar otra.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agregar imagen' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /Imagen flotante/ })).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Corazones' }));
    fireEvent.change(screen.getByRole('slider', { name: /Tamaño/ }), { target: { value: '96' } });
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => u === '/api/me/preferences/floaters')).toBe(true), { timeout: 2000 });
    const call = fetchMock.mock.calls.filter(([u]) => u === '/api/me/preferences/floaters').at(-1)!;
    expect(JSON.parse(String(call[1]?.body))).toMatchObject({ effect_shape: 'hearts', size: 96 });
  });

  it('opens the cropper before uploading and sends a small image', async () => {
    const user = userEvent.setup();
    // Lienzo y codificador simulados (jsdom no dibuja).
    const toBlob = vi.fn((cb: BlobCallback, type?: string) => cb(new Blob(['x'], { type: type ?? 'image/webp' })));
    const realGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => ({ drawImage: vi.fn(), imageSmoothingQuality: 'high' })) as never;
    HTMLCanvasElement.prototype.toBlob = toBlob as never;
    const realImage = globalThis.Image;
    globalThis.Image = class { naturalWidth = 1200; naturalHeight = 800; src = ''; onload: (() => void) | null = null; onerror = null;
      constructor() { setTimeout(() => this.onload?.(), 0); } } as never;
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const fetchMock = mockSignedIn({
      'GET /api/me/floaters': json(200, { ...FLOATERS, images: [] }),
      'POST /api/me/floaters': json(201, FLOATERS.images[0]),
      'GET /api/organizations/current/members': json(200, []),
      'GET /api/organizations/current/subscription': json(404, {}),
    });
    try {
      renderApp('/settings');
      await screen.findByRole('button', { name: 'Agregar imagen' });
      await user.upload(screen.getByLabelText('Agregar imagen', { selector: 'input' }), new File(['img'], 'foto.jpg', { type: 'image/jpeg' }));
      const dialog = await screen.findByRole('dialog', { name: 'Recorta tu imagen' });
      expect(dialog).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Usar imagen' }));
      await waitFor(() => expect(fetchMock.mock.calls.some(([u, i]) => u === '/api/me/floaters' && i?.method === 'POST')).toBe(true));
      expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.85);
    } finally {
      HTMLCanvasElement.prototype.getContext = realGetContext;
      globalThis.Image = realImage;
    }
  });

  it('rejects non-images before cropping', async () => {
    const user = userEvent.setup({ applyAccept: false });
    mockSignedIn({ 'GET /api/me/floaters': json(200, { ...FLOATERS, images: [] }), 'GET /api/organizations/current/members': json(200, []), 'GET /api/organizations/current/subscription': json(404, {}) });
    renderApp('/settings');
    await screen.findByRole('button', { name: 'Agregar imagen' });
    await user.upload(screen.getByLabelText('Agregar imagen', { selector: 'input' }), new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' }));
    expect(screen.getByText('Ese archivo no es una imagen compatible.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
