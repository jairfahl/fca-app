/**
 * Recommendation Repository Interface
 */

export interface IRecommendationRepository {
    /**
     * Get process scores for a cycle
     */
    getProcessScores(cycleId: string): Promise<Array<{ process_id: string; maturity_level: string }>>;

    /**
     * Get recommendation for a process and maturity level
     */
    getRecommendation(
        processId: string,
        maturityLevel: string
    ): Promise<{
        recommendation_id: string;
        process_id: string;
        recommendation_text: string;
    } | null>;
}
