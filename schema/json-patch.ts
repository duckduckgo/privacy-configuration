/** An RFC 6902 operation that writes a value: `add`, `replace`, or `test` against it. */
type ValueOperation<ValueType> = {
    op: 'add' | 'replace' | 'test';
    path: string;
    value: ValueType;
};

/** An RFC 6902 operation that takes its value from another location. */
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
