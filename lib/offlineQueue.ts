import { supabase } from './supabase';
import { generateUUID } from '../utils/uuid';

export interface PendingAction {
    id: string;
    table: string;
    action: 'INSERT' | 'UPDATE' | 'UPSERT' | 'DELETE';
    data: any;
    filters?: { column: string; value: any }[];
    timestamp: number;
    retries: number;
}

const QUEUE_STORAGE_KEY = 'hotel_solar_reservas_offline_queue';
const LOCAL_SERVER_URL = typeof window !== 'undefined' ? (localStorage.getItem('LOCAL_SYNC_SERVER_URL') || 'http://localhost:3001') : 'http://localhost:3001';

class OfflineQueue {
    private queue: PendingAction[] = [];

    constructor() {
        this.loadQueue();
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => this.processQueue());
        }
    }

    private loadQueue() {
        if (typeof window === 'undefined') return;
        try {
            const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
            if (stored) {
                this.queue = JSON.parse(stored);
            }
        } catch (e) {
            console.error('Erro ao carregar fila offline:', e);
            this.queue = [];
        }
    }

    private saveQueue() {
        if (typeof window === 'undefined') return;
        try {
            localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.queue));
        } catch (e) {
            console.error('Erro ao salvar fila offline:', e);
        }
    }

    async enqueue(action: Omit<PendingAction, 'id' | 'timestamp' | 'retries'>) {
        const pendingAction: PendingAction = {
            ...action,
            id: generateUUID(),
            timestamp: Date.now(),
            retries: 0
        };

        // 1. TENTATIVA: Servidor Local (Wi-Fi Interno)
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1500);

            const response = await fetch(`${LOCAL_SERVER_URL}/api/queue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(action),
                signal: controller.signal
            });

            if (response.ok) {
                console.log('[OfflineQueue] Sincronizado via Servidor Local (Wi-Fi).');
                return pendingAction.id;
            }
        } catch (e) {
            console.warn('[OfflineQueue] Servidor local indisponível. Usando fila local.');
        }

        // 2. TENTATIVA: Normal (Fila Local/Supabase)
        this.queue.push(pendingAction);
        this.saveQueue();

        // Tentar processar imediatamente se estiver online
        if (navigator.onLine) {
            this.processQueue();
        }

        // Notificar UI
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('offline-queue-updated', { detail: { count: this.queue.length } }));
        }

        return pendingAction.id;
    }

    async processQueue() {
        if (this.queue.length === 0) return;
        console.log(`[OfflineQueue] Processando ${this.queue.length} ações pendentes...`);

        const actionsToProcess = [...this.queue];

        for (const action of actionsToProcess) {
            try {
                let query: any = supabase.from(action.table);

                switch (action.action) {
                    case 'INSERT':
                        query = query.insert(action.data);
                        break;
                    case 'UPDATE':
                        query = query.update(action.data);
                        if (action.filters) {
                            action.filters.forEach(f => query = query.eq(f.column, f.value));
                        }
                        break;
                    case 'UPSERT':
                        query = query.upsert(action.data);
                        break;
                    case 'DELETE':
                        query = query.delete();
                        if (action.filters) {
                            action.filters.forEach(f => query = query.eq(f.column, f.value));
                        }
                        break;
                }

                const { error } = await query;

                if (!error) {
                    console.log(`[OfflineQueue] Sucesso: ${action.action} em ${action.table}`);
                    this.queue = this.queue.filter(a => a.id !== action.id);
                    this.saveQueue();
                } else {
                    console.error(`[OfflineQueue] Erro ao processar ${action.id}:`, error);
                    if (error.message?.includes('failed to fetch') || error.message?.includes('NetworkError')) {
                        break;
                    }
                    action.retries++;
                    if (action.retries > 5) {
                        this.queue = this.queue.filter(a => a.id !== action.id);
                        this.saveQueue();
                    }
                }
            } catch (e) {
                console.error('[OfflineQueue] Erro inesperado:', e);
                break;
            }
        }

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('offline-queue-updated', { detail: { count: this.queue.length } }));
        }
    }

    getPendingCount() {
        return this.queue.length;
    }
}

export const offlineQueue = new OfflineQueue();
