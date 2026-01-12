/**
 * Supabase Client
 * 
 * Centralized database access via Supabase.
 * Singleton pattern to ensure single connection instance.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

/**
 * Get or create Supabase client instance
 */
export function getSupabaseClient(): SupabaseClient {
    if (supabaseInstance) {
        return supabaseInstance;
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;

    // FORCE service_role for integration tests (bypasses RLS)
    let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Only fall back to anon if service_role is not set
    if (!supabaseKey) {
        supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
        console.log('⚠️ Using ANON key - tests may fail with permission errors');
    } else {
        console.log('✅ Using SERVICE_ROLE key for database access');
    }

    if (!supabaseUrl || !supabaseKey) {
        throw new Error(
            'Missing Supabase configuration. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.'
        );
    }

    supabaseInstance = createClient(supabaseUrl, supabaseKey, {
        auth: {
            persistSession: false,
        },
    });

    return supabaseInstance;
}

/**
 * Reset client instance (useful for testing)
 */
export function resetSupabaseClient(): void {
    supabaseInstance = null;
}

/**
 * Database types for better type safety
 */
export type Database = {
    public: {
        Tables: {
            segment: any;
            company: any;
            user: any;
            area: any;
            process: any;
            question: any;
            answer_option: any;
            assessment_cycle: any;
            diagnostic_response: any;
            process_score: any;
            recommendation: any;
            action_catalog: any;
            selected_action: any;
            evidence: any;
        };
    };
};
