/**
 * Supabase Database Client Implementation
 * 
 * Adapter that implements DbClient using Supabase SDK.
 * This is the ONLY place that imports and uses @supabase/supabase-js.
 */

import { getSupabaseClient } from './supabase.client';
import {
    DbClient,
    CreateCycleData,
    CycleRecord,
    UpdateCycleData,
    ProcessRecord,
    QuestionRecord,
    DiagnosticResponseRecord,
    CreateDiagnosticResponseData,
    AnswerWithScore,
    ProcessScoreRecord,
    ProcessScoreWithMaturity,
    RecommendationRecord,
    ActionRecord,
    ActionStatusRecord,
} from './db-client.interface';
import { SegmentId } from '../../domain/types/segment.types';

export class SupabaseDbClient implements DbClient {
    private supabase = getSupabaseClient();

    // Cycle operations
    async createCycle(data: CreateCycleData): Promise<CycleRecord> {
        const { data: result, error } = await this.supabase
            .from('assessment_cycle')
            .insert(data)
            .select()
            .single();

        if (error || !result) {
            throw new Error(`Failed to create cycle: ${error?.message}`);
        }

        return result;
    }

    async getActiveCycle(companyId: string): Promise<CycleRecord | null> {
        const { data, error } = await this.supabase
            .from('assessment_cycle')
            .select('*')
            .eq('company_id', companyId)
            .eq('status', 'in_progress')
            .maybeSingle();

        if (error) {
            throw new Error(`Failed to get active cycle: ${error.message}`);
        }

        return data;
    }

    async getCycleById(cycleId: string): Promise<CycleRecord | null> {
        const { data, error } = await this.supabase
            .from('assessment_cycle')
            .select('*')
            .eq('assessment_cycle_id', cycleId)
            .maybeSingle();

        if (error) {
            throw new Error(`Failed to get cycle: ${error.message}`);
        }

        return data;
    }

    async updateCycle(cycleId: string, updateData: UpdateCycleData): Promise<CycleRecord> {
        const { data, error } = await this.supabase
            .from('assessment_cycle')
            .update(updateData)
            .eq('assessment_cycle_id', cycleId)
            .select()
            .single();

        if (error || !data) {
            throw new Error(`Failed to update cycle: ${error?.message}`);
        }

        return data;
    }

    async getActionStatuses(cycleId: string): Promise<ActionStatusRecord[]> {
        const { data, error } = await this.supabase
            .from('selected_action')
            .select('status')
            .eq('assessment_cycle_id', cycleId);

        if (error) {
            throw new Error(`Failed to get action statuses: ${error.message}`);
        }

        return data || [];
    }

    async updateActionStatus(actionId: string, status: string, completedAt?: string): Promise<void> {
        const updateData: any = { status };
        if (completedAt) {
            updateData.completed_at = completedAt;
        }

        const { error } = await this.supabase
            .from('selected_action')
            .update(updateData)
            .eq('selected_action_id', actionId);

        if (error) {
            throw new Error(`Failed to update action status: ${error.message}`);
        }
    }

    // Diagnostic operations
    async getProcessesBySegment(segmentId: SegmentId): Promise<ProcessRecord[]> {
        const { data, error } = await this.supabase
            .from('process')
            .select('*')
            .eq('segment_id', segmentId)
            .order('display_order', { ascending: true });

        if (error) {
            throw new Error(`Failed to get processes: ${error.message}`);
        }

        return data || [];
    }

    async getQuestionsByProcess(processId: string): Promise<QuestionRecord[]> {
        const { data, error } = await this.supabase
            .from('question')
            .select('*')
            .eq('process_id', processId)
            .eq('is_current', true);

        if (error) {
            throw new Error(`Failed to get questions: ${error.message}`);
        }

        return data || [];
    }

    async getExistingResponse(cycleId: string, questionId: string): Promise<{ response_id: string } | null> {
        const { data, error } = await this.supabase
            .from('diagnostic_response')
            .select('response_id')
            .eq('assessment_cycle_id', cycleId)
            .eq('question_id', questionId)
            .maybeSingle();

        if (error) {
            throw new Error(`Failed to check existing response: ${error.message}`);
        }

        return data;
    }

