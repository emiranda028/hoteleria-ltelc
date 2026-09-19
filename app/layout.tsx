import './globals.css';

export const metadata = {
  title: 'Informe de Gestión – Grupo Hoteles | LTELC',
  description: 'Informe comparativo 2024 vs 2025 con KPIs dinámicos.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
