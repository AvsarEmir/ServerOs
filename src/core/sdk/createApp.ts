import type { AppContext, ServerOSApp } from "../runtime/types.js";

export type CreateAppOptions = Omit<ServerOSApp, "open"> & {
  open?: ServerOSApp["open"];
};

export function createApp(options: CreateAppOptions): ServerOSApp {
  const app: ServerOSApp = {
    ...options,
    async open(ctx: AppContext) {
      if (options.open) {
        await options.open(ctx);
        return;
      }

      const home = options.screens?.home;
      if (!home) {
        await ctx.reply({
          embeds: [
            ctx.ui.embed({
              title: `${options.metadata.icon} ${options.metadata.name}`,
              description: options.metadata.description,
              footer: "Opened through ServerOS App SDK"
            })
          ]
        });
        return;
      }

      const result = await home(ctx);
      if (result) {
        await ctx.reply(result as any);
      }
    }
  };

  return app;
}