    async createDiagnosticResponse(responseData: CreateDiagnosticResponseData): Promise<DiagnosticResponseRecord> {
        const { data, error } = await this.supabase
            .from('diagnostic_response')
            .insert(responseData)
            .select()
            .single();

        if (error || !data) {
            throw new Error(`Failed to create diagnostic response: ${error?.message}`);
        }

        return data;
    }

    async getCompanyIdByCycle(cycleId: string): Promise<string | null> {
        const { data, error } = await this.supabase
            .from('assessment_cycle')
            .select('company_id')
            .eq('assessment_cycle_id', cycleId)
            .single();

        if (error || !data) {
            return null;
        }

        return data.company_id;
    }

    async getSegmentByCompany(companyId: string): Promise<SegmentId | null> {
        const { data, error } = await this.supabase
            .from('company')
            .select('segment_id')
            .eq('company_id', companyId)
            .single();

        if (error || !data) {
            return null;
        }

        return data.segment_id as SegmentId;
    }

    async countQuestionsByProcessIds(processIds: string[]): Promise<number> {
        const { count, error } = await this.supabase
            .from('question')
            .select('question_id', { count: 'exact', head: true })
            .eq('is_current', true)
            .in('process_id', processIds);

        if (error) {
            throw new Error(`Failed to count questions: ${error.message}`);
        }

        return count || 0;
    }

    async countResponsesByCycle(cycleId: string): Promise<number> {
        const { count, error } = await this.supabase
            .from('diagnostic_response')
            .select('response_id', { count: 'exact', head: true })
            .eq('assessment_cycle_id', cycleId);

        if (error) {
            throw new Error(`Failed to count responses: ${error.message}`);
        }

        return count || 0;
    }

    // Scoring operations
    async getQuestionIdsByProcess(processId: string): Promise<string[]> {
        const { data, error } = await this.supabase
            .from('question')
            .select('question_id')
            .eq('process_id', processId)
            .eq('is_current', true);

        if (error) {
            throw new Error(`Failed to get question IDs: ${error.message}`);
        }

        return (data || []).map((q: any) => q.question_id);
    }

    async getResponsesWithScores(cycleId: string, questionIds: string[]): Promise<AnswerWithScore[]> {
        const { data, error } = await this.supabase
            .from('diagnostic_response')
            .select(`
        response_id,
        answer_option:answer_option_id (
          score_value
        )
      `)
            .eq('assessment_cycle_id', cycleId)
            .in('question_id', questionIds);

        if (error) {
            throw new Error(`Failed to get responses with scores: ${error.message}`);
        }

        // Supabase returns answer_option as array, we need to flatten it
        return (data || []).map((item: any) => ({
            response_id: item.response_id,
            answer_option: Array.isArray(item.answer_option) ? item.answer_option[0] : item.answer_option,
        }));
    }

    async saveProcessScores(scores: ProcessScoreRecord[]): Promise<void> {
        const { error } = await this.supabase
            .from('process_score')
            .insert(scores);

        if (error) {
            throw new Error(`Failed to save process scores: ${error.message}`);
        }
    }

    async getProcessIdsBySegment(segmentId: SegmentId): Promise<string[]> {
        const { data, error } = await this.supabase
            .from('process')
            .select('process_id')
            .eq('segment_id', segmentId);

        if (error) {
            throw new Error(`Failed to get process IDs: ${error.message}`);
        }

        return (data || []).map((p: any) => p.process_id);
    }

    // Recommendation operations
    async getProcessScoresByCycle(cycleId: string): Promise<ProcessScoreWithMaturity[]> {
        const { data, error } = await this.supabase
            .from('process_score')
            .select('process_id, maturity_level')
            .eq('assessment_cycle_id', cycleId);

        if (error) {
            throw new Error(`Failed to get process scores: ${error.message}`);
        }

        return data || [];
    }

