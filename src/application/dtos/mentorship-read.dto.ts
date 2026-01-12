export type CycleHistoryDTO = {
    cycleId: string;
    closedAt: string;
    overallScore: number;
    scoresByArea: Record<string, number>;
    selectedActionsCount: number;
    evidenceCount: number;
    consultantCommentCount: number;
};

export type MaturityComparisonDTO = {
    baseCycleId: string;
    targetCycleId: string;
    overallDelta: number;
    areaDeltas: Record<string, number>;
    trend: 'IMPROVEMENT' | 'STAGNATION' | 'REGRESSION';
};
