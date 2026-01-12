export interface ConsultantCommentReadRepository {
    countByAction(selectedActionId: string): Promise<number>;
}
