import { PermissionFlagsBits, type ButtonInteraction, type ChatInputCommandInteraction } from "discord.js";

export type ServerOSAction =
  | "apps:install"
  | "apps:uninstall"
  | "apps:open"
  | "logs:view"
  | "system:view"
  | "system:manage";

export const APP_PERMISSIONS = [
  "storage:read",
  "storage:write",
  "ui:reply",
  "apps:open",
  "logs:write",
  "system:read",
  "moderation:case:create",
  "automation:write"
] as const;

export type AppPermission = (typeof APP_PERMISSIONS)[number];

export class PermissionManager {
  constructor(private interaction: ChatInputCommandInteraction | ButtonInteraction) {}

  isRoot(): boolean {
    const permissions = this.interaction.memberPermissions;
    if (!permissions) {
      return false;
    }

    return permissions.has(PermissionFlagsBits.Administrator) || permissions.has(PermissionFlagsBits.ManageGuild);
  }

  can(action: ServerOSAction): boolean {
    if (action === "apps:open" || action === "system:view") {
      return true;
    }

    return this.isRoot();
  }

  explain(action: ServerOSAction): string {
    if (this.can(action)) {
      return "Allowed";
    }

    return "This action requires Administrator or Manage Server permission.";
  }

  async require(action: ServerOSAction): Promise<boolean> {
    if (this.can(action)) {
      return true;
    }

    const message = `🔒 Permission denied. ${this.explain(action)}`;

    if (this.interaction.replied || this.interaction.deferred) {
      await this.interaction.followUp({ content: message, ephemeral: true });
    } else {
      await this.interaction.reply({ content: message, ephemeral: true });
    }

    return false;
  }
}
