export async function bootstrap(load: () => Promise<unknown>) {
    await import('dotenv').then((dotenv) =>
        dotenv.config({
            override: true,
        })
    );
    await load();
}
