export type Operation<ValueType> = {
    op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
    from?: string;
    path: string;
    value: ValueType;
};
