export interface ActionEvidenceRepository {
    add(evidence: {
        selectedActionId: string;
        cycleId: string;
        companyId: string;
        content: string;
        createdBy: string;
    }): Promise<void>;

    existsForAction(selectedActionId: string): Promise<boolean>;
}
