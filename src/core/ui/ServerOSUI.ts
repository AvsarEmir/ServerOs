import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type APIEmbedField
} from "discord.js";

export class ServerOSUI {
  embed(options: {
    title: string;
    description?: string;
    fields?: APIEmbedField[];
    footer?: string;
  }): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(options.title)
      .setDescription(options.description ?? null)
      .setTimestamp(new Date());

    if (options.fields?.length) {
      embed.addFields(options.fields);
    }

    if (options.footer) {
      embed.setFooter({ text: options.footer });
    }

    return embed;
  }

  button(options: {
    id: string;
    label: string;
    style?: ButtonStyle;
    emoji?: string;
    disabled?: boolean;
  }): ButtonBuilder {
    const button = new ButtonBuilder()
      .setCustomId(options.id)
      .setLabel(options.label)
      .setStyle(options.style ?? ButtonStyle.Secondary)
      .setDisabled(options.disabled ?? false);

    if (options.emoji) {
      button.setEmoji(options.emoji);
    }

    return button;
  }

  row(...buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
  }

  screen(options: {
    app: string;
    screen: string;
    title: string;
    description?: string;
    fields?: APIEmbedField[];
    footer?: string;
    buttons?: ButtonBuilder[];
  }): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
    const embed = this.embed({
      title: options.title,
      description: options.description,
      fields: options.fields,
      footer: options.footer ?? `${options.app} / ${options.screen}`
    });

    return {
      embeds: [embed],
      components: options.buttons?.length ? [this.row(...options.buttons.slice(0, 5))] : []
    };
  }

  empty(message = "Nothing here yet."): string {
    return `_${message}_`;
  }

  shortId(): string {
    return Math.random().toString(36).slice(2, 8);
  }
}
