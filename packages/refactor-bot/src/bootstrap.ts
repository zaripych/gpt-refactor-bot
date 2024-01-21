export async function bootstrap(load: () => Promise<unknown>) {
    if (process.argv.includes('--inspect')) {
        await import('inspector').then((inspector) => {
            console.log('Attach to PID', process.pid);
            inspector.open(undefined, undefined, true);
            // eslint-disable-next-line no-debugger
            debugger;
        });
    }
    await import('dotenv').then((dotenv) =>
        dotenv.config({
            override: true,
        })
    );
    return await load();
}
