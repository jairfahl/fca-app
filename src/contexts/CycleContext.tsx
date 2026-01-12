'use client';

import { createContext, useContext } from 'react';

type CycleContextType = {
    cycleId: string | null;
};

const CycleContext = createContext<CycleContextType | undefined>(undefined);

export const CycleProvider = CycleContext.Provider;

export function useCycle() {
    const context = useContext(CycleContext);
    if (context === undefined) {
        throw new Error('useCycle must be used within a CycleProvider');
    }
    return context;
}
