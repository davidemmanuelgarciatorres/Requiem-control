/**
 * Acceso seguro a localStorage. Puede no estar disponible (modo privado,
 * datos bloqueados), por lo que toda lectura/escritura está protegida.
 * Solo se usa para preferencias de interfaz, nunca para datos de negocio.
 */
export function readPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* almacenamiento no disponible: la preferencia vive solo en memoria */
  }
}
