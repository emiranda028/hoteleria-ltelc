"""
Seed de desarrollo: carga organizations/hotels + daily_metrics desde H_F.xlsx
en la base local, para validar que las vistas SQL (v_monthly_kpis_calc,
v_management_indices) devuelven los mismos números que ya validamos a mano
en el análisis anterior (metodología ponderada por ingresos/habitaciones).
"""
import pandas as pd
import numpy as np
import psycopg2
from psycopg2.extras import execute_values

CONN = dict(host='localhost', dbname='ltelc_dev', user='postgres', password='devpassword')

ORGS = [
    ('panatel', 'Panatel', False),
    ('numah', 'Numah', False),
    ('ltelc', 'LTELC (interno)', True),
]

HOTELS = [
    # code, name, org_slug
    ('MARRIOTT', 'Marriott Buenos Aires', 'panatel'),
    ('SHERATON_MDQ', 'Sheraton Mar del Plata', 'panatel'),
    ('SHERATON_BCR', 'Sheraton Bariloche', 'panatel'),
    ('CITY_EXPRESS_PLUS', 'City Express Plus', 'numah'),
    ('MAITEI', 'Maitei Posadas', 'numah'),
]

def main():
    conn = psycopg2.connect(**CONN)
    cur = conn.cursor()

    # --- orgs ---
    org_ids = {}
    for slug, name, is_internal in ORGS:
        cur.execute(
            "insert into organizations (slug, name, is_internal) values (%s,%s,%s) "
            "on conflict (slug) do update set name=excluded.name returning id",
            (slug, name, is_internal)
        )
        org_ids[slug] = cur.fetchone()[0]

    # --- hotels ---
    hotel_ids = {}
    for code, name, org_slug in HOTELS:
        cur.execute(
            "insert into hotels (organization_id, code, name) values (%s,%s,%s) "
            "on conflict (code) do update set name=excluded.name returning id",
            (org_ids[org_slug], code, name)
        )
        hotel_ids[code] = cur.fetchone()[0]
    conn.commit()
    print("orgs:", org_ids)
    print("hotels:", hotel_ids)

    # --- daily_metrics desde H_F.xlsx ---
    hf = pd.read_excel('/mnt/user-data/uploads/H_F.xlsx', sheet_name='H&F')
    hf['Fecha'] = pd.to_datetime(hf['Fecha'])

    code_map = {
        'MARRIOTT': 'MARRIOTT',
        'SHERATON MDQ': 'SHERATON_MDQ',
        'SHERATON BCR': 'SHERATON_BCR',
        'CITY EXPRESS PLUS': 'CITY_EXPRESS_PLUS',
        'MAITEI': 'MAITEI',
    }
    hf['hotel_code'] = hf['Empresa'].map(code_map)
    hf = hf[hf['hotel_code'].notna()]
    hf = hf[hf['HoF'].isin(['History','Forecast'])]  # descarta la fila "hoy"
    hf['hof'] = hf['HoF'].str.lower()

    # el error de tipeo confirmado (mismo criterio que antes) se carga IGUAL
    # a la base (para tener el registro auditable) pero marcado is_excluded=true,
    # en vez de borrarlo silenciosamente
    bad_mask = (hf['Fecha']==pd.Timestamp('2024-07-01')) & (hf['Empresa'].isin(['MAITEI','MARRIOTT']))

    rows = []
    for _, r in hf.iterrows():
        rows.append((
            hotel_ids[r['hotel_code']],
            r['Fecha'].date(),
            r['hof'],
            float(r['Total\nOcc.']) if pd.notna(r['Total\nOcc.']) else None,
            float(r['Arr.\nRooms']) if pd.notna(r['Arr.\nRooms']) else None,
            float(r['Comp.\nRooms']) if pd.notna(r['Comp.\nRooms']) else None,
            float(r['House\nUse']) if pd.notna(r['House\nUse']) else None,
            float(r['Dep.\nRooms']) if pd.notna(r['Dep.\nRooms']) else None,
            float(r['Day Use\nRooms']) if pd.notna(r['Day Use\nRooms']) else None,
            float(r['No Show\nRooms']) if pd.notna(r['No Show\nRooms']) else None,
            float(r['OOO\nRooms']) if pd.notna(r['OOO\nRooms']) else None,
            float(r['Adl. &\nChl.']) if pd.notna(r['Adl. &\nChl.']) else None,
            float(r['Room Revenue']) if pd.notna(r['Room Revenue']) else None,
            float(r['Average Rate']) if pd.notna(r['Average Rate']) else None,
            float(r['Occ.%']) if pd.notna(r['Occ.%']) else None,
            'seed',
            bool(bad_mask.loc[_]) if _ in bad_mask.index else False,
        ))

    cur.execute("delete from daily_metrics")  # idempotente para re-correr el seed
    execute_values(cur, """
        insert into daily_metrics
        (hotel_id, fecha, hof, total_occ_rooms, arr_rooms, comp_rooms, house_use_rooms,
         dep_rooms, day_use_rooms, no_show_rooms, ooo_rooms, adl_chl,
         room_revenue, average_rate_reported, occ_pct_reported, source, is_excluded)
        values %s
    """, rows)
    conn.commit()
    print(f"cargadas {len(rows)} filas de daily_metrics")

    # flag de calidad para la fila excluida
    cur.execute("""
        insert into data_quality_flags (daily_metric_id, flag_type, detail, resolved)
        select id, 'duplicate_value_across_hotels',
               'Tarifa 175336.63 duplicada e inconsistente en MAITEI y MARRIOTT el mismo día',
               true
        from daily_metrics where is_excluded = true
    """)
    conn.commit()

    cur.close()
    conn.close()

if __name__ == '__main__':
    main()
