import { Evidence, EvidenceType } from '../../domain/types/mentorship.types';

export interface IEvidenceRepository {
    submitEvidence(params: {
        selectedActionId: string;
        cycleId: string;
        type: EvidenceType;
        content: string;
        fileUrl?: string;
        submittedBy: string;
    }): Promise<Evidence>;

    getEvidencesByAction(selectedActionId: string): Promise<Evidence[]>;

    getEvidencesByCycle(cycleId: string): Promise<Evidence[]>;

    countEvidencesForAction(selectedActionId: string): Promise<number>;
}
