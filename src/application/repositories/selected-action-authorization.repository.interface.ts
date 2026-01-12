export interface SelectedActionAuthorizationRepository {
    assertBelongsToCompanyAndCycle(input: {
        selectedActionId: string;
        companyId: string;
        cycleId: string;
    }): Promise<void>;
}
