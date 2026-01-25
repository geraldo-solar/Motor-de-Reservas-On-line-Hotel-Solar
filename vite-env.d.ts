/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string
    readonly VITE_SUPABASE_ANON_KEY: string
    readonly VITE_BREVO_API_KEY: string
    readonly VITE_MANYCHAT_API_KEY: string
    readonly VITE_MANYCHAT_FLOW_CONFIRMATION: string
    readonly VITE_MANYCHAT_FLOW_CANCELLATION: string
    readonly VITE_MANYCHAT_FLOW_PAYMENT: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
