import { createBrowserClient } from '@supabase/ssr';

/**
 * Cliente de Supabase para usar en componentes de cliente ('use client').
 * La sesión (JWT) viaja en cookies, así que RLS se aplica automáticamente:
 * este cliente nunca puede ver más filas de las que las policies permiten
 * para el usuario logueado — no hace falta filtrar "por las dudas" en el
 * frontend, la base de datos ya lo hace.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
