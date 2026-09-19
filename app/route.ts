import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/daily-metrics.csv
 *
 * Reemplaza al archivo estático /data/hf_diario.csv que leían los
 * componentes del dashboard (YearComparator, HofDataProvider, etc). Devuelve
 * el mismo formato de columnas (Fecha, Empresa, HoF, Total Occ., House Use,
 * Occ.%, Room Revenue, Average Rate, Adl. & Chl.) para no tener que tocar
 * ningún componente visual -- es un cambio de fuente de datos, no de diseño.
 *
 * La diferencia clave: las filas que devuelve están automáticamente
 * filtradas por RLS según el usuario logueado (ver supabase/migrations/
 * 0003_rls.sql). Un usuario de Panatel nunca recibe filas de Numah desde
 * este endpoint, ni con un cliente que arme el request a mano.
 *
 * Los números se formatean en convención es-AR (punto de miles, coma
 * decimal) porque así es como los parsea `toNumberSmart` en
 * app/components/hofModel.ts y useCsvClient.ts (heredado del CSV original).
 * Por eso el delimitador de columnas es ';' y no ',' -- si usáramos coma,
 * chocaría con la coma decimal de los números.
 */

function esNumber(n: number | null, decimals: number): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  return n.toLocaleString('es-AR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function csvEscape(v: string): string {
  if (v.includes(';') || v.includes('"') || v.includes('\n')) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

export async function GET() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response('No autenticado', { status: 401 });
  }

  const { data, error } = await supabase
    .from('daily_metrics')
    .select('fecha, hof, total_occ_rooms, house_use_rooms, occ_pct_reported, room_revenue, average_rate_reported, adl_chl, hotels(code)')
    .eq('is_excluded', false)
    .order('fecha', { ascending: true });

  if (error) {
    return new Response(`Error consultando daily_metrics: ${error.message}`, { status: 500 });
  }

  const headers = ['Fecha', 'Empresa', 'HoF', 'Total Occ.', 'House Use', 'Occ.%', 'Room Revenue', 'Average Rate', 'Adl. & Chl.'];
  const lines = [headers.join(';')];

  for (const row of data ?? []) {
    const hotel = Array.isArray((row as any).hotels) ? (row as any).hotels[0] : (row as any).hotels;
    const empresa = hotel?.code ?? '';
    const hof = row.hof === 'history' ? 'History' : 'Forecast';

    lines.push([
      csvEscape(row.fecha),
      csvEscape(empresa),
      csvEscape(hof),
      csvEscape(esNumber(row.total_occ_rooms, 0)),
      csvEscape(esNumber(row.house_use_rooms, 0)),
      csvEscape(esNumber(row.occ_pct_reported, 4)),
      csvEscape(esNumber(row.room_revenue, 2)),
      csvEscape(esNumber(row.average_rate_reported, 2)),
      csvEscape(esNumber(row.adl_chl, 0)),
    ].join(';'));
  }

  return new Response(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
