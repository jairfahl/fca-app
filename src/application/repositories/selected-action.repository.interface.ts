export interface SelectedActionRepository {
    markAsCompleted(selectedActionId: string): Promise<void>;
}
