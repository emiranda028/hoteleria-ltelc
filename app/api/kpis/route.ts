import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/kpis?mes=2026-07
 *
 * Devuelve los KPIs mensuales (v_monthly_kpis_calc) para los hoteles que
 * el usuario logueado puede ver. No hace falta pasar organization_id ni
 * hotel_id: RLS ya restringe las filas según el perfil del usuario de la
 * sesión (ver supabase/migrations/0003_rls.sql). Un usuario de Panatel
 * jamás recibe filas de Numah desde este mismo endpoint, sin lógica extra.
 */
export async function GET(request: Request) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const mes = searchParams.get('mes');

  let query = supabase
    .from('v_monthly_kpis_calc')
    .select('hotel_id, mes, hof, occ_pct, adr, revpar, room_revenue, dias')
    .eq('hof', 'history')
    .order('mes', { ascending: false });

  if (mes) query = query.eq('mes', mes);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
