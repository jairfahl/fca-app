/**
 * MaturityService Unit Tests
 */

import { MaturityService } from './maturity.service';
import { DomainError, ErrorCode } from '../errors';

describe('MaturityService', () => {
    let service: MaturityService;

    beforeEach(() => {
        service = new MaturityService();
    });

    describe('classifyMaturityLevel', () => {
        it('should classify score 0 as LOW', () => {
            expect(service.classifyMaturityLevel(0)).toBe('LOW');
        });

        it('should classify score 40 as LOW', () => {
            expect(service.classifyMaturityLevel(40)).toBe('LOW');
        });

        it('should classify score 41 as MEDIUM', () => {
            expect(service.classifyMaturityLevel(41)).toBe('MEDIUM');
        });

        it('should classify score 70 as MEDIUM', () => {
            expect(service.classifyMaturityLevel(70)).toBe('MEDIUM');
        });

        it('should classify score 71 as HIGH', () => {
            expect(service.classifyMaturityLevel(71)).toBe('HIGH');
        });

        it('should classify score 100 as HIGH', () => {
            expect(service.classifyMaturityLevel(100)).toBe('HIGH');
        });

        it('should classify score 25.5 as LOW', () => {
            expect(service.classifyMaturityLevel(25.5)).toBe('LOW');
        });

        it('should classify score 55.75 as MEDIUM', () => {
            expect(service.classifyMaturityLevel(55.75)).toBe('MEDIUM');
        });

        it('should classify score 88.33 as HIGH', () => {
            expect(service.classifyMaturityLevel(88.33)).toBe('HIGH');
        });

        it('should throw error for score < 0', () => {
            expect(() => service.classifyMaturityLevel(-1)).toThrow(DomainError);
            try {
                service.classifyMaturityLevel(-1);
            } catch (error) {
                expect(error).toBeInstanceOf(DomainError);
                expect((error as DomainError).code).toBe(ErrorCode.INVALID_SCORE);
            }
        });

        it('should throw error for score > 100', () => {
            expect(() => service.classifyMaturityLevel(101)).toThrow(DomainError);
            try {
                service.classifyMaturityLevel(101);
            } catch (error) {
                expect(error).toBeInstanceOf(DomainError);
                expect((error as DomainError).code).toBe(ErrorCode.INVALID_SCORE);
            }
        });

        it('should throw error for NaN', () => {
            expect(() => service.classifyMaturityLevel(NaN)).toThrow(DomainError);
        });

        it('should throw error for Infinity', () => {
            expect(() => service.classifyMaturityLevel(Infinity)).toThrow(DomainError);
        });
    });

    describe('getMaturityBand', () => {
        it('should return LOW band for score 20', () => {
            const band = service.getMaturityBand(20);
            expect(band.level).toBe('LOW');
            expect(band.minScore).toBe(0);
            expect(band.maxScore).toBe(40);
            expect(band.label).toBe('Iniciante');
        });

        it('should return MEDIUM band for score 50', () => {
            const band = service.getMaturityBand(50);
            expect(band.level).toBe('MEDIUM');
            expect(band.minScore).toBe(41);
            expect(band.maxScore).toBe(70);
            expect(band.label).toBe('Em Desenvolvimento');
        });

        it('should return HIGH band for score 85', () => {
            const band = service.getMaturityBand(85);
            expect(band.level).toBe('HIGH');
            expect(band.minScore).toBe(71);
            expect(band.maxScore).toBe(100);
            expect(band.label).toBe('Maduro');
        });
    });

    describe('calculateGapToNextLevel', () => {
        it('should calculate gap from LOW to MEDIUM', () => {
            expect(service.calculateGapToNextLevel(30)).toBe(11); // 41 - 30
        });

        it('should calculate gap at LOW boundary', () => {
            expect(service.calculateGapToNextLevel(40)).toBe(1); // 41 - 40
        });

        it('should calculate gap from MEDIUM to HIGH', () => {
            expect(service.calculateGapToNextLevel(60)).toBe(11); // 71 - 60
        });

        it('should calculate gap at MEDIUM boundary', () => {
            expect(service.calculateGapToNextLevel(70)).toBe(1); // 71 - 70
        });

        it('should return null at highest level', () => {
            expect(service.calculateGapToNextLevel(100)).toBeNull();
        });

        it('should return null at HIGH level start', () => {
            expect(service.calculateGapToNextLevel(71)).toBeNull();
        });

        it('should handle decimal scores', () => {
            expect(service.calculateGapToNextLevel(35.5)).toBe(5.5); // 41 - 35.5
        });
    });

    describe('getMaturityClassification', () => {
        it('should return complete classification for LOW score', () => {
            const classification = service.getMaturityClassification(25);
            expect(classification.score).toBe(25);
            expect(classification.level).toBe('LOW');
            expect(classification.band.level).toBe('LOW');
            expect(classification.gapToNextLevel).toBe(16); // 41 - 25
        });

        it('should return complete classification for MEDIUM score', () => {
            const classification = service.getMaturityClassification(55);
            expect(classification.score).toBe(55);
            expect(classification.level).toBe('MEDIUM');
            expect(classification.band.level).toBe('MEDIUM');
            expect(classification.gapToNextLevel).toBe(16); // 71 - 55
        });

        it('should return complete classification for HIGH score', () => {
            const classification = service.getMaturityClassification(90);
            expect(classification.score).toBe(90);
            expect(classification.level).toBe('HIGH');
            expect(classification.band.level).toBe('HIGH');
            expect(classification.gapToNextLevel).toBeNull();
        });
    });
});