    async getRecommendation(processId: string, maturityLevel: string): Promise<RecommendationRecord | null> {
        const { data, error } = await this.supabase
            .from('recommendation')
            .select('*')
            .eq('process_id', processId)
            .eq('maturity_level', maturityLevel)
            .eq('is_current', true)
            .maybeSingle();

        if (error) {
            throw new Error(`Failed to get recommendation: ${error.message}`);
        }

        return data;
    }

    // Action catalog operations
    async getCurrentActions(): Promise<ActionRecord[]> {
        const { data, error } = await this.supabase
            .from('action_catalog')
            .select('*')
            .eq('is_current', true);

        if (error) {
            throw new Error(`Failed to get current actions: ${error.message}`);
        }

        return data || [];
    }

    async getActionsByRecommendation(recommendationId: string): Promise<ActionRecord[]> {
        const { data, error } = await this.supabase
            .from('action_catalog')
            .select('*')
            .eq('recommendation_id', recommendationId)
            .eq('is_current', true);

        if (error) {
            throw new Error(`Failed to get actions by recommendation: ${error.message}`);
        }

        return data || [];
    }

    async getActionById(actionId: string): Promise<ActionRecord | null> {
        const { data, error } = await this.supabase
            .from('action_catalog')
            .select('*')
            .eq('action_catalog_id', actionId)
            .eq('is_current', true)
            .maybeSingle();

        if (error) {
            throw new Error(`Failed to get action by ID: ${error.message}`);
        }

        return data;
    }

    async getActionsBySegment(segmentId: SegmentId): Promise<ActionRecord[]> {
        const { data, error } = await this.supabase
            .from('action_catalog')
            .select(`
        *,
        recommendation:recommendation_id (
          process:process_id (
            segment_id
          )
        )
      `)
            .eq('is_current', true);

        if (error) {
            throw new Error(`Failed to get actions by segment: ${error.message}`);
        }

        // Filter by segment transitively
        return (data || []).filter((a: any) => a.recommendation?.process?.segment_id === segmentId);
    }

    async getCompanyByUserId(userId: string): Promise<{ company_id: string } | null> {
        const { data, error } = await this.supabase
            .from('company')
            .select('company_id')
            .eq('created_by', userId)
            .maybeSingle();

        if (error) {
            throw new Error(`Failed to get company by user: ${error.message}`);
        }

        return data;
    }

    async getCompanyById(companyId: string): Promise<any | null> {
        const { data, error } = await this.supabase
            .from('company')
            .select('*')
            .eq('company_id', companyId)
            .maybeSingle();

        if (error) {
            throw new Error(`Failed to get company: ${error.message}`);
        }

        return data;
    }

    async getSelectedActionById(selectedActionId: string): Promise<any | null> {
        const { data, error } = await this.supabase
            .from('selected_action')
            .select('*')
            .eq('selected_action_id', selectedActionId)
            .maybeSingle();

        if (error) {
            throw new Error(`Failed to get selected action: ${error.message}`);
        }

        return data;
    }

    async getSelectedActionsByCycle(cycleId: string): Promise<any[]> {
        const { data, error } = await this.supabase
            .from('selected_action')
            .select('*')
            .eq('assessment_cycle_id', cycleId);

        if (error) {
            throw new Error(`Failed to get selected actions: ${error.message}`);
        }

        return data || [];
    }

    async getScoresByCycle(cycleId: string): Promise<any[]> {
        const { data, error } = await this.supabase
            .from('process_score')
            .select('*')
            .eq('assessment_cycle_id', cycleId);

        if (error) {
            throw new Error(`Failed to get scores: ${error.message}`);
        }

        return data || [];
    }

    async getRecommendationsByCycle(cycleId: string): Promise<any[]> {
        const { data, error } = await this.supabase
            .from('recommendation')
            .select('*')
            .eq('assessment_cycle_id', cycleId)
            .eq('is_current', true);

        if (error) {
            throw new Error(`Failed to get recommendations: ${error.message}`);
        }

        return data || [];
    }
}
