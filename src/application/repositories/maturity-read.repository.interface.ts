export interface MaturityReadRepository {
    getOverallScore(cycleId: string): Promise<number>;
    getAreaScores(cycleId: string): Promise<Record<string, number>>;
}
