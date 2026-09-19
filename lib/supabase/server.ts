import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Cliente de Supabase para Server Components, Route Handlers y Server
 * Actions. Lee la sesión desde las cookies de la request — mismo efecto:
 * las consultas quedan automáticamente acotadas por RLS al usuario logueado.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // se llama desde un Server Component sin permiso de escritura;
            // el middleware ya se encarga de refrescar la sesión en ese caso
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // idem
          }
        },
      },
    }
  );
}

/**
 * Cliente con la service_role key: se salta RLS por completo.
 * SOLO para el pipeline de automatización (ingesta de PDFs) y scripts de
 * backend que corren fuera de una sesión de usuario. Nunca importar este
 * archivo desde un componente que se ejecute en el browser.
 */
export function createServiceRoleClient() {
  const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
