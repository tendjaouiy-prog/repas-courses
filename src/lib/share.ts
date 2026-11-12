export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** Ouvre le partage du téléphone, sinon copie. Renvoie le message à afficher. */
export async function share(title: string, text: string): Promise<string> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return '';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return '';
    }
  }
  return (await copy(text)) ? 'Copié ✓' : 'Copie impossible';
}
