import { PermissionsUtils, Embed, CommandType, Worker } from 'discord-rose'
import { Config } from '../config'

import { Database } from '../structures/Database'
import { Filter, FilterResponse } from '../structures/Filter'
import { ActionBucket } from '../structures/ActionBucket'
import { Responses } from '../structures/Responses'
import { CommandContext, SlashCommandContext } from '../structures/CommandContext'
import { TicketManager } from '../structures/TicketManager'

import { PerspectiveApi } from '../structures/ai/PerspectiveApi'
import { AntiNSFW } from '../structures/ai/AntiNSFW'
import { Ocr } from '../structures/ai/Ocr'

import { PunishmentManager } from '../structures/punishments/PunishmentManager'

import { APIChannel, Snowflake } from 'discord-api-types'
import { Collection } from '@discordjs/collection'

import { ClusterEvents } from '../helpers/ClusterEvents'

import { MessageHandler } from '../filters/Messages'
import { NameHandler } from '../filters/Names'
import { ReactionHandler } from '../filters/Reactions'

import { Interface } from '@jpbbots/interface'

import { Cache } from '@jpbberry/cache'

import util from 'util'
import fetch from 'node-fetch'
import path from 'path'
import { ExceptionType, GuildDB } from 'typings'
import { WorkerEvents } from '../helpers/WorkerEvents'
import { AntiPhish } from '../structures/ai/AntiPhish'

interface CachedThread {
  id: Snowflake
  parentId: Snowflake
  guildId: Snowflake
}

interface ExceptedData {
  roles?: Snowflake[]
  channel?: Snowflake
}

export class WorkerManager extends Worker<{}> {
  config = Config
  filter = new Filter()
  db = new Database()

  actions = new ActionBucket(this)
  responses = new Responses(this)
  tickets = new TicketManager(this)

  perspective = new PerspectiveApi(this)
  images = new AntiNSFW(this)
  ocr = new Ocr(this)
  phishing = new AntiPhish(this)

  punishments = new PunishmentManager(this)

  threads: Collection<Snowflake, CachedThread> = new Collection()

  interface = new Interface()

  snipes: Cache<Snowflake, string> = new Cache(15 * 60 * 1000)

  methods = {
    msg: MessageHandler,
    names: NameHandler,
    react: ReactionHandler
  }

  private readonly _eventHandler = new WorkerEvents(this)
  private readonly _clusterEventHandler = new ClusterEvents(this)

  constructor () {
    super()

    this.interface.setupWorker(this)

    this.setStatus(this.config.custom.status?.[0] ?? 'watching', this.config.custom.status?.[1] ?? 'For Bad Words')

    this.commands
      .options({
        interactionGuild: this.config.staging ? '569907007465848842' : undefined,
        default: {
          myPerms: ['sendMessages', 'embed']
        }
      })
      .error((ctx, err) => {
        if (ctx.myPerms('sendMessages')) {
          if (ctx.isInteraction || ctx.myPerms('embed')) {
            ctx.embed
              .color(0xFF0000)
              .title('An Error Occured')
              .description(`\`\`\`xl\n${err.message}\`\`\``)
              .send(true, false, true).catch(console.error)
          } else {
            ctx
              .send(`An Error Occured\n\`\`\`xl\n${err.message}\`\`\``)
              .catch(() => { })
          }
        }

        if (err.nonFatal) return

        this.logError(err, ctx.command.command)
      })
      .prefix(async (msg): Promise<string | string[]> => {
        const prefix = await this.db.config(msg.guild_id as Snowflake).then(x => x.prefix)
        // @ts-expect-error
        if (!prefix) return null
        return prefix
      })
      .middleware(async (ctx) => {
        if (!ctx.guild) return true
        ctx.db = await this.db.config(ctx.guild.id)

        return true
      })
    this.commands.CommandContext = CommandContext
    this.commands.SlashCommandContext = SlashCommandContext

    this._eventHandler.add(this)
    this._clusterEventHandler.add(this.comms)

    console.log = (...msg: string[]) => this.comms.log(msg.join(' '))

    this.loadCommands()
  }

