type ValueOperation<ValueType> = {
    op: 'add' | 'replace' | 'test';
    path: string;
    value: ValueType;
};

type FromOperation = {
    op: 'move' | 'copy';
    from: string;
    path: string;
};

type RemoveOperation = {
    op: 'remove';
    path: string;
};

export type Operation<ValueType> = ValueOperation<ValueType> | FromOperation | RemoveOperation;
