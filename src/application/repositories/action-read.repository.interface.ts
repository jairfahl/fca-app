export interface SelectedActionReadModel {
    selectedActionId: string;
    cycleId: string;
    actionCatalogId: string;
    status: string;
}

export interface ActionReadRepository {
    listByCycle(cycleId: string): Promise<SelectedActionReadModel[]>;
}
