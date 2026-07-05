export const TRANSPORT_TYPES = ['stdio', 'streamable-http'] as const;

export type TransportType = (typeof TRANSPORT_TYPES)[number];
