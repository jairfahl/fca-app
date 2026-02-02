import { AuthProvider } from '@/lib/auth';

export const metadata = {
  title: 'Mentor Gerencial CNPJ',
  description: 'Mentor Gerencial CNPJ',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
