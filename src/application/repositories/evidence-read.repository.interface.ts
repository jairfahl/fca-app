export interface EvidenceReadRepository {
    countByAction(selectedActionId: string): Promise<number>;
}
