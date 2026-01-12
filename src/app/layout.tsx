import './globals.css'
import { AuthGuard } from '@/components/AuthGuard'
import { CompanyGuard } from '@/components/CompanyGuard'
import { CycleGuard } from '@/components/CycleGuard'
import { ResultsGuard } from '@/components/ResultsGuard'

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="pt-BR">
            <body>
                <AuthGuard>
                    <CompanyGuard>
                        <CycleGuard>
                            <ResultsGuard>
                                {children}
                            </ResultsGuard>
                        </CycleGuard>
                    </CompanyGuard>
                </AuthGuard>
            </body>
        </html>
    )
}
