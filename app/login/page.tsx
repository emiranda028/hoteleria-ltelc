'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);
    if (error) {
      setError('Email o contraseña incorrectos.');
      return;
    }
    router.push(searchParams.get('next') || '/');
    router.refresh();
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f5f6f9', fontFamily: '-apple-system, sans-serif',
    }}>
      <form onSubmit={handleSubmit} style={{
        background: '#fff', padding: '32px', borderRadius: '12px', border: '1px solid #e1e4ea',
        width: '340px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#A0072B' }} />
          <h1 style={{ fontSize: '15px', fontWeight: 600, margin: 0, color: '#1c1c1c' }}>
            LTELC · Portal de clientes
          </h1>
        </div>

        <label style={{ fontSize: '12px', color: '#6b7280' }}>Email</label>
        <input
          type="email" required value={email} onChange={e => setEmail(e.target.value)}
          style={{ width: '100%', padding: '9px 12px', marginTop: 4, marginBottom: 14, borderRadius: 8, border: '1px solid #e1e4ea' }}
        />

        <label style={{ fontSize: '12px', color: '#6b7280' }}>Contraseña</label>
        <input
          type="password" required value={password} onChange={e => setPassword(e.target.value)}
          style={{ width: '100%', padding: '9px 12px', marginTop: 4, marginBottom: 18, borderRadius: 8, border: '1px solid #e1e4ea' }}
        />

        {error && <p style={{ color: '#A0072B', fontSize: '12.5px', marginBottom: 12 }}>{error}</p>}

        <button type="submit" disabled={loading} style={{
          width: '100%', padding: '10px', borderRadius: 8, border: 'none',
          background: '#1c1c1c', color: '#fff', fontWeight: 500, cursor: 'pointer',
          opacity: loading ? 0.6 : 1,
        }}>
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
