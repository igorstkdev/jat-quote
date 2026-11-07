import { useCallback, useState } from 'react';

/** Estado persistido no navegador (ex.: menu recolhido). Falha silenciosa sem storage. */
export function useLocalStorage<T>(chave: string, inicial: T) {
  const [valor, setValor] = useState<T>(() => {
    try {
      const bruto = localStorage.getItem(chave);
      return bruto === null ? inicial : (JSON.parse(bruto) as T);
    } catch {
      return inicial;
    }
  });
  const definir = useCallback(
    (novo: T | ((v: T) => T)) => {
      setValor((atual) => {
        const v = typeof novo === 'function' ? (novo as (v: T) => T)(atual) : novo;
        try {
          localStorage.setItem(chave, JSON.stringify(v));
        } catch {
          /* ignora */
        }
        return v;
      });
    },
    [chave],
  );
  return [valor, definir] as const;
}
