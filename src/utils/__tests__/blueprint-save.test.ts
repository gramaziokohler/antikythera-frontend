import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Blueprint } from '../../types/blueprint-schema';
import {
  blueprintToFormData,
  blueprintIdExists,
  uploadBlueprint,
} from '../blueprint-save';

const BLUEPRINT: Blueprint = {
  version: '1.0',
  id: 'my-blueprint',
  name: 'My Blueprint',
  tasks: [
    { id: 'start', type: 'system.start' },
    { id: 'end', type: 'system.end' },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('blueprintToFormData', () => {
  it('wraps the blueprint as a `file` part named after its id', () => {
    const formData = blueprintToFormData(BLUEPRINT);
    const file = formData.get('file') as File;

    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('my-blueprint.json');
    expect(file.type).toBe('application/json');
  });

  it('serialises the blueprint unmodified — no type rewriting, no injected fields', async () => {
    const formData = blueprintToFormData(BLUEPRINT);
    const file = formData.get('file') as File;
    const text = await file.text();

    expect(JSON.parse(text)).toEqual(BLUEPRINT);
  });

  it('falls back to a default filename when the id is empty', () => {
    const formData = blueprintToFormData({ ...BLUEPRINT, id: '' });
    const file = formData.get('file') as File;

    expect(file.name).toBe('blueprint.json');
  });
});

describe('blueprintIdExists', () => {
  it('returns true when the id is present in GET /blueprints', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => [{ id: 'other' }, { id: 'my-blueprint' }],
      })),
    );

    await expect(blueprintIdExists('/api', 'my-blueprint')).resolves.toBe(true);
  });

  it('returns false when the id is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => [{ id: 'other' }],
      })),
    );

    await expect(blueprintIdExists('/api', 'my-blueprint')).resolves.toBe(false);
  });

  it('throws when the listing request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => [] })),
    );

    await expect(blueprintIdExists('/api', 'my-blueprint')).rejects.toThrow();
  });
});

describe('uploadBlueprint', () => {
  it('POSTs to /blueprints/upload with the blueprint as multipart form data', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ blueprint_id: 'my-blueprint', message: 'Saved' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await uploadBlueprint('/api', BLUEPRINT);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/blueprints/upload');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
    expect(result).toEqual({ blueprint_id: 'my-blueprint', message: 'Saved' });
  });

  it('throws when the upload request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    );

    await expect(uploadBlueprint('/api', BLUEPRINT)).rejects.toThrow();
  });
});
