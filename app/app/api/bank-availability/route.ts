import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/bank-availability
 *
 * Última foto de Disponibilidades Bancarias por hotel (tabla nueva
 * bank_availability + vista v_bank_availability_latest, ver migración
 * 0005/0006). Devuelve un array plano de filas {hotel_id, fecha, concepto,
 * tipo_moneda, importe} — el frontend arma los totales por hotel/concepto.
 *
 * Si Emma todavía no corrió la migración 0005/0006 o no cargó datos, esto
 * devuelve data: [] sin romper nada (la vista simplemente no existe/está
 * vacía todavía); el panel debe mostrar el bloque de Disponibilidades como
 * "sin datos" en ese caso, no ocultarlo.
 */
export async function GET() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('v_bank_availability_latest')
    .select('hotel_id, fecha, concepto, tipo_moneda, importe');

  if (error) {
    // La tabla/vista puede no existir todavía si Emma no corrió la
    // migración 0005/0006 — no lo tratamos como error fatal del endpoint.
    return NextResponse.json({ data: [], warning: error.message });
  }

  return NextResponse.json({ data: data ?? [] });
}
