export interface CycleReadModel {
    cycleId: string;
    companyId: string;
    status: string;
    closedAt: string | null;
}

export interface CycleReadRepository {
    listClosedByCompany(companyId: string): Promise<CycleReadModel[]>;
    getClosedById(cycleId: string): Promise<CycleReadModel | null>;
}
