export interface ConsultantComment {
    id: string;
    selectedActionId: string;
    cycleId: string;
    companyId: string;
    consultantId: string;
    content: string;
    createdAt: Date;
}

export interface ConsultantCommentRepository {
    add(comment: {
        selectedActionId: string;
        cycleId: string;
        companyId: string;
        consultantId: string;
        content: string;
    }): Promise<void>;

    getLastForAction(selectedActionId: string): Promise<ConsultantComment | null>;
}
