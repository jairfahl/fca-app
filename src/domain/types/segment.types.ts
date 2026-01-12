/**
 * Segment Types
 * 
 * Defines the three business segments supported by FCA-APP:
 * - C: Comércio (Commerce/Retail)
 * - I: Indústria (Industry/Manufacturing)
 * - S: Serviços (Services)
 */

export type SegmentId = 'C' | 'I' | 'S';

export interface Segment {
    segment_id: SegmentId;
    name: string;
    description: string | null;
    created_at: Date;
}

export const SEGMENT_IDS: SegmentId[] = ['C', 'I', 'S'];

export function isValidSegmentId(value: unknown): value is SegmentId {
    return typeof value === 'string' && SEGMENT_IDS.includes(value as SegmentId);
}
