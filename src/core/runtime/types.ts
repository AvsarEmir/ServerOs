import type {
  APIEmbed,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  InteractionReplyOptions,
  InteractionUpdateOptions,
} from "discord.js";
import type { PrismaClient } from "@prisma/client";
import type { AppRegistry } from "./AppRegistry.js";
import type { AppInstallations } from "../system/AppInstallations.js";
import type { AppLogger } from "../system/AppLogger.js";
import type { AppStorage } from "../system/AppStorage.js";
import type { AppHealth } from "../system/AppHealth.js";
import type { AppPermission, PermissionManager } from "../system/PermissionManager.js";
import type { ServerOSUI } from "../ui/ServerOSUI.js";

export interface AppCommandBuilder {
  toJSON(): any;
}

export type AppCategory =
  | "System"
  | "Productivity"
  | "Project Management"
  | "Knowledge"
  | "Automation"
  | "Moderation"
  | "Utility"
  | "Developer"
  | "Community"
  | "Analytics"
  | "Custom";

export type AppDependency =
  | string
  | {
      id: string;
      optional?: boolean;
      reason?: string;
    };

export interface AppSettingDefinition {
  type: "boolean" | "string" | "number" | "select";
  label: string;
  description?: string;
  default?: unknown;
  options?: string[];
}

export type AppSettingsSchema = Record<string, AppSettingDefinition>;

export interface AppMetadata {
  id: string;
  name: string;
  icon: string;
  version: string;
  description: string;
  author?: string;
  category: AppCategory | string;
  system?: boolean;
  permissions?: AppPermission[];
  dependencies?: AppDependency[];
  template?: string;
  defaultInstall?: boolean;
}

export interface AppContext {
  app: ServerOSApp;
  client: Client;
  prisma: PrismaClient;
  registry: AppRegistry;
  installations: AppInstallations;
  storage: AppStorage;
  logger: AppLogger;
  health: AppHealth;
  permissions: PermissionManager;
  ui: ServerOSUI;
  guildId: string;
  userId: string;
  interaction: ChatInputCommandInteraction | ButtonInteraction;
  reply(options: InteractionReplyOptions): Promise<void>;
  update(options: InteractionUpdateOptions): Promise<void>;
  switchApp(app: ServerOSApp): AppContext;
}

export type AppScreenRenderer = (ctx: AppContext) => Promise<InteractionReplyOptions | InteractionUpdateOptions | void>;

export interface ServerOSApp {
  metadata: AppMetadata;
  commands?: AppCommandBuilder[];
  screens?: Record<string, AppScreenRenderer>;
  settings?: AppSettingsSchema;

  install?(ctx: AppContext): Promise<void>;
  uninstall?(ctx: AppContext): Promise<void>;
  open(ctx: AppContext): Promise<void>;
  onCommand?(ctx: AppContext, interaction: ChatInputCommandInteraction): Promise<void>;
  onButton?(ctx: AppContext, interaction: ButtonInteraction): Promise<void>;
}

export interface CoreCommandContext {
  client: Client;
  prisma: PrismaClient;
  registry: AppRegistry;
  installations: AppInstallations;
  logger: AppLogger;
  health: AppHealth;
  permissions: PermissionManager;
  ui: ServerOSUI;
  guildId: string;
  userId: string;
  interaction: ChatInputCommandInteraction | ButtonInteraction;
  reply(options: InteractionReplyOptions): Promise<void>;
  update(options: InteractionUpdateOptions): Promise<void>;
  switchApp(app: ServerOSApp): AppContext;
}

export type PanelField = NonNullable<APIEmbed["fields"]>[number];
