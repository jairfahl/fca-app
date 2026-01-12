import { CycleHistoryEntry, CycleSnapshot } from '../../domain/types/mentorship.types';

export interface ICycleHistoryRepository {
    getCycleHistory(companyId: string): Promise<CycleHistoryEntry[]>;

    getCycleSnapshot(cycleId: string): Promise<CycleSnapshot | null>;

    getLatestTwoCycles(companyId: string): Promise<[CycleSnapshot | null, CycleSnapshot | null]>;
}