  public async isAdmin (id: Snowflake): Promise<boolean> {
    return await fetch(`https://jpbbots.org/api/admin/${id}`).then(async x => await x.text()).then(x => !!Number(x))
  }

  public loadCommands (): void {
    console.log('Loading commands')
    if (this.commands.commands) this.commands.commands.clear()

    this.interface.addCommands(this)

    this.commands.load(path.resolve(__dirname, '../commands'))
  }

  getThreadParent (guildId: Snowflake, threadId: Snowflake): APIChannel | undefined {
    const thread = this.threads.get(`${guildId}-${threadId}`)
    if (!thread) return undefined

    return this.channels.get(thread.parentId)
  }

  hasPerms (guildId: Snowflake, perms: keyof typeof PermissionsUtils.bits | Array<keyof typeof PermissionsUtils.bits>, channel?: Snowflake): boolean {
    const guild = this.guilds.get(guildId)
    const member = this.selfMember.get(guildId)
    const roleList = this.guildRoles.get(guildId)
    let overwrites
    if (channel) {
      const c = this.channels.get(channel) ?? this.getThreadParent(guildId, channel)
      if (!c) return false
      overwrites = c.permission_overwrites
    }

    if (!guild || !member || !roleList) return false

    const p = Array.isArray(perms) ? perms : [perms]

    const current = PermissionsUtils.combine({
      guild,
      member,
      roleList,
      overwrites
    })

    return p.every(x => PermissionsUtils.has(current, x))
  }

  isManageable (guildId: Snowflake, user: Snowflake, userRoleIds: Snowflake[], ownerMatters = true): boolean {
    const guild = this.guilds.get(guildId)
    if (!guild) return false

    if (ownerMatters && guild.owner_id === user) return false

    const roles = this.guildRoles.get(guildId)
    if (!roles) return false

    const highestRole = roles.filter(x => userRoleIds.includes(x.id)).sort((a, b) => b.position - a.position).first()
    if (!highestRole) return true

    const self = this.selfMember.get(guildId)
    if (!self) return false

    const myHighestRole = roles.filter(x => self.roles.includes(x.id)).sort((a, b) => b.position - a.position).first()
    if (!myHighestRole) return false

    return myHighestRole.position > highestRole.position
  }

  webhook (wh: keyof typeof Config.webhooks): Embed {
    const webhook = this.config.webhooks[wh]
    return new Embed(async (embed) => {
      return await this.comms.sendWebhook(webhook.id, webhook.token, embed)
    })
  }

  isExcepted (type: ExceptionType, { exceptions }: Pick<GuildDB, 'exceptions'>, data: ExceptedData): boolean {
    return exceptions.some(x => {
      if (x.type === ExceptionType.Everything || x.type === type) {
        if (x.role && data.roles) {
          if (!data.roles?.includes(x.role)) return false
        }

        if (x.channel && data.channel) {
          if (data.channel !== x.channel) return false
        }

        return x.channel ? !!data.channel : true && x.role ? !!data.roles : true
      }

      return false
    })
  }

  test (content: string, db: GuildDB, data: ExceptedData): FilterResponse {
    return this.filter.test(content, db, {
      server: this.isExcepted(ExceptionType.ServerFilter, db, data),
      prebuilt: this.isExcepted(ExceptionType.PreBuiltFilter, db, data)
    })
  }

  // isIgnored (channel: APIChannel, db: GuildDB): boolean {
  //   if (db.channels.includes(channel.id)) return true
  //   if (channel.parent_id && db.categories.includes(channel.parent_id)) return true

  //   return false
  // }

  logError (error: Error, command?: CommandType): void {
    const embed = this.webhook('errors')
      .description(`\`\`\`xl\n${util.inspect(error)}\`\`\``)

    if (command) embed.field('Command', `${command}`, true)

    void embed.send()
  }
}
