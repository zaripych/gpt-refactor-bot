export class ImportNotAllowedError extends Error {
    public readonly moduleId?: string;

    constructor(opts?: { moduleId?: string; message?: string }) {
        super(
            opts?.message ??
                'Importing is not allowed in this sandbox environment'
        );
        this.moduleId = opts?.moduleId;
    }
}
