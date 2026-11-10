// What this portal is called, said by the portal itself (`name` in its config, in its health): on the tab, and under the icon of an app
// installed from it. Without a name the page keeps `El portal`.

export async function nameThePage(fetchImpl: typeof fetch = fetch, doc: Document = document): Promise<string | undefined> {
  try {
    const res = await fetchImpl('/api/health');
    if (!res.ok) return undefined;
    const name = ((await res.json()) as { name?: unknown }).name;
    if (typeof name !== 'string' || !name.trim()) return undefined;
    doc.title = name;
    doc.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', name);
    return name;
  } catch {
    return undefined;
  }
}
