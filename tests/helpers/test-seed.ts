import { SupabaseDbClient } from '../../infrastructure/database/supabase-db-client'

export async function seedCompanyForUser(userId: string): Promise<{ companyId: string }> {
    const dbClient = new SupabaseDbClient()
    const companyId = 'd290f1ee-6c54-4b01-90e6-d701748f0851'

    const { error } = await (dbClient as any).supabase
        .from('company')
        .upsert({
            company_id: companyId,
            display_name: 'Test Company',
            segment_id: 'C',
            created_by: userId,
            created_at: new Date().toISOString()
        }, { onConflict: 'company_id' })

    if (error) {
        throw new Error(`Failed to seed company: ${error.message}`)
    }

    return { companyId }
}

export async function cleanupCompany(companyId: string): Promise<void> {
    const dbClient = new SupabaseDbClient()

    await (dbClient as any).supabase
        .from('assessment_cycle')
        .delete()
        .eq('company_id', companyId)

    await (dbClient as any).supabase
        .from('company')
        .delete()
        .eq('company_id', companyId)
}
